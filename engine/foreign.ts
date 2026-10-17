import { book, ownerAccounting, playerWage, wageBudgetMonthly } from './finance';
import { hasProgram, partnerRegion } from './investments';
import { EU_COUNTRIES, FOREIGN_CLUBS, REGION_NAMES } from './names';
import { satisfy } from './ownership';
import { bestEleven, generatePlayer, marketValue, playerAge, squadOf, squadQualityForReputation } from './players';
import { createRng, type Rng } from './rng';
import { directorAbility, scoutingError, type ActionResult } from './staff';
import type { ForeignMarket, ForeignTarget, GameState, Player, Position, ScoutRegion } from './types';
import { budgetRemaining, executeTransfer, monthsUntilContractEnd, playerName, wageBill, weakestPosition } from './transfers';
import { sectionRoomFor } from './wages';
import { logTransfer } from './transferlog';
import { ffpBlocksSigning } from './finplus';
import { addNews, clamp, clubLabel, FOREIGN_PREFIX, hash01, plural, tierOf, transferWindow } from './world';

/**
 * Zahraniční trh: klub platí skautskou síť v regionech a skauti v nich vyhledají hráče.
 * Odhad kvality je nejistý (rozpětí), zpřesní ho sledování, skautské oddělení, ředitel, analytika
 * a partnerský klub. Cizinci se zabydlují (dočasně hrají slabší), hráči mimo EU potřebují pracovní
 * povolení a v kádru jich smí být nejvýš sedm.
 */

export interface RegionInfo {
  label: string;
  note: string;
  /** Roční cena skautské sítě pro klub 1. ligy. */
  annual: number;
  /** Kvalita proti průměru naší základní sestavy. */
  quality: number;
  ages: [number, number];
  /** Násobek tržní hodnoty (kalibrované na českou ligu) v odstupném a tržního platu. Menší ligy prodávají levněji. */
  price: number;
  wage: number;
  /** Počáteční ztráta výkonu při zabydlování. */
  adapt: number;
  /** Násobek nejistoty skautského odhadu. */
  err: number;
  /** Potenciál navíc (mladé talenty). */
  growth: number;
  /** Odměna agentovi jako podíl odstupného. */
  agent: number;
  /** Jen hostování (velké kluby mladé hráče neprodávají). */
  loans?: boolean;
}

export const REGIONS: Record<ScoutRegion, RegionInfo> = {
  okoli: { label: 'Slovensko a Polsko', note: 'levní hráči podobní české lize, rychle se zabydlí', annual: 1_500_000, quality: -1, ages: [20, 29], price: 0.5, wage: 0.8, adapt: 0.03, err: 0.8, growth: 0, agent: 0.08 },
  balkan: { label: 'Balkán', note: 'technicky zdatní hráči, dobrý poměr ceny a výkonu', annual: 2_500_000, quality: 1, ages: [20, 28], price: 0.55, wage: 0.85, adapt: 0.06, err: 1.1, growth: 1, agent: 0.1 },
  sever: { label: 'Skandinávie', note: 'spolehliví profesionálové, ale dražší na platech', annual: 3_000_000, quality: 2, ages: [21, 29], price: 0.65, wage: 1.15, adapt: 0.04, err: 0.9, growth: 0, agent: 0.08 },
  afrika: { label: 'Afrika', note: 'mladí s velkým potenciálem a levným odstupným; delší zabydlování a pracovní povolení', annual: 3_500_000, quality: -3, ages: [18, 22], price: 0.35, wage: 0.7, adapt: 0.12, err: 1.7, growth: 6, agent: 0.15 },
  amerika: { label: 'Jižní Amerika', note: 'talenty s nejvyšším potenciálem; dražší, agenti berou víc', annual: 5_000_000, quality: 0, ages: [18, 23], price: 0.7, wage: 0.95, adapt: 0.1, err: 1.5, growth: 7, agent: 0.15 },
  velke: { label: 'Hostování z velkých lig', note: 'mladí hráči top klubů na hostování s opcí; bez odstupného, po sezóně se vrací', annual: 4_000_000, quality: 4, ages: [19, 22], price: 1.3, wage: 1.2, adapt: 0.05, err: 0.6, growth: 4, agent: 0.03, loans: true },
};

