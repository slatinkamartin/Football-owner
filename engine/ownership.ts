import { addDays } from './calendar';
import { annualCosts, balanceSheet, book, ownerAccounting, profitAndLoss } from './finance';
import { playerAge, squadOf } from './players';
import type { Rng } from './rng';
import { goalTarget, ownPosition, type ActionResult } from './staff';
import { playerValue } from './transfers';
import type { GameState, Shareholder, ShareholderKind } from './types';
import { addNews, clamp, tierOf } from './world';

/**
 * Spolumajitelé: akcionáři s vlastními zájmy, hlasování o velkých rozhodnutích,
 * valná hromada s dividendou a hlasováním o důvěře, odvolání majitele a cesta zpět.
 */

export const KIND_LABEL: Record<ShareholderKind, string> = {
  investor: 'Finanční investor',
  patriot: 'Místní patriot',
  spekulant: 'Spekulant',
  mesto: 'Město',
};

export const KIND_WANTS: Record<ShareholderKind, string> = {
  investor: 'zisk a dividendy',
  patriot: 'výsledky, mládež a spokojené fanoušky',
  spekulant: 'růst hodnoty klubu a výhodné prodeje',
  mesto: 'spokojené fanoušky, mládež a čisté jméno',
};

const NAMES: Record<ShareholderKind, string[]> = {
  investor: ['Moravia Capital', 'Penta Sport Invest', 'Danube Equity', 'Bohemia Holding'],
  patriot: ['Jiří Novotný', 'Karel Svoboda', 'Pavel Dvořák', 'Zdeněk Horák'],
  spekulant: ['Global Sport Ventures', 'Atlas Football Group', 'Northstar Partners'],
  mesto: ['Statutární město', 'Město'],
};

/** Rozdělení zbytku akcií mezi 1–3 spolumajitele při založení hry. */
export function createShareholders(state: GameState, rng: Rng, ownerShare: number): Shareholder[] {
  const rest = Math.round((1 - ownerShare) * 100) / 100;
  if (rest <= 0) return [];
  const club = state.clubs[state.owner.clubId];
  const kinds: ShareholderKind[] = rest >= 0.5 ? ['investor', 'patriot', 'mesto'] : rest >= 0.3 ? ['investor', 'patriot'] : ['patriot'];
  const weights = kinds.map(() => 0.6 + rng.next() * 0.8);
  const sum = weights.reduce((a, b) => a + b, 0);
  let left = rest;
  return kinds.map((kind, i) => {
    const share = i === kinds.length - 1 ? left : Math.round((rest * weights[i]) / sum * 100) / 100;
    left = Math.round((left - share) * 100) / 100;
    const name = kind === 'mesto' ? `${rng.pick(NAMES.mesto)} ${club.city}` : rng.pick(NAMES[kind]);
    return { id: `a${++state.nextId}`, name, kind, share, satisfaction: 55 + Math.round(rng.normal(0, 5)) };
  });
}

// ---------- Hodnota klubu ----------

/** Odhad tržní hodnoty klubu: kádr, majetek, stadion, značka, hotovost minus dluhy. */
export function clubValuation(state: GameState): number {
  const club = state.clubs[state.owner.clubId];
  const squad = squadOf(state, club.id).reduce((a, p) => a + playerValue(state, p), 0);
  const sheet = balanceSheet(state);
  const brand = 2_000_000 * Math.pow(1.06, club.reputation - 50) * (tierOf(state, club.id) === 1 ? 3 : 1);
  const value = squad * 0.6 + sheet.buildings + club.stadium.capacity * 15_000 + brand + sheet.cash - sheet.debt;
  return Math.max(5_000_000, Math.round(value / 1_000_000) * 1_000_000);
}

/**
 * V4: hodnota libovolného klubu (pro kupní cenu před začátkem hry). Bez dluhů a staveb (na začátku
 * žádné nejsou), hotovost podle zadané částky (startovní peníze klubu podle obtížnosti).
 */
