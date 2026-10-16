import { forecastSeason, operatingActual } from './budget';
import { annualCosts, balanceSheet, book } from './finance';
import { startBigProject } from './investments';
import { satisfy } from './ownership';
import { playerAge, squadOf } from './players';
import type { Rng } from './rng';
import { strictnessFactor } from './settings';
import { contracts } from './sponsors';
import type { BudgetPlan, GameEvent, GameState, SponsorSlot } from './types';
import { addNews, clamp, competitionOf, tierOf } from './world';

/**
 * Finance, které se hrají: vedlejší cíle sezóny, scénáře „co když“, rating hospodaření,
 * finanční fair play svazu, sponzoři s aktivacemi a finanční šoky jako situace k rozhodnutí.
 */

const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;
const own = (s: GameState) => s.clubs[s.owner.clubId];
const roundM = (v: number, step = 50_000) => Math.max(step, Math.round(v / step) * step);

// ---------- Vedlejší cíle sezóny ----------

export type SideGoalKind = 'navsteva' | 'odchovanci' | 'zisk' | 'domaci';

export interface SideGoal {
  kind: SideGoalKind;
  giver: 'sponzor' | 'mesto' | 'akcionari';
  label: string;
  target: number;
  reward: number;
  done?: 'splneno' | 'nesplneno';
}

const GIVER_LABEL = { sponzor: 'Generální partner', mesto: 'Město', akcionari: 'Akcionáři' };
export { GIVER_LABEL };

/** Začátek sezóny: tři vedlejší cíle od sponzora, města a akcionářů. */
export function createSideGoals(state: GameState): void {
  const club = own(state);
  const tier = tierOf(state, club.id);
  const costs = annualCosts(club, tier);
  const homeAvg = Math.round((Math.min(club.stadium.capacity, 150 * Math.pow(1.06, club.reputation) * (tier === 1 ? 1 : tier === 2 ? 0.55 : 0.45)) * 1.05) / 100) * 100;
  const goals: SideGoal[] = [
    { kind: 'navsteva', giver: 'sponzor', label: `Průměrná návštěva doma aspoň ${homeAvg.toLocaleString('cs-CZ')} diváků`, target: homeAvg, reward: roundM(costs * 0.012) },
    { kind: 'odchovanci', giver: 'mesto', label: 'Hráči do 21 let odehrají aspoň 1 500 minut', target: 1500, reward: roundM(costs * 0.008) },
    { kind: 'zisk', giver: 'akcionari', label: 'Provozní výsledek sezóny aspoň nula', target: 0, reward: 0 },
  ];
  state.sideGoals = { season: state.season, goals };
}

/** Průběžné plnění (0–1) a text. */
export function sideGoalProgress(state: GameState, g: SideGoal): { value: number; text: string; ratio: number } {
  const ownId = state.owner.clubId;
  if (g.kind === 'navsteva') {
    const comp = competitionOf(state, ownId);
    const home = comp?.fixtures.filter((f) => f.homeId === ownId && f.result) ?? [];
    const avg = home.length ? home.reduce((a, f) => a + f.result!.attendance, 0) / home.length : 0;
    return { value: avg, text: home.length ? `zatím ${Math.round(avg).toLocaleString('cs-CZ')} v průměru` : 'zatím žádný domácí zápas', ratio: avg / g.target };
  }
  if (g.kind === 'odchovanci') {
    const minutes = squadOf(state, ownId).filter((p) => playerAge(p, state.season) <= 21).reduce((a, p) => a + p.minutes, 0);
    return { value: minutes, text: `zatím ${minutes.toLocaleString('cs-CZ')} minut`, ratio: minutes / g.target };
  }
  const plan = forecastSeason(state);
  return { value: plan.result, text: `výhled ${mil(plan.result)} (zatím ${mil(operatingActual(state))})`, ratio: plan.result >= 0 ? 1 : 0.5 };
}