export const REGION_ORDER: ScoutRegion[] = ['okoli', 'balkan', 'sever', 'afrika', 'amerika', 'velke'];
/** Nejvýš tolik hráčů mimo EU smí být v kádru. */
export const NON_EU_LIMIT = 7;
/** Skauti zvládnou podrobně sledovat nejvýš tolik hráčů najednou. */
export const WATCH_LIMIT = 5;
const TARGETS_PER_REGION = 5;

const roundMoney = (v: number, step = 10_000) => Math.round(v / step) * step;

/** Ceny v nižších soutěžích jsou nižší (menší kluby kupují levnější hráče a platí menší sítě). */
export function costScale(tier: number): number {
  return tier === 1 ? 1 : tier === 2 ? 0.4 : tier === 3 ? 0.15 : 0.1;
}

export function foreignMarket(state: GameState): ForeignMarket {
  return state.foreign ?? { networks: [], targets: [] };
}

/** Roční cena skautské sítě v regionu (u partnerského klubu zdarma). */
export function networkAnnual(state: GameState, region: ScoutRegion): number {
  if (partnerRegion(state) === region) return 0;
  return roundMoney(REGIONS[region].annual * costScale(tierOf(state, state.owner.clubId)), 50_000);
}

/** Aktivní regiony: placené sítě a region partnerského klubu. */
export function activeRegions(state: GameState): ScoutRegion[] {
  const out = new Set(foreignMarket(state).networks);
  const partner = partnerRegion(state);
  if (partner) out.add(partner);
  return REGION_ORDER.filter((r) => out.has(r));
}

export function networksMonthly(state: GameState): number {
  return foreignMarket(state).networks.reduce((a, r) => a + networkAnnual(state, r), 0) / 12;
}

// ---------- Hráči na trhu ----------

function ownLevel(state: GameState): number {
  const xi = bestEleven(squadOf(state, state.owner.clubId));
  return xi.length ? xi.reduce((a, p) => a + p.overall, 0) / xi.length : 50;
}

function sellersOf(region: ScoutRegion) {
  return FOREIGN_CLUBS.filter((c) => (region === 'velke' ? c.level <= 2 : c.region === region));
}