export function clubValuationOf(state: GameState, clubId: string, cash: number): number {
  const club = state.clubs[clubId];
  const squad = squadOf(state, clubId).reduce((a, p) => a + playerValue(state, p), 0);
  const brand = 2_000_000 * Math.pow(1.06, club.reputation - 50) * (tierOf(state, clubId) === 1 ? 3 : 1);
  const value = squad * 0.6 + club.stadium.capacity * 15_000 + brand + Math.max(0, cash);
  return Math.max(5_000_000, Math.round(value / 1_000_000) * 1_000_000);
}

export function othersShare(state: GameState): number {
  return state.shareholders.reduce((a, s) => a + s.share, 0);
}

/** Vážená spokojenost spolumajitelů (100, když žádní nejsou). */
export function shareholderConfidence(state: GameState): number {
  const total = othersShare(state);
  if (total <= 0) return 100;
  return state.shareholders.reduce((a, s) => a + s.satisfaction * s.share, 0) / total;
}

// ---------- Hlasování ----------

export type VoteTopic = 'uver' | 'stavba' | 'navyseni';

const BIAS: Record<ShareholderKind, Record<VoteTopic, number>> = {
  investor: { uver: -8, stavba: 0, navyseni: 10 },
  patriot: { uver: -4, stavba: 10, navyseni: 5 },
  spekulant: { uver: 6, stavba: -6, navyseni: 0 },
  mesto: { uver: -10, stavba: 15, navyseni: 5 },
};

export interface VotePreview {
  needed: boolean;
  threshold: number;
  yes: number;
  passes: boolean;
  votes: { name: string; share: number; yes: boolean }[];
  label: string;
}

/** Kolik hlasů je potřeba: velké stavby a navýšení kapitálu 2/3, úvěry a středně velké stavby nadpoloviční většina. */
export function voteThreshold(topic: VoteTopic, amount: number): number {
  if (topic === 'navyseni') return 2 / 3;
  if (topic === 'uver') return 0.5;
  if (amount >= 50_000_000) return 2 / 3;
  if (amount >= 20_000_000) return 0.5;
  return 0;
}

export function previewVote(state: GameState, topic: VoteTopic, amount: number): VotePreview {
  const threshold = voteThreshold(topic, amount);
  const label = threshold > 0.6 ? 'dvoutřetinová většina' : 'nadpoloviční většina';
  if (!state.shareholders.length || threshold === 0) return { needed: false, threshold, yes: 1, passes: true, votes: [], label };
  const votes = [
    { name: 'Vy', share: state.owner.share, yes: true },
    ...state.shareholders.map((s) => ({ name: s.name, share: s.share, yes: s.satisfaction + BIAS[s.kind][topic] >= 50 })),
  ];
  const yes = votes.filter((v) => v.yes).reduce((a, v) => a + v.share, 0);
  return { needed: true, threshold, yes, passes: yes > threshold + 1e-9, votes, label };
}

/** Výsledek hlasování jako text pro zprávu. */
export function voteMessage(v: VotePreview): string {
  return `Pro ${Math.round(v.yes * 100)} %, potřeba víc než ${Math.round(v.threshold * 100)} % (${v.label}).`;
}

// ---------- Obchod s akciemi ----------

/** Za kolik je spolumajitel ochoten prodat (násobek tržní ceny), nebo null, pokud neprodá. */
export function sellPremium(s: Shareholder): number | null {
  const base = { investor: 1.15, patriot: 1.3, spekulant: 1.08, mesto: 1.4 }[s.kind];
  if (s.kind === 'mesto' && s.satisfaction >= 60) return null;
  // Spokojení akcionáři nechtějí prodávat, nespokojení rádi odejdou.
  return Math.round((base + (s.satisfaction - 50) / 200) * 100) / 100;
}