/** Konec sezóny: vyhodnocení vedlejších cílů. */
export function settleSideGoals(state: GameState): void {
  const sg = state.sideGoals;
  if (!sg || sg.season !== state.season) return;
  const ownId = state.owner.clubId;
  const lines: string[] = [];
  for (const g of sg.goals) {
    const ok = g.kind === 'zisk' ? operatingActual(state) >= 0 : sideGoalProgress(state, g).value >= g.target;
    g.done = ok ? 'splneno' : 'nesplneno';
    if (g.giver === 'sponzor') {
      if (ok) book(state, ownId, 'komercni', g.reward, 'Bonus generálního partnera za návštěvnost');
      changeSponsorRelation(state, 'generalni', ok ? 10 : -6);
    }
    if (g.giver === 'mesto') {
      if (ok) book(state, ownId, 'ostatni', g.reward, 'Příspěvek města na mládež');
      satisfy(state, ok ? 5 : -3, ['mesto', 'patriot']);
    }
    if (g.giver === 'akcionari') satisfy(state, ok ? 6 : -5, ['investor', 'spekulant']);
    lines.push(`${GIVER_LABEL[g.giver]}: ${g.label} ${ok ? 'splněno' : 'nesplněno'}${ok && g.reward ? ` (+${mil(g.reward)})` : ''}`);
  }
  addNews(state, { kind: 'sezona', title: `Vedlejší cíle sezóny: splněno ${sg.goals.filter((g) => g.done === 'splneno').length} ze ${sg.goals.length}`, text: lines.join(' · ') });
}

// ---------- Scénáře „co když“ ----------

export type ScenarioKind = 'prodej' | 'mzdy' | 'stadion' | 'krize';
export const SCENARIO_LABEL: Record<ScenarioKind, string> = {
  prodej: 'Prodej nejlepšího hráče',
  mzdy: 'Mzdový strop o 20 % vyšší',
  stadion: 'Zahájit stavbu nového stadionu',
  krize: 'Krize: nálada fanoušků −25',
};

export interface Scenario {
  kind: ScenarioKind;
  label: string;
  note: string;
  plan?: BudgetPlan;
  blocked?: string;
}

/** Výhled sezóny v alternativní situaci (nic se neukládá). */
export function scenarioPlans(state: GameState): Scenario[] {
  const out: Scenario[] = [];
  const ownId = state.owner.clubId;
  {
    const s = structuredClone(state);
    const star = squadOf(s, ownId).sort((a, b) => b.overall - a.overall)[0];
    if (star) {
      const price = Math.round(estimateSale(s, star.id));
      delete s.players[star.id];
      book(s, ownId, 'prestupy', price, `Scénář: prodej ${star.firstName} ${star.lastName}`);
      out.push({ kind: 'prodej', label: SCENARIO_LABEL.prodej, note: `${star.firstName} ${star.lastName} odejde asi za ${mil(price)}. Kádr bude slabší.`, plan: forecastSeason(s) });
    }
  }
  {
    const s = structuredClone(state);
    own(s).policy.wageMultiplier = Math.min(2, own(s).policy.wageMultiplier * 1.2);
    out.push({ kind: 'mzdy', label: SCENARIO_LABEL.mzdy, note: 'Počítá se s využitím celého vyššího stropu (silnější kádr, vyšší náklady).', plan: forecastSeason(s) });
  }
  {
    const r = startBigProject(state, 'stadion');
    out.push(r.ok ? { kind: 'stadion', label: SCENARIO_LABEL.stadion, note: 'Splátky stavby v této sezóně, bez investičního úvěru.', plan: forecastSeason(r.state) } : { kind: 'stadion', label: SCENARIO_LABEL.stadion, note: '', blocked: r.message });
  }
  {
    const s = structuredClone(state);
    own(s).fanMood = Math.max(0, own(s).fanMood - 25);
    out.push({ kind: 'krize', label: SCENARIO_LABEL.krize, note: 'Méně diváků, menší fanshop a útrata na stadionu.', plan: forecastSeason(s) });
  }
  return out;
}