/** Vytvoří cizince z regionu (pro trh klubu majitele i pro nákupy ostatních klubů). */
export function makeForeignPlayer(state: GameState, rng: Rng, region: ScoutRegion, quality: number, position?: Position): { player: Player; sellerId: string } {
  const info = REGIONS[region];
  const pos = position ?? rng.pick(['GK', 'DF', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW', 'FW'] as Position[]);
  const age = rng.int(info.ages[0], info.ages[1]);
  // Mladší hráči jsou v generátoru slabší; skauti hledají hráče, kteří už teď na úroveň mají.
  const youth = age < 21 ? (21 - age) * 1.5 : 0;
  const p = generatePlayer(rng, state, { clubId: '', position: pos, season: state.season, quality: quality + youth, age });
  p.potential = Math.min(97, p.potential + info.growth);
  const seller = rng.pick(sellersOf(region));
  const names = REGION_NAMES[region];
  p.firstName = rng.pick(names.first);
  p.lastName = rng.pick(names.last);
  p.nationality = seller.country;
  p.nonEu = !EU_COUNTRIES.has(seller.country);
  p.clubId = FOREIGN_PREFIX + seller.id;
  return { player: p, sellerId: FOREIGN_PREFIX + seller.id };
}

function makeTarget(state: GameState, rng: Rng, region: ScoutRegion): ForeignTarget {
  const info = REGIONS[region];
  const own = state.clubs[state.owner.clubId];
  // Skauti hledají posily kolem úrovně naší sestavy (generátor přidá rozptyl ±5).
  const { player: p, sellerId } = makeForeignPlayer(state, rng, region, ownLevel(state) - 2 + info.quality);
  const value = marketValue(p, state.season) * costScale(tierOf(state, own.id)) ** 0.5;
  const wage = roundMoney(playerWage(p.overall, own.reputation) * info.wage * (0.9 + 0.25 * rng.next()), 1_000);
  p.wage = wage;
  const target: ForeignTarget = { id: `f${++state.nextId}`, region, clubId: sellerId, player: p, fee: 0, wage };
  if (info.loans) target.loan = { fee: roundMoney(value * 0.08), buyOption: roundMoney(value * 1.1, 100_000) };
  // Prodávající cenu odhaduje po svém: výhodné i předražené nabídky jsou součástí rizika.
  else target.fee = roundMoney(value * info.price * (0.8 + 0.45 * rng.next()), value >= 10_000_000 ? 100_000 : 10_000);
  return target;
}

/** Obnova trhu (1. 7. a 1. 12.): sledovaní hráči zůstávají, ostatní nahradí noví. */
export function refreshForeignMarket(state: GameState, rng: Rng, only?: ScoutRegion): void {
  const market = (state.foreign ??= { networks: [], targets: [] });
  const regions = only ? [only] : activeRegions(state);
  if (!only) {
    market.targets = market.targets.filter((t) => t.watching && regions.includes(t.region));
    market.refreshed = state.date;
  }
  for (const region of regions) {
    const have = market.targets.filter((t) => t.region === region).length;
    for (let i = have; i < TARGETS_PER_REGION; i++) market.targets.push(makeTarget(state, rng, region));
  }
}

/** Zapnutí nebo vypnutí skautské sítě v regionu. */
export function setNetwork(prev: GameState, region: ScoutRegion, on: boolean): ActionResult {
  if (prev.owner.ousted) return { state: prev, ok: false, message: 'Klub teď řídí představenstvo.' };
  const state = structuredClone(prev);
  const market = (state.foreign ??= { networks: [], targets: [] });
  if (on) {
    if (!market.networks.includes(region)) market.networks.push(region);
    const rng = createRng(state.rngState ^ (state.nextId * 7919));
    refreshForeignMarket(state, rng, region);
    const message = `Skautská síť ${REGIONS[region].label}: skauti vyhlédli ${plural(TARGETS_PER_REGION, 'hráče', 'hráče', 'hráčů')}. Stojí ${(networkAnnual(state, region) / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} mil. Kč ročně.`;
    return { state, ok: true, message };
  }
  market.networks = market.networks.filter((r) => r !== region);
  if (partnerRegion(state) !== region) market.targets = market.targets.filter((t) => t.region !== region);
  return { state, ok: true, message: `Skautská síť ${REGIONS[region].label} je zrušená.` };
}

export function watchTarget(prev: GameState, id: string, on: boolean): ActionResult {
  const market = foreignMarket(prev);
  if (on && market.targets.filter((t) => t.watching).length >= WATCH_LIMIT) return { state: prev, ok: false, message: `Skauti zvládnou podrobně sledovat nejvýš ${WATCH_LIMIT} hráčů.` };
  const state = structuredClone(prev);
  const t = state.foreign?.targets.find((x) => x.id === id);
  if (!t) return { state: prev, ok: false, message: 'Hráč už není na trhu.' };
  t.watching = on;
  return { state, ok: true, message: on ? `Skauti teď sledují ${playerName(t.player)}. Každý týden se odhad zpřesní.` : `Sledování ${playerName(t.player)} skončilo.` };
}

// ---------- Odhad skautů ----------

/** Nejistota odhadu (± bodů hodnocení). */
export function foreignError(state: GameState, t: ForeignTarget): number {
  let err = Math.max(1.5, scoutingError(state)) * REGIONS[t.region].err;
  err *= Math.max(0.3, 1 - 0.18 * (t.watched ?? 0));
  if (partnerRegion(state) === t.region) err *= 0.5;
  return Math.max(1, err);
}

/** Jak hráče vidí skauti: rozpětí hodnocení a potenciálu (skutečnost v něm vždy leží). */
export function foreignView(state: GameState, t: ForeignTarget): { lo: number; hi: number; est: number; potLo: number; potHi: number } {
  const err = foreignError(state, t);
  const p = t.player;
  const est = p.overall + (hash01(`${t.id}-o`) * 2 - 1) * err * 0.8;
  const pest = p.potential + (hash01(`${t.id}-p`) * 2 - 1) * err * 1.2;
  return {
    lo: Math.min(p.overall, Math.round(est - err)),
    hi: Math.max(p.overall, Math.round(est + err)),
    est: Math.round(est),
    potLo: Math.min(p.potential, Math.round(pest - err * 1.5)),
    potHi: Math.max(p.potential, Math.round(pest + err * 1.5)),
  };
}

// ---------- Cena a podpis ----------

export interface ForeignPrice {
  /** Odstupné (u hostování poplatek za hostování). */
  fee: number;
  agent: number;
  /** Pracovní povolení (hráči mimo EU). */
  permit: number;
  wage: number;
  total: number;
}

export function foreignPrice(state: GameState, t: ForeignTarget): ForeignPrice {
  // Ředitel vyjedná slevu podle svých schopností, partnerský klub dalších 15 %.
  const discount = (1 - clamp((directorAbility(state) - 50) / 400, -0.05, 0.12)) * (partnerRegion(state) === t.region ? 0.85 : 1);
  const fee = t.loan ? t.loan.fee : roundMoney(t.fee * discount);
  const agent = roundMoney(t.loan ? t.loan.buyOption * REGIONS[t.region].agent : fee * REGIONS[t.region].agent);
  const tier = tierOf(state, state.owner.clubId);
  const permit = t.player.nonEu ? (tier === 1 ? 400_000 : tier === 2 ? 150_000 : 60_000) : 0;
  return { fee, agent, permit, wage: t.wage, total: fee + agent + permit };
}

export function nonEuCount(state: GameState): number {
  return squadOf(state, state.owner.clubId).filter((p) => p.nonEu).length;
}

/** Proč hráče teď nejde koupit (nebo undefined). */
export function foreignBlocked(state: GameState, t: ForeignTarget, price = foreignPrice(state, t)): string | undefined {
  const own = state.owner.clubId;
  if (!transferWindow(state.date)) return 'Podepsat lze jen v přestupním okně (od 1. 7. a od 8. 1.).';
  if (squadOf(state, own).length >= 30) return 'Kádr je plný (30 hráčů).';
  const ffp = ffpBlocksSigning(state);
  if (ffp) return ffp;
  if (t.player.nonEu && nonEuCount(state) >= NON_EU_LIMIT) return `V kádru je už ${NON_EU_LIMIT} hráčů mimo EU.`;
  if (price.total > budgetRemaining(state)) return 'Nevejde se do rozpočtu na přestupy.';
  if (wageBill(state, own) + price.wage > wageBudgetMonthly(state.clubs[own]) * 1.05) return 'Plat by překročil mzdový strop.';
  if (sectionRoomFor(state, t.player, price.wage).room < 0) return 'Plat se nevejde do mzdové sekce.';
  return undefined;
}

/** Podpis cizince (mění stav; volá ho majitel i sportovní ředitel). */
function sign(state: GameState, t: ForeignTarget, price: ForeignPrice, byDirector: boolean): string {
  const own = state.owner.clubId;
  const best = Math.max(0, ...bestEleven(squadOf(state, own)).map((p) => p.overall));
  const p = t.player;
  state.players[p.id] = p;
  executeTransfer(state, p, own, price.fee, price.wage, t.loan ? 1 : 4, { loan: !!t.loan });
  if (t.loan) {
    p.contractUntil = state.season + 1;
    p.loan = { fromId: t.clubId, buyOption: t.loan.buyOption };
    if (p.bookValue) p.amortization = p.bookValue / monthsUntilContractEnd(state.date, p.contractUntil);
  }
  const extra = price.agent + price.permit;
  if (price.agent) book(state, own, 'prestupy', -price.agent, `Odměna agentovi: ${playerName(p)}`);
  if (price.permit) book(state, own, 'prestupy', -price.permit, `Pracovní povolení: ${playerName(p)}`);
  ownerAccounting(state).agentFees += extra;
  state.market.spent += extra;
  p.adapt = REGIONS[t.region].adapt;
  p.morale = 65;
  state.foreign!.targets = state.foreign!.targets.filter((x) => x.id !== t.id);
  if (p.overall >= best) state.clubs[own].fanMood = clamp(state.clubs[own].fanMood + 3, 0, 100);
  const what = t.loan ? `na hostování (klub ${clubLabel(state, t.clubId)}, opce ${(t.loan.buyOption / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč)` : `za ${price.fee.toLocaleString('cs-CZ')} Kč (klub ${clubLabel(state, t.clubId)})`;
  const text = `${playerName(p)} (${p.nationality}) přichází ${what}, plat ${price.wage.toLocaleString('cs-CZ')} Kč měsíčně. Odměna agentovi ${price.agent.toLocaleString('cs-CZ')} Kč${price.permit ? `, pracovní povolení ${price.permit.toLocaleString('cs-CZ')} Kč` : ''}. Skutečné hodnocení: ${p.overall}. Prvních pár měsíců se bude zabydlovat.`;
  addNews(state, { kind: 'info', title: `${byDirector ? 'Sportovní ředitel přivedl' : 'Posila ze zahraničí'}: ${playerName(p)}`, text, playerId: p.id });
  return text;
}

export function signForeign(prev: GameState, id: string): ActionResult {
  if (prev.owner.ousted) return { state: prev, ok: false, message: 'Klub teď řídí představenstvo.' };
  const t = foreignMarket(prev).targets.find((x) => x.id === id);
  if (!t) return { state: prev, ok: false, message: 'Hráč už není na trhu.' };
  const blocked = foreignBlocked(prev, t);
  if (blocked) return { state: prev, ok: false, message: blocked };
  const state = structuredClone(prev);
  const target = state.foreign!.targets.find((x) => x.id === id)!;
  const message = sign(state, target, foreignPrice(state, target), false);
  return { state, ok: true, message };
}

/** Využití opce: hostující hráč zůstane natrvalo. */
export function buyLoanee(prev: GameState, playerId: string): ActionResult {
  const p = prev.players[playerId];
  if (!p?.loan || p.clubId !== prev.owner.clubId) return { state: prev, ok: false, message: 'Hráč není na hostování.' };
  if (p.loan.buyOption > budgetRemaining(prev)) return { state: prev, ok: false, message: `Opce stojí ${p.loan.buyOption.toLocaleString('cs-CZ')} Kč, na to rozpočet na přestupy nestačí.` };
  const state = structuredClone(prev);
  const player = state.players[playerId];
  const cost = player.loan!.buyOption;
  book(state, player.clubId, 'prestupy', -cost, `Opce na přestup: ${playerName(player)}`);
  state.market.spent += cost;
  const from = clubLabel(state, player.loan!.fromId);
  const fromId = player.loan!.fromId;
  player.loan = undefined;
  player.contractUntil = state.season + 4;
  player.bookValue = (player.bookValue ?? 0) + cost;
  player.amortization = player.bookValue / monthsUntilContractEnd(state.date, player.contractUntil);
  player.transfers = [...(player.transfers ?? []), { date: state.date, from, to: clubLabel(state, player.clubId), fee: cost }];
  logTransfer(state, player, fromId, player.clubId, cost, fromId.startsWith(FOREIGN_PREFIX) ? 'zahranici' : 'prestup');
  const message = `Klub využil opci: ${playerName(player)} zůstává natrvalo za ${cost.toLocaleString('cs-CZ')} Kč, smlouva do roku ${player.contractUntil}.`;
  addNews(state, { kind: 'info', title: message, playerId });
  return { state, ok: true, message };
}

/** Konec sezóny: hráči na hostování se vracejí. */
export function returnLoans(state: GameState): void {
  const back = Object.values(state.players).filter((p) => p.loan && p.clubId === state.owner.clubId);
  for (const p of back) delete state.players[p.id];
  if (back.length) addNews(state, { kind: 'info', title: `Skončila hostování: ${back.map(playerName).join(', ')}`, text: 'Hráči se vrátili do svých klubů. Opci šlo využít během sezóny.' });
}

// ---------- Průběh ----------

/** Každý týden: sledovaní hráči jsou známější. */
export function weeklyForeign(state: GameState): void {
  for (const t of state.foreign?.targets ?? []) if (t.watching) t.watched = Math.min(5, (t.watched ?? 0) + 1);
}

/** Každý měsíc: poplatky za sítě, zabydlování cizinců a nálada fanoušků. */
export function monthlyForeign(state: GameState): void {
  const own = state.owner.clubId;
  const cost = networksMonthly(state);
  if (cost > 0) book(state, own, 'skautsit', -cost, `Zahraniční skauting (${foreignMarket(state).networks.map((r) => REGIONS[r].label).join(', ')})`);
  const byClub = new Map<string, Player[]>();
  for (const p of Object.values(state.players)) if (p.nationality) byClub.set(p.clubId, [...(byClub.get(p.clubId) ?? []), p]);
  const integration = hasProgram(state, 'integrace');
  for (const p of Object.values(state.players)) {
    if (!p.adapt) continue;
    const compatriot = (byClub.get(p.clubId) ?? []).some((x) => x.id !== p.id && x.nationality === p.nationality);
    const step = 0.025 * (compatriot ? 1.5 : 1) * (integration && p.clubId === own ? 1.6 : 1);
    p.adapt = Math.max(0, p.adapt - step);
    if (p.adapt <= 0) p.adapt = undefined;
  }
  // Fanoušci a patrioti nesou nelibě sestavu plnou cizinců.
  const foreigners = bestEleven(squadOf(state, own)).filter((p) => p.nationality).length;
  if (foreigners >= 7) {
    state.clubs[own].fanMood = clamp(state.clubs[own].fanMood - 0.4 * (foreigners - 6), 0, 100);
    satisfy(state, -0.3, ['patriot']);
  }
}

/** Nejlepší cizinec, kterého by koupil sportovní ředitel na dané místo (podle odhadu skautů). */
export function directorForeignPick(state: GameState, position: Position, bar: number, remaining: number): { target: ForeignTarget; price: ForeignPrice; est: number } | undefined {
  const club = state.clubs[state.owner.clubId];
  if (club.policy.directorMarket !== 'zahranici') return undefined;
  return foreignMarket(state)
    .targets.filter((t) => t.player.position === position && playerAge(t.player, state.season) <= 28)
    .map((t) => ({ target: t, price: foreignPrice(state, t), est: foreignView(state, t).est }))
    .filter((x) => x.est >= bar + 4 && x.price.total <= remaining * 0.6 && !foreignBlocked(state, x.target, x.price))
    .sort((a, b) => b.est - a.est || a.price.total - b.price.total)[0];
}

export function directorSignForeign(state: GameState, target: ForeignTarget, price: ForeignPrice): void {
  sign(state, target, price, true);
}

/**
 * Bohaté kluby ligy také kupují v cizině: posilují nejslabší místo sestavy hráčem lepším,
 * než by sehnaly doma. Liga tak drží krok s majitelem, který investuje.
 */
export function aiForeignSignings(state: GameState, rng: Rng): void {
  if (!transferWindow(state.date)) return;
  const own = state.owner.clubId;
  const deals: string[] = [];
  const ownComp = Object.values(state.competitions).find((c) => c.clubIds.includes(own));
  for (const comp of Object.values(state.competitions)) {
    if (comp.tier > 2) continue;
    for (const clubId of comp.clubIds) {
      const club = state.clubs[clubId];
      // 1. liga: zhruba 1–3 cizinci na klub za sezónu, 2. liga méně.
      if (clubId === own || club.reserveOf || !rng.chance(comp.tier === 1 ? 0.16 : 0.06)) continue;
      const budget = club.policy.transferBudget * 1.6 - (club.transferSpent ?? 0);
      if (budget <= 0) continue;
      const squad = squadOf(state, clubId);
      const { position, bar } = weakestPosition(squad);
      const region = rng.pick(REGION_ORDER.filter((r) => r !== 'velke'));
      const quality = Math.min(bar + rng.int(3, 7), squadQualityForReputation(club.reputation) + 8);
      const { player: p } = makeForeignPlayer(state, rng, region, quality, position);
      let fee = roundMoney(marketValue(p, state.season) * REGIONS[region].price * 0.9);
      // Na drahého hráče nemá: část cizinců ale přichází zadarmo (konec smlouvy) nebo za symbolickou částku.
      if (fee > budget || fee > Math.max(0, club.finance.balance) * 0.6) {
        if (!rng.chance(0.5)) continue;
        fee = 0;
      }
      state.players[p.id] = p;
      executeTransfer(state, p, clubId, fee, playerWage(p.overall, club.reputation), rng.int(2, 4));
      p.adapt = REGIONS[region].adapt;
      club.transferSpent = (club.transferSpent ?? 0) + fee;
      if (squad.length >= 25) {
        const weakest = squad.filter((x) => x.position === position).sort((a, b) => a.overall - b.overall)[0];
        if (weakest) weakest.clubId = '';
      }
      if (comp === ownComp && fee >= 5_000_000) deals.push(`${playerName(p)} (${p.nationality}) → ${club.shortName} za ${(fee / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`);
    }
  }
  if (deals.length) addNews(state, { kind: 'info', title: `Soupeři nakupují v cizině: ${plural(deals.length, 'posila', 'posily', 'posil')}`, text: deals.join(' · ') });
}