export function sharePrice(state: GameState, s: Shareholder, fraction: number): number | null {
  const premium = sellPremium(s);
  if (premium === null) return null;
  return Math.round((clubValuation(state) * fraction * premium) / 100_000) * 100_000;
}

export function buyShares(prev: GameState, shareholderId: string, fraction: number): ActionResult {
  const s0 = prev.shareholders.find((s) => s.id === shareholderId);
  if (!s0) return { state: prev, ok: false, message: 'Akcionář neexistuje.' };
  const part = Math.min(fraction, s0.share);
  if (part <= 0) return { state: prev, ok: false, message: 'Není co kupovat.' };
  const price = sharePrice(prev, s0, part);
  if (price === null) return { state: prev, ok: false, message: `${s0.name} teď akcie neprodává.` };
  if (price > prev.owner.wallet) return { state: prev, ok: false, message: `Na nákup potřebujete ${price.toLocaleString('cs-CZ')} Kč osobních peněz.` };
  const state = structuredClone(prev);
  const s = state.shareholders.find((x) => x.id === shareholderId)!;
  state.owner.wallet -= price;
  state.owner.share = Math.round((state.owner.share + part) * 1000) / 1000;
  s.share = Math.round((s.share - part) * 1000) / 1000;
  state.shareholders = state.shareholders.filter((x) => x.share > 0.0005);
  let message = `Získáváte ${Math.round(part * 100)} % klubu za ${price.toLocaleString('cs-CZ')} Kč (prodávající: ${s.name}). Váš podíl je ${Math.round(state.owner.share * 100)} %.`;
  if (state.owner.ousted && !state.owner.ousted.banUntil && state.owner.share > 0.5) {
    state.owner.ousted = undefined;
    message += ' S většinou v rukou se vracíte do vedení klubu.';
  }
  addNews(state, { kind: 'info', title: 'Nákup akcií', text: message });
  return { state, ok: true, message };
}

/** Navýšení kapitálu: majitel vloží peníze a dostane nové akcie za tržní cenu, ostatní se zředí. */
export function increaseCapital(prev: GameState, amount: number): ActionResult {
  const value = Math.floor(amount);
  if (value <= 0 || value > prev.owner.wallet) return { state: prev, ok: false, message: 'Na to nemáte dost osobních peněz.' };
  const vote = previewVote(prev, 'navyseni', value);
  if (vote.needed && !vote.passes) return { state: prev, ok: false, message: `Akcionáři navýšení kapitálu neschválili. ${voteMessage(vote)}` };
  const state = structuredClone(prev);
  const v = clubValuation(state);
  const total = v + value;
  state.owner.share = Math.round(((state.owner.share * v + value) / total) * 1000) / 1000;
  for (const s of state.shareholders) s.share = Math.round(((s.share * v) / total) * 1000) / 1000;
  state.owner.wallet -= value;
  book(state, state.owner.clubId, 'vklad', value, 'Navýšení základního kapitálu');
  const message = `Kapitál navýšen o ${value.toLocaleString('cs-CZ')} Kč. Váš podíl je teď ${Math.round(state.owner.share * 100)} %.`;
  addNews(state, { kind: 'info', title: 'Navýšení kapitálu', text: message });
  return { state, ok: true, message };
}