function estimateSale(state: GameState, playerId: string): number {
  const p = state.players[playerId];
  // Stejný výpočet jako tržní hodnota v přestupech (bez importu, aby nevznikl kruh).
  const tier = tierOf(state, p.clubId);
  const factor = tier === 1 ? 1 : tier === 2 ? 0.4 : 0.2;
  const age = state.season - p.birthYear;
  const base = p.overall <= 76 ? 11_000_000 * Math.pow(5, (p.overall - 80) / 10) : 11_000_000 * Math.pow(5, -0.4) * Math.pow(2.2, (p.overall - 76) / 10);
  const ageF = age <= 21 ? 1.6 : age <= 24 ? 1.35 : age <= 27 ? 1.1 : age <= 29 ? 0.85 : 0.55;
  return base * ageF * 25 * factor * 1.1;
}

// ---------- Rating hospodaření ----------

export type Grade = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export function financialRating(state: GameState): { grade: Grade; score: number; reasons: string[] } {
  const club = own(state);
  const costs = annualCosts(club, tierOf(state, club.id));
  const sheet = balanceSheet(state);
  const plan = forecastSeason(state);
  const debt = state.loans.reduce((a, l) => a + l.remaining, 0);
  const reasons: string[] = [];
  let score = 50;
  const equity = (sheet.equity + sheet.ownerLoan) / Math.max(1, costs);
  score += clamp(equity * 30, -30, 25);
  reasons.push(`vlastní kapitál ${equity >= 0 ? '' : 'záporný, '}${Math.round(equity * 100)} % ročních nákladů`);
  const margin = plan.result / Math.max(1, costs);
  score += clamp(margin * 80, -25, 15);
  reasons.push(`provozní výsledek ${mil(plan.result)}`);
  const lev = debt / Math.max(1, costs);
  score -= clamp(lev * 25, 0, 20);
  if (debt) reasons.push(`úvěry ${mil(debt)}`);
  const liquidity = plan.cashMin / Math.max(1, costs / 12);
  score += clamp(liquidity * 3, -15, 10);
  reasons.push(`nejnižší zůstatek ${mil(plan.cashMin)}`);
  const grade: Grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : score >= 20 ? 'E' : 'F';
  return { grade, score: Math.round(score), reasons };
}

/** Úrok banky podle ratingu (bez ratingu běžný). */
export function rateAdjustment(state: GameState): number {
  const g = state.rating?.grade;
  return g === 'A' ? -0.015 : g === 'B' ? -0.005 : g === 'D' ? 0.01 : g === 'E' ? 0.025 : g === 'F' ? 0.05 : 0;
}

/** Konec sezóny: vysvědčení hospodaření. */
export function seasonRating(state: GameState): void {
  const r = financialRating(state);
  state.rating = { season: state.season, grade: r.grade, score: r.score };
  satisfy(state, { A: 6, B: 3, C: 0, D: -3, E: -6, F: -10 }[r.grade], ['investor', 'spekulant', 'mesto']);
  addNews(state, { kind: 'sezona', title: `Finanční vysvědčení sezóny: ${r.grade}`, text: `${r.reasons.join(', ')}. Rating určuje úrok bank${r.grade === 'F' ? '; s F banka nepůjčí' : ''} a spokojenost akcionářů.` });
}

// ---------- Finanční fair play ----------

export interface FfpStatus {
  /** Součet provozních výsledků za tři sezóny (včetně výhledu té aktuální). */
  total: number;
  /** Započtené vklady majitele (polovina). */
  deposits: number;
  limit: number;
  ok: boolean;
  /** Fair play platí jen v profesionálních soutěžích (1. a 2. liga). */
  applies: boolean;
  strikes: number;
  restricted: boolean;
}

export function ffpStatus(state: GameState): FfpStatus {
  const club = own(state);
  const costs = annualCosts(club, tierOf(state, club.id));
  const hist = (state.opHistory ?? []).filter((h) => h.season >= state.season - 2 && h.season < state.season);
  const current = forecastSeason(state).result;
  const total = hist.reduce((a, h) => a + h.result, 0) + current;
  const deposits = (hist.reduce((a, h) => a + h.deposits, 0) + (club.finance.season.vklad ?? 0)) * 0.5;
  const limit = -costs * 0.5 / strictnessFactor(state);
  const applies = tierOf(state, club.id) <= 2;
  return { total, deposits, limit, ok: !applies || total + deposits >= limit, strikes: state.ffp?.strikes ?? 0, restricted: state.ffp?.restrictedSeason === state.season, applies };
}

/** Konec sezóny: zápis výsledku a kontrola fair play. */
export function seasonFfp(state: GameState): void {
  const club = own(state);
  state.opHistory = [...(state.opHistory ?? []), { season: state.season, result: operatingActual(state), deposits: club.finance.season.vklad ?? 0 }].slice(-5);
  const hist = state.opHistory.filter((h) => h.season > state.season - 3);
  const costs = annualCosts(club, tierOf(state, club.id));
  const total = hist.reduce((a, h) => a + h.result + h.deposits * 0.5, 0);
  const limit = -costs * 0.5 / strictnessFactor(state);
  state.ffp ??= { strikes: 0 };
  if (total >= limit || tierOf(state, club.id) > 2) {
    state.ffp.strikes = Math.max(0, state.ffp.strikes - 1);
    return;
  }
  state.ffp.strikes += 1;
  if (state.ffp.strikes === 1) {
    addNews(state, { kind: 'varovani', title: 'Fair play: napomenutí od svazu', text: `Ztráty za tři sezóny (${mil(total)}) přesáhly limit ${mil(limit)}. Příště hrozí omezení přestupů.` });
  } else if (state.ffp.strikes === 2) {
    state.ffp.restrictedSeason = state.season + 1;
    addNews(state, { kind: 'varovani', title: 'Fair play: omezení přestupů', text: 'Příští sezónu smí klub přivést nejvýš 2 nové hráče za odstupné nebo ze zahraničí.' });
  } else {
    state.ffp.restrictedSeason = state.season + 1;
    const fine = Math.round((costs * 0.02 * strictnessFactor(state)) / 100_000) * 100_000;
    book(state, club.id, 'ostatni', -fine, 'Pokuta svazu: finanční fair play');
    addNews(state, { kind: 'varovani', title: `Fair play: pokuta ${mil(fine)} a omezení přestupů`, text: 'Svaz opakovaně trestá ztráty nad limit.' });
  }
}

/** Smí klub kvůli fair play koupit dalšího hráče? (při omezení nejvýš 2 za sezónu) */
export function ffpBlocksSigning(state: GameState): string | undefined {
  if (state.ffp?.restrictedSeason !== state.season) return undefined;
  const signed = state.market.history.filter((h) => h.toId === state.owner.clubId && h.fee > 0 && h.date >= `${state.season}-07-01`).length;
  return signed >= 2 ? 'Fair play: klub letos smí přivést nejvýš 2 hráče za odstupné.' : undefined;
}

// ---------- Vztahy se sponzory ----------

export function sponsorRelation(state: GameState, slot: SponsorSlot): number {
  return state.sponsorRelations?.[slot] ?? 50;
}

export function changeSponsorRelation(state: GameState, slot: SponsorSlot, delta: number): void {
  state.sponsorRelations = { ...(state.sponsorRelations ?? {}), [slot]: clamp(sponsorRelation(state, slot) + delta, 0, 100) };
}

/** Násobek nabídek při prodlužování podle vztahu (0,9–1,1). */
export function sponsorRelationFactor(state: GameState, slot: SponsorSlot): number {
  return 0.9 + sponsorRelation(state, slot) / 500;
}

// ---------- Situace: sponzoři a šoky ----------