/** Prodej části podílu novému investorovi (za 90 % tržní ceny). Prodej všeho hru ukončí. */
export function sellStake(prev: GameState, fraction: number): ActionResult {
  const part = Math.min(fraction, prev.owner.share);
  if (part <= 0) return { state: prev, ok: false, message: 'Nemáte co prodat.' };
  const state = structuredClone(prev);
  const price = Math.round((clubValuation(state) * part * 0.9) / 100_000) * 100_000;
  state.owner.wallet += price;
  state.owner.share = Math.round((state.owner.share - part) * 1000) / 1000;
  const buyer = state.shareholders.find((s) => s.kind === 'spekulant') ?? {
    id: `a${++state.nextId}`,
    name: NAMES.spekulant[state.nextId % NAMES.spekulant.length],
    kind: 'spekulant' as const,
    share: 0,
    satisfaction: 55,
  };
  if (!state.shareholders.includes(buyer)) state.shareholders.push(buyer);
  buyer.share = Math.round((buyer.share + part) * 1000) / 1000;
  const club = state.clubs[state.owner.clubId];
  let message = `Společnost ${buyer.name} od vás kupuje ${Math.round(part * 100)} % klubu za ${price.toLocaleString('cs-CZ')} Kč.`;
  if (state.owner.share <= 0.0005) {
    state.owner.share = 0;
    state.gameOver = {
      date: state.date,
      kind: 'prodej',
      reason: `Celý ${club.name} má nového majitele. Odcházíte s osobním majetkem ${(state.owner.wallet + (state.business?.safe ?? 0) + (state.business?.risky ?? 0)).toLocaleString('cs-CZ')} Kč.`,
    };
    message = state.gameOver.reason;
  } else if (!state.owner.ousted && state.owner.share < 0.5 && othersShare(state) > 0.5) {
    message += ' Pozor: už nemáte většinu, valná hromada vás může odvolat.';
  }
  addNews(state, { kind: 'info', title: 'Prodej akcií', text: message });
  return { state, ok: true, message };
}

// ---------- Spokojenost ----------

/** Měsíčně: spokojenost spolumajitelů podle toho, na čem jim záleží. */
export function monthlyShareholders(state: GameState, rng: Rng): void {
  if (!state.shareholders.length) return;
  const club = state.clubs[state.owner.clubId];
  const tier = tierOf(state, club.id);
  const costs = annualCosts(club, tier);
  const pnl = profitAndLoss(club.finance.season, ownerAccounting(state)).beforeTax;
  const profit = clamp((pnl / costs) * 150, -25, 25);
  const value = clubValuation(state);
  const growth = clamp(((value - (state.owner.valuationStart ?? value)) / Math.max(1, state.owner.valuationStart ?? value)) * 120, -25, 25);
  const pos = ownPosition(state);
  const results = pos && pos.played >= 3 ? clamp((goalTarget(state.owner.seasonGoal, pos.comp) - pos.position) * 4, -25, 20) : 0;
  const youth = squadOf(state, club.id).filter((p) => playerAge(p, state.season) <= 21 && p.starts > 0).length * 1.5 + club.facilities.academy * 2 - 6;
  const fans = (club.fanMood - 50) * 0.4;
  const media = (state.owner.media - 50) * 0.15;
  const scandal = state.grey.scandalUntil && state.grey.scandalUntil > state.date ? -20 : 0;
  const sales = clamp(state.market.earned / Math.max(1, costs) * 30, 0, 15);
  for (const s of state.shareholders) {
    let target = 50 + media + scandal;
    if (s.kind === 'investor') target += profit + growth * 0.5;
    if (s.kind === 'patriot') target += results + youth * 0.5 + fans;
    if (s.kind === 'spekulant') target += growth + sales;
    if (s.kind === 'mesto') target += fans + youth * 0.5 + scandal * 0.5;
    // Odvolaného majitele časem začnou postrádat (hlavně když se nedaří).
    if (state.owner.ousted) target += 8 - results * 0.5;
    s.satisfaction = clamp(s.satisfaction + (clamp(target, 0, 100) - s.satisfaction) * 0.2 + rng.normal(0, 1.5), 0, 100);
  }
  const conf = shareholderConfidence(state);
  if (!state.owner.ousted && othersShare(state) > 0.5 && conf < 38 && state.date.slice(5, 7) !== '06') {
    addNews(state, {
      kind: 'varovani',
      title: 'Spolumajitelé jsou nespokojení',
      text: `Vážená spokojenost akcionářů je ${Math.round(conf)}. Pod 30 vás valná hromada v červnu může odvolat.`,
    });
  }
}

export function satisfy(state: GameState, delta: number, kinds?: ShareholderKind[]): void {
  for (const s of state.shareholders) if (!kinds || kinds.includes(s.kind)) s.satisfaction = clamp(s.satisfaction + delta, 0, 100);
}

// ---------- Valná hromada ----------

/** Zisk sezóny, ze kterého se dá vyplatit dividenda. */
export function distributableProfit(state: GameState): number {
  const club = state.clubs[state.owner.clubId];
  const pnl = profitAndLoss(club.finance.season, ownerAccounting(state)).beforeTax;
  return Math.max(0, Math.min(pnl, club.finance.balance));
}

/** Výplata dividendy z peněz klubu: každý dostane podle podílu. */
export function payDividend(state: GameState, total: number): void {
  if (total <= 0) return;
  book(state, state.owner.clubId, 'vklad', -total, state.shareholders.length ? 'Výplata dividendy akcionářům' : 'Výběr zisku majitelem');
  state.owner.wallet += Math.round(total * state.owner.share);
}

/** Hlasování o důvěře na valné hromadě. */
export function confidenceVote(state: GameState, dividend: number): void {
  // Bez spolumajitelů žádná valná hromada není.
  if (!state.shareholders.length && !state.owner.ousted) return;
  const confidence = Math.round(shareholderConfidence(state));
  const canOust = othersShare(state) > 0.5;
  const ousted = !state.owner.ousted && canOust && confidence < 30;
  state.agm.push({ date: state.date, dividend, confidence, ousted });
  if (ousted) {
    state.owner.ousted = { since: state.date };
    addNews(state, {
      kind: 'varovani',
      title: 'Valná hromada vás odvolala z vedení klubu',
      text: `Spokojenost akcionářů byla jen ${confidence}. Zůstáváte akcionářem s podílem ${Math.round(state.owner.share * 100)} %, ale klub teď řídí představenstvo. Zpět se můžete vrátit nákupem většiny, mimořádnou valnou hromadou nebo když vás akcionáři sami zavolají.`,
    });
  } else if (state.shareholders.length) {
    addNews(state, {
      kind: 'info',
      title: `Valná hromada: důvěra ${confidence} %`,
      text: canOust && confidence < 40 ? 'Důvěra je těsná. Příští rok by to nemuselo vyjít.' : 'Akcionáři vedení klubu potvrdili.',
    });
  }
}

/** Mimořádná valná hromada o návratu do vedení (nejvýš jednou za půl roku). */
export function extraordinaryAgmAvailableFrom(state: GameState): string | null {
  const o = state.owner.ousted;
  if (!o) return null;
  if (o.banUntil) return o.banUntil;
  const from = addDays(o.lastAttempt ?? o.since, 182);
  return from > state.date ? from : null;
}

export function callExtraordinaryAgm(prev: GameState): ActionResult {
  if (!prev.owner.ousted) return { state: prev, ok: false, message: 'Klub řídíte.' };
  const wait = extraordinaryAgmAvailableFrom(prev);
  if (wait) return { state: prev, ok: false, message: `Mimořádnou valnou hromadu můžete svolat až od ${wait.split('-').reverse().join('. ')}.` };
  const state = structuredClone(prev);
  state.owner.ousted!.lastAttempt = state.date;
  const yes = state.owner.share + state.shareholders.filter((s) => s.satisfaction >= 50).reduce((a, s) => a + s.share, 0);
  let message: string;
  if (yes > 0.5) {
    state.owner.ousted = undefined;
    message = `Mimořádná valná hromada vás vrátila do vedení klubu (pro ${Math.round(yes * 100)} %).`;
  } else {
    satisfy(state, -3);
    message = `Návrh neprošel, pro bylo jen ${Math.round(yes * 100)} %. Další pokus za půl roku.`;
  }
  addNews(state, { kind: yes > 0.5 ? 'info' : 'varovani', title: 'Mimořádná valná hromada', text: message });
  return { state, ok: yes > 0.5, message };
}