interface Template {
  weight: (state: GameState) => number;
  create: (state: GameState, rng: Rng) => Omit<GameEvent, 'id' | 'template' | 'date' | 'expires'> | null;
  resolve: (state: GameState, event: GameEvent, option: string) => string;
}

export const FINANCE_COOLDOWN: Record<string, number> = { 'sponzor-akce': 90, 'sponzor-rukav': 365, 'sok-energie': 365, 'sok-tv': 730, 'sok-krach': 400, 'sok-refinancovani': 365, 'sok-sbirka': 365 };

export function financeTemplates(h: { teamMorale: (s: GameState, d: number) => void; media: (s: GameState, d: number) => void }): Record<string, Template> {
  const costs = (s: GameState) => annualCosts(own(s), tierOf(s, s.owner.clubId));
  return {
    'sponzor-akce': {
      weight: (s) => (contracts(s).some((c) => c.slot === 'generalni') && squadOf(s, s.owner.clubId).length >= 18 ? 0.6 : 0),
      create: (s) => {
        const c = contracts(s).find((x) => x.slot === 'generalni')!;
        return {
          title: `${c.name} chce tři hráče na firemní akci`,
          text: 'Generální partner pořádá den pro zaměstnance a chce, aby přišly hvězdy týmu. Je to uprostřed přípravy na zápas.',
          amount: roundM(c.annual * 0.03),
          defaultOption: 'poslat',
          options: [
            { id: 'poslat', label: 'Poslat tři opory', hint: 'Vztah se sponzorem +10, bonus, kondice tří hráčů −10, morálka −2.' },
            { id: 'nahradnici', label: 'Poslat náhradníky', hint: 'Vztah se sponzorem +3.' },
            { id: 'odmitnout', label: 'Odmítnout', hint: 'Vztah se sponzorem −10 (horší nabídka při prodloužení).' },
          ],
        };
      },
      resolve: (s, e, o) => {
        if (o === 'poslat') {
          for (const p of squadOf(s, s.owner.clubId).sort((a, b) => b.overall - a.overall).slice(0, 3)) {
            p.fitness = Math.max(60, p.fitness - 10);
            p.morale = clamp(p.morale - 2, 0, 100);
          }
          changeSponsorRelation(s, 'generalni', 10);
          book(s, s.owner.clubId, 'komercni', e.amount ?? 0, 'Bonus generálního partnera za firemní akci');
          return 'Sponzor je nadšený, hráči trochu unavení.';
        }
        if (o === 'nahradnici') {
          changeSponsorRelation(s, 'generalni', 3);
          return 'Sponzor bral, co dostal.';
        }
        changeSponsorRelation(s, 'generalni', -10);
        return 'Sponzor je zklamaný.';
      },
    },
    'sponzor-rukav': {
      weight: (s) => (contracts(s).length >= 2 ? 0.25 : 0),
      create: (s) => {
        const amount = roundM(costs(s) * 0.01);
        return {
          title: 'Sázková kancelář chce logo na rukáv dresu',
          text: 'Nabídka na jednu sezónu. Část fanoušků reklamu na sázení na dresu nesnáší.',
          amount,
          defaultOption: 'odmitnout',
          options: [
            { id: 'prijmout', label: `Přijmout (${mil(amount)})`, hint: 'Peníze hned, nálada fanoušků −3, patrioti −3.' },
            { id: 'odmitnout', label: 'Odmítnout', hint: 'Bez dopadu.' },
          ],
        };
      },
      resolve: (s, e, o) => {
        if (o === 'prijmout') {
          book(s, s.owner.clubId, 'komercni', e.amount ?? 0, 'Logo na rukávu dresu');
          own(s).fanMood = clamp(own(s).fanMood - 3, 0, 100);
          satisfy(s, -3, ['patriot']);
          return 'Logo je na rukávu, část fanoušků protestuje.';
        }
        return 'Dres zůstává čistý.';
      },
    },
    'sok-energie': {
      weight: (s) => ([10, 11, 12, 1].includes(Number(s.date.slice(5, 7))) ? 0.35 : 0),
      create: (s) => {
        const amount = roundM(costs(s) * 0.015);
        return {
          title: 'Ceny energií vyskočily',
          text: `Dodavatel zdražuje: vytápění trávníku, osvětlení a provoz vyjdou do konce sezóny asi o ${mil(amount)} dráž.`,
          amount,
          defaultOption: 'zaplatit',
          options: [
            { id: 'zaplatit', label: 'Zaplatit', hint: `−${mil(amount)}.` },
            { id: 'usporny', label: 'Úsporný režim stadionu', hint: `−${mil(amount * 0.4)}, ale údržba přejde na úspornou (víc zranění, horší trávník).` },
          ],
        };
      },
      resolve: (s, e, o) => {
        if (o === 'usporny') {
          book(s, s.owner.clubId, 'provoz', -Math.round((e.amount ?? 0) * 0.4), 'Dražší energie (úsporný režim)');
          own(s).policy.maintenance = 'nizka';
          return 'Stadion jede v úsporném režimu.';
        }
        book(s, s.owner.clubId, 'provoz', -(e.amount ?? 0), 'Dražší energie');
        return 'Zaplaceno.';
      },
    },
    'sok-tv': {
      weight: () => 0.15,
      create: (s, rng) => {
        const up = rng.next() < 0.6;
        const amount = roundM(costs(s) * (up ? 0.02 : 0.012));
        return {
          title: up ? 'Liga vyjednala lepší televizní smlouvu' : 'Televize krátí platby lize',
          text: up ? `Klub letos dostane navíc asi ${mil(amount)}.` : `Klub letos přijde asi o ${mil(amount)}.`,
          amount: up ? amount : -amount,
          defaultOption: up ? 'ponechat' : 'prijmout',
          options: up
            ? [
                { id: 'ponechat', label: 'Peníze nechat klubu', hint: `+${mil(amount)}.` },
                { id: 'premie', label: 'Polovinu rozdělit hráčům jako prémii', hint: `+${mil(amount / 2)}, morálka týmu +5.` },
              ]
            : [{ id: 'prijmout', label: 'Vzít na vědomí', hint: `−${mil(amount)}.` }],
        };
      },
      resolve: (s, e, o) => {
        const amount = e.amount ?? 0;
        if (amount < 0) {
          book(s, s.owner.clubId, 'tv', amount, 'Nižší platba za TV práva');
          return 'Klub dostane méně.';
        }
        if (o === 'premie') {
          book(s, s.owner.clubId, 'tv', amount, 'Vyšší platba za TV práva');
          book(s, s.owner.clubId, 'platy', -amount / 2, 'Prémie hráčům z TV peněz');
          h.teamMorale(s, 5);
          return 'Hráči ocenili prémii.';
        }
        book(s, s.owner.clubId, 'tv', amount, 'Vyšší platba za TV práva');
        return 'Peníze zůstávají klubu.';
      },
    },
    'sok-krach': {
      weight: (s) => (contracts(s).filter((c) => c.slot !== 'generalni').length >= 2 ? 0.12 : 0),
      create: (s) => {
        const c = contracts(s).filter((x) => x.slot !== 'generalni' && x.slot !== 'stadion').sort((a, b) => b.annual - a.annual)[0];
        if (!c) return null;
        return {
          title: `Sponzor ${c.name} zkrachoval`,
          text: `Smlouva za ${mil(c.annual)} ročně končí. Místo je volné, obchodní oddělení může hledat náhradu.`,
          amount: c.annual,
          defaultOption: 'hledat',
          options: [
            { id: 'hledat', label: 'Hledat nového sponzora', hint: 'Nabídky přijdou v příštích týdnech (Finance › Příjmy).' },
            { id: 'vymahat', label: 'Vymáhat aspoň část peněz soudně', hint: `Náklady na právníky ${mil(c.annual * 0.05)}, asi 50% šance získat ${mil(c.annual * 0.3)}.` },
          ],
        };
      },
      resolve: (s, e, o) => {
        const club = own(s);
        const c = contracts(s).filter((x) => x.slot !== 'generalni' && x.slot !== 'stadion').sort((a, b) => b.annual - a.annual)[0];
        if (c) club.sponsors = (club.sponsors ?? []).filter((x) => x !== c);
        if (o === 'vymahat') {
          book(s, s.owner.clubId, 'ostatni', -Math.round((e.amount ?? 0) * 0.05), 'Právníci: vymáhání od sponzora');
          if (Number(e.id.replace(/\D/g, '')) % 2 === 0) {
            book(s, s.owner.clubId, 'komercni', Math.round((e.amount ?? 0) * 0.3), 'Vymožené peníze od sponzora');
            return 'Soud část peněz přiznal.';
          }
          return 'Vymáhání neuspělo.';
        }
        return 'Obchodní oddělení hledá náhradu.';
      },
    },
    'sok-refinancovani': {
      weight: (s) => (s.loans.some((l) => l.rate >= 0.06) && (s.rating?.grade ?? 'C') <= 'B' ? 0.5 : s.loans.some((l) => l.rate >= 0.06) ? 0.15 : 0),
      create: (s) => {
        const loan = s.loans.find((l) => l.rate >= 0.06)!;
        return {
          title: 'Banka nabízí refinancování úvěru',
          text: `Úvěr ${mil(loan.remaining)} s úrokem ${Math.round(loan.rate * 1000) / 10} % lze převést na ${Math.round((loan.rate - 0.015) * 1000) / 10} % za poplatek ${mil(loan.remaining * 0.01)}.`,
          amount: loan.remaining,
          defaultOption: 'ne',
          options: [
            { id: 'ano', label: 'Refinancovat', hint: 'Nižší splátky do konce úvěru.' },
            { id: 'ne', label: 'Nechat jak je', hint: 'Bez změny.' },
          ],
        };
      },
      resolve: (s, _e, o) => {
        const loan = s.loans.find((l) => l.rate >= 0.06);
        if (o !== 'ano' || !loan) return 'Bez změny.';
        book(s, s.owner.clubId, 'uver', -Math.round(loan.remaining * 0.01), 'Poplatek za refinancování');
        loan.rate -= 0.015;
        const r = loan.rate / 12;
        loan.payment = Math.round((loan.remaining * r) / (1 - Math.pow(1 + r, -loan.monthsLeft)));
        return 'Úvěr je levnější.';
      },
    },
    'sok-sbirka': {
      weight: (s) => (own(s).finance.balance < 0 && own(s).fanMood >= 45 ? 1.5 : 0),
      create: (s) => {
        const amount = roundM(costs(s) * 0.01);
        return {
          title: 'Fanoušci chtějí uspořádat sbírku pro klub',
          text: `Fanklub ví o finančních problémech a nabízí sbírku, která by mohla vynést asi ${mil(amount)}.`,
          amount,
          defaultOption: 'prijmout',
          options: [
            { id: 'prijmout', label: 'Přijmout s díky', hint: `+${mil(amount)}, nálada fanoušků +3, média −2 (klub je na tom špatně).` },
            { id: 'odmitnout', label: 'Odmítnout, klub si poradí', hint: 'Média +2.' },
          ],
        };
      },
      resolve: (s, e, o) => {
        if (o === 'prijmout') {
          book(s, s.owner.clubId, 'ostatni', e.amount ?? 0, 'Sbírka fanoušků');
          own(s).fanMood = clamp(own(s).fanMood + 3, 0, 100);
          h.media(s, -2);
          return 'Fanoušci se složili na svůj klub.';
        }
        h.media(s, 2);
        return 'Klub sbírku odmítl.';
      },
    },
  };
}

export function scenarioSummary(state: GameState): { base: BudgetPlan; scenarios: Scenario[] } {
  return { base: forecastSeason(state), scenarios: scenarioPlans(state) };
}