export function campaignCost(state: GameState): number {
  const club = state.clubs[state.owner.clubId];
  return Math.max(500_000, Math.round((annualCosts(club, tierOf(state, club.id)) * 0.02) / 100_000) * 100_000);
}

export function campaignAvailableFrom(state: GameState): string | null {
  if (!state.owner.lastCampaign) return null;
  const from = addDays(state.owner.lastCampaign, 60);
  return from > state.date ? from : null;
}

/** Mediální kampaň z osobních peněz: zlepší pověst u médií, fanoušků, patriotů a města. */
export function mediaCampaign(prev: GameState): ActionResult {
  const cost = campaignCost(prev);
  if (cost > prev.owner.wallet) return { state: prev, ok: false, message: 'Na kampaň nemáte dost osobních peněz.' };
  const wait = campaignAvailableFrom(prev);
  if (wait) return { state: prev, ok: false, message: `Další kampaň má smysl až od ${wait.split('-').reverse().join('. ')}.` };
  const state = structuredClone(prev);
  state.owner.wallet -= cost;
  state.owner.lastCampaign = state.date;
  state.owner.media = clamp(state.owner.media + 8, 0, 100);
  const club = state.clubs[state.owner.clubId];
  club.fanMood = clamp(club.fanMood + 5, 0, 100);
  satisfy(state, 8, ['patriot', 'mesto']);
  satisfy(state, 3, ['investor', 'spekulant']);
  const message = `Kampaň za ${cost.toLocaleString('cs-CZ')} Kč: média +8, fanoušci +5, patrioti a město výrazně spokojenější.`;
  addNews(state, { kind: 'info', title: 'Mediální kampaň majitele', text: message });
  return { state, ok: true, message };
}

/** Odvolaný majitel: představenstvo kryje ztráty vklady ostatních akcionářů, a tím majitele ředí. */
export function boardCoversLoss(state: GameState): void {
  const club = state.clubs[state.owner.clubId];
  if (!state.owner.ousted || club.finance.balance >= 0) return;
  if (!state.shareholders.length) {
    // Jediný vlastník se zákazem činnosti: správce použije jeho peníze.
    const need = Math.min(state.owner.wallet, Math.round(-club.finance.balance + annualCosts(club, tierOf(state, club.id)) * 0.05));
    if (need > 0) {
      state.owner.wallet -= need;
      book(state, club.id, 'vklad', need, 'Vklad majitele (správce klubu)');
      club.finance.monthsNegative = 0;
    }
    return;
  }
  const amount = Math.round(-club.finance.balance + annualCosts(club, tierOf(state, club.id)) * 0.05);
  const v = clubValuation(state);
  const total = v + amount;
  const others = othersShare(state);
  state.owner.share = Math.round(((state.owner.share * v) / total) * 1000) / 1000;
  for (const s of state.shareholders) s.share = Math.round(((s.share * v + (amount * s.share) / others) / total) * 1000) / 1000;
  book(state, club.id, 'vklad', amount, 'Vklad spolumajitelů (představenstvo)');
  club.finance.monthsNegative = 0;
  addNews(state, {
    kind: 'varovani',
    title: 'Spolumajitelé dorovnali ztrátu',
    text: `Představenstvo získalo od akcionářů ${amount.toLocaleString('cs-CZ')} Kč. Váš podíl klesl na ${Math.round(state.owner.share * 100)} %.`,
  });
}

/** Klub, který majitel neřídí, nesmí upravovat. */
export function ownerBlocked(state: GameState): string | null {
  const o = state.owner.ousted;
  if (!o) return null;
  return o.banUntil
    ? `Máte zákaz činnosti ve fotbale do ${o.banUntil.split('-').reverse().join('. ')}. Klub zatím řídí představenstvo.`
    : 'Valná hromada vás odvolala z vedení klubu. Klub řídí představenstvo, vy jste jen akcionář.';
}
