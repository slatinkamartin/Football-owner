import { bumpAchievementStat } from './achievements';
import { addDays } from './calendar';
import { annualCosts, book, playerWage } from './finance';
import { makeForeignPlayer } from './foreign';
import { hasProgram, programAnnual } from './investments';
import { FOREIGN_CLUBS } from './names';
import { clubValuation } from './ownership';
import { playerAge, squadOf } from './players';
import { createRng, type Rng } from './rng';
import { changeCity, changeUltras } from './surroundings';
import type { FinanceCategory, GameEvent, GameState } from './types';
import { addNews, clamp, FOREIGN_PREFIX, hash01, tierOf } from './world';

/**
 * Velká rozhodnutí s dlouhými důsledky: vzácné (nejvýš dvě za sezónu) situace jen pro klub majitele,
 * které na roky dopředu mění peníze, fanoušky nebo kádr. Každé přijaté rozhodnutí zapíše dlouhodobý
 * efekt (state.longEffects) s datem konce; efekty se uplatňují měsíčně (peníze, nálada, mládež)
 * a týdně (podíl z prodejů hráčů).
 */

export type LongEffectKind = 'najem-stadionu' | 'partnerstvi' | 'btym-sponzor' | 'btym-zrusen' | 'fanouskovsky-podil' | 'fond' | 'vetsi-stadion' | 'akademie';

export interface LongEffect {
  id: string;
  kind: LongEffectKind;
  label: string;
  /** Co efekt dělá (lidsky). */
  detail: string;
  start: string;
  /** Do kdy platí (bez tohoto dne). */
  until: string;
  /** Kč do klubu (+) nebo z klubu (−) každý měsíc. */
  monthly?: number;
  /** Kategorie účetnictví pro měsíční částku. */
  category?: FinanceCategory;
  /** Změna nálady fanoušků za měsíc. */
  fanMood?: number;
  /** Podíl z každého prodeje hráče, který odchází jinam (0–1). */
  saleLevy?: number;
  levyTo?: string;
  /** Měsíční šance na zlepšení hráčů do 21 let (akademie). */
  youthBoost?: number;
  partnerId?: string;
  loansPerSeason?: number;
  lastLoanSeason?: number;
  /** Jen v těchto měsících (1–12), jinak každý měsíc. */
  months?: number[];
  /** Celkem zaplaceno (−) nebo získáno (+) zatím. */
  total?: number;
  ended?: boolean;
}

export interface BigDecisionsState {
  /** Kdy byla která nabídka naposledy předložena. */
  offered: Record<string, string>;
  season: number;
  count: number;
  last?: string;
  levyCursor?: string;
  stadiumSold?: boolean;
  /** Čísla nabídky čekající na rozhodnutí (podle šablony). */
  pending?: Record<string, Record<string, number | string>>;
}

/** Nejvýš tolik velkých rozhodnutí za sezónu. */
export const BIG_DECISIONS_PER_SEASON = 2;
const OFFER_CHANCE = 0.14;
const PREFIX = 'velke-';

const mil = (v: number) => `${(Math.abs(v) / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;
const kc = (v: number) => (Math.abs(v) >= 1_000_000 ? mil(v) : `${Math.round(Math.abs(v) / 1000).toLocaleString('cs-CZ')} tis. Kč`);
const roundTo = (v: number, step: number) => Math.max(step, Math.round(v / step) * step);
const own = (s: GameState) => s.clubs[s.owner.clubId];
const month = (s: GameState) => Number(s.date.slice(5, 7));
const fmtDate = (iso: string) => iso.split('-').slice(0, 2).reverse().map(Number).join('/');

function addMonths(iso: string, months: number): string {
  const [y, m] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

function state0(state: GameState): BigDecisionsState {
  const bd = (state.bigDecisions ??= { offered: {}, season: state.season, count: 0 });
  if (bd.season !== state.season) {
    bd.season = state.season;
    bd.count = 0;
  }
  return bd;
}

function activeEffects(state: GameState): LongEffect[] {
  return (state.longEffects ?? []).filter((e) => !e.ended && e.start <= state.date && state.date < e.until);
}

export function longEffectsOf(state: GameState): { active: LongEffect[]; ended: LongEffect[] } {
  const all = state.longEffects ?? [];
  return { active: all.filter((e) => !e.ended), ended: all.filter((e) => e.ended).slice(-5) };
}

function hasEffect(state: GameState, kind: LongEffectKind): boolean {
  return (state.longEffects ?? []).some((e) => e.kind === kind && !e.ended);
}

function addEffect(state: GameState, e: Omit<LongEffect, 'id' | 'start' | 'total'>): LongEffect {
  const effect: LongEffect = { ...e, id: `le${++state.nextId}`, start: state.date, total: 0 };
  state.longEffects = [...(state.longEffects ?? []), effect];
  return effect;
}

function homeLeague(state: GameState) {
  const id = state.owner.clubId;
  const comp = Object.values(state.competitions).find((c) => c.clubIds.includes(id));
  return comp?.fixtures.filter((f) => f.homeId === id) ?? [];
}

function teamLevel(state: GameState): number {
  const best = squadOf(state, state.owner.clubId).map((p) => p.overall).sort((a, b) => b - a).slice(0, 14);
  return best.length ? best.reduce((a, b) => a + b, 0) / best.length : 50;
}

function partnerOf(state: GameState) {
  const big = FOREIGN_CLUBS.filter((c) => c.level === 1);
  return big[Math.floor(hash01(`${state.seed}-${state.season}-partnerstvi`) * big.length)];
}

// ---------- Šablony ----------

interface BigTemplate {
  title: string;
  /** Dává nabídka teď smysl? */
  available: (s: GameState) => boolean;
  /** Čísla nabídky (uloží se do pending). */
  numbers: (s: GameState) => Record<string, number | string>;
  text: (s: GameState, n: Record<string, number | string>) => string;
  options: (s: GameState, n: Record<string, number | string>) => { id: string; label: string; hint: string }[];
  /** Přijetí (první volba); vrací zprávu. */
  accept: (s: GameState, n: Record<string, number | string>, rng: Rng) => string;
  reject: string;
}

const num = (n: Record<string, number | string>, k: string) => Number(n[k] ?? 0);

/** Definice nabídek (funkce kvůli cyklickým importům: šablony se čtou už při načtení events.ts). */
function bigDefs(): Record<string, BigTemplate> {
  return {
  'stadion-mesto': {
    title: 'Město chce koupit váš stadion',
    available: (s) => !state0(s).stadiumSold && own(s).stadium.capacity >= 2500 && tierOf(s, s.owner.clubId) <= 3,
    numbers: (s) => {
      const club = own(s);
      const price = roundTo(club.stadium.capacity * 20_000 * (tierOf(s, club.id) === 1 ? 1.25 : 1), 1_000_000);
      const rent = roundTo((price * 0.085) / 12, 10_000);
      return { price, rent, months: 120 };
    },
    text: (s, n) =>
      `Primátor nabízí, že město stadion ${own(s).stadium.name} koupí za ${mil(num(n, 'price'))}. Klub v něm bude dál hrát, ale 10 let bude platit nájem ${kc(num(n, 'rent'))} měsíčně (celkem ${mil(num(n, 'rent') * 120)}). Fanoušci prodej „rodinného stříbra“ nesou těžce, město by vám bylo zavázané.`,
    options: (_, n) => [
      { id: 'prijmout', label: 'Prodat stadion městu', hint: `+${mil(num(n, 'price'))} hned · nájem −${kc(num(n, 'rent'))}/měsíc 10 let · fanoušci −8, kotel −10 · vztah s městem +8` },
      { id: 'odmitnout', label: 'Stadion si nechat', hint: 'Nic se nemění' },
    ],
    accept: (s, n) => {
      const club = own(s);
      book(s, club.id, 'ostatni', num(n, 'price'), 'Prodej stadionu městu');
      club.fanMood = clamp(club.fanMood - 8, 0, 100);
      changeUltras(s, -10);
      changeCity(s, 8);
      state0(s).stadiumSold = true;
      addEffect(s, { kind: 'najem-stadionu', label: 'Nájem stadionu od města', detail: `Stadion patří městu, klub platí ${kc(num(n, 'rent'))} měsíčně.`, until: addMonths(s.date, 120), monthly: -num(n, 'rent'), category: 'stadion' });
      return `Stadion patří městu. Na účet přišlo ${mil(num(n, 'price'))}, od příštího měsíce platíte nájem.`;
    },
    reject: 'Stadion zůstává klubu. Fanoušci to oceňují.',
  },

  partnerstvi: {
    title: 'Velký zahraniční klub nabízí partnerství',
    available: (s) => tierOf(s, s.owner.clubId) <= 2 && !hasEffect(s, 'partnerstvi'),
    numbers: (s) => {
      const p = partnerOf(s);
      const fee = roundTo((annualCosts(own(s), tierOf(s, s.owner.clubId)) * 0.02) / 12, 10_000);
      return { partner: p.name, partnerId: FOREIGN_PREFIX + p.id, country: p.country, fee, levy: 0.25 };
    },
    text: (_, n) =>
      `${n.partner} (${n.country}) nabízí tříleté partnerství. Každé léto vám pošle dva své talenty na hostování (plat napůl hradí oni) a za spolupráci zaplatí ${kc(num(n, 'fee'))} měsíčně. Za to chce 25 % z každého vašeho prodeje hráče: o velkých prodejích už nerozhodujete sami.`,
    options: (_, n) => [
      { id: 'prijmout', label: 'Podepsat partnerství na 3 roky', hint: `2 talenti na hostování každou sezónu · +${kc(num(n, 'fee'))}/měsíc · 25 % z každého prodeje jde partnerovi` },
      { id: 'odmitnout', label: 'Odmítnout', hint: 'Nic se nemění' },
    ],
    accept: (s, n, rng) => {
      const until = `${s.season + 3}-06-30`;
      const e = addEffect(s, {
        kind: 'partnerstvi',
        label: `Partnerství s klubem ${n.partner}`,
        detail: `Dva talenti na hostování každou sezónu, ${kc(num(n, 'fee'))} měsíčně, 25 % z prodejů hráčů jde partnerovi.`,
        until,
        monthly: num(n, 'fee'),
        category: 'komercni',
        saleLevy: 0.25,
        levyTo: String(n.partner),
        partnerId: String(n.partnerId),
        loansPerSeason: 2,
      });
      const names = sendPartnerLoans(s, e, rng);
      return `Partnerství podepsáno do ${fmtDate(until)}. ${names.length ? `Na hostování přicházejí: ${names.join(', ')}.` : ''}`;
    },
    reject: 'Partnerství jste odmítli. Prodeje hráčů zůstávají plně ve vašich rukou.',
  },

  'btym-zrusit': {
    title: 'Ekonomický ředitel navrhuje zrušit B-tým',
    available: (s) => hasProgram(s, 'btym'),
    numbers: (s) => ({ annual: programAnnual(s, 'btym') }),
    text: (_, n) =>
      `B-tým stojí ${mil(num(n, 'annual'))} ročně. Ředitel navrhuje ho zrušit a peníze ušetřit. Hráči do 21 let, kteří nehrají za A-tým, by ale přišli o zápasovou praxi a rodiče i trenéři mládeže by byli zklamaní.`,
    options: (_, n) => [
      { id: 'prijmout', label: 'Zrušit B-tým', hint: `úspora ${mil(num(n, 'annual'))}/rok · mladí se vyvíjejí pomaleji · fanoušci −0,5/měsíc po dobu 12 měsíců, město −4` },
      { id: 'odmitnout', label: 'B-tým ponechat', hint: 'Náklady zůstávají' },
    ],
    accept: (s, n) => {
      s.programs = (s.programs ?? []).filter((p) => p.kind !== 'btym');
      changeCity(s, -4);
      addEffect(s, { kind: 'btym-zrusen', label: 'Zrušený B-tým', detail: `Úspora ${mil(num(n, 'annual'))} ročně, mládež bez zápasové praxe, zklamaní fanoušci.`, until: addMonths(s.date, 12), fanMood: -0.5 });
      return 'B-tým končí. Náklady klesnou, mladí hráči ale budou nastupovat méně.';
    },
    reject: 'B-tým pokračuje.',
  },

  'btym-obnovit': {
    title: 'Sponzor nabízí obnovu B-týmu',
    available: (s) => !hasProgram(s, 'btym') && tierOf(s, s.owner.clubId) <= 2 && !hasEffect(s, 'btym-zrusen'),
    numbers: (s) => {
      const annual = programAnnual(s, 'btym');
      return { annual, subsidy: roundTo(annual / 24, 10_000) };
    },
    text: (_, n) =>
      `Regionální firma zaplatí polovinu nákladů B-týmu po tři roky (${kc(num(n, 'subsidy'))} měsíčně). B-tým stojí ${mil(num(n, 'annual'))} ročně, po třech letech ho platíte celý (nebo zrušíte). Mladí hráči by pravidelně hráli soutěžní zápasy.`,
    options: (_, n) => [
      { id: 'prijmout', label: 'Založit B-tým', hint: `náklady ${mil(num(n, 'annual'))}/rok, sponzor vrací ${kc(num(n, 'subsidy'))}/měsíc 3 roky · hráči do 21 let se rozvíjejí rychleji · fanoušci +3` },
      { id: 'odmitnout', label: 'Poděkovat a odmítnout', hint: 'Nic se nemění' },
    ],
    accept: (s, n) => {
      s.programs = [...(s.programs ?? []), { kind: 'btym', since: s.date }];
      const club = own(s);
      club.fanMood = clamp(club.fanMood + 3, 0, 100);
      addEffect(s, { kind: 'btym-sponzor', label: 'Sponzor B-týmu', detail: `Sponzor hradí polovinu nákladů B-týmu (${kc(num(n, 'subsidy'))} měsíčně).`, until: addMonths(s.date, 36), monthly: num(n, 'subsidy'), category: 'komercni' });
      return 'B-tým je založený. Mladí hráči dostanou soutěžní zápasy.';
    },
    reject: 'Bez B-týmu. Sponzor zkusí štěstí jinde.',
  },

  'fanouskovsky-podil': {
    title: 'Fanoušci chtějí koupit 10 % klubu',
    available: (s) => s.owner.share >= 0.6 && !s.shareholders.some((x) => x.name === fanShareholderName()) && own(s).fanMood >= 45,
    numbers: (s) => ({ price: roundTo(clubValuation(s) * 0.1 * 0.8, 100_000) }),
    text: (s, n) =>
      `Fanouškovský spolek vybral peníze a nabízí ${mil(num(n, 'price'))} za 10 % klubu (peníze jdou na účet klubu). Na valné hromadě by měl 10 % hlasů a hlídal by ceny vstupenek, mládež a výsledky. Váš podíl by klesl na ${Math.round((s.owner.share - 0.1) * 100)} %.`,
    options: (_, n) => [
      { id: 'prijmout', label: 'Prodat fanouškům 10 %', hint: `+${mil(num(n, 'price'))} pro klub · fanoušci +12, kotel +15, pak +0,4/měsíc 5 let · spolek hlasuje na valné hromadě` },
      { id: 'odmitnout', label: 'Klub zůstane váš', hint: 'Fanoušci −3' },
    ],
    accept: (s, n) => {
      const club = own(s);
      book(s, club.id, 'ostatni', num(n, 'price'), 'Fanouškovský podíl (10 %)');
      s.owner.share = Math.round((s.owner.share - 0.1) * 1000) / 1000;
      s.shareholders.push({ id: `a${++s.nextId}`, name: fanShareholderName(), kind: 'patriot', share: 0.1, satisfaction: 72 });
      club.fanMood = clamp(club.fanMood + 12, 0, 100);
      changeUltras(s, 15);
      addEffect(s, { kind: 'fanouskovsky-podil', label: 'Fanoušci spolumajiteli', detail: 'Spolek drží 10 % a hlasuje na valné hromadě; fanoušci jsou klubu blíž.', until: addMonths(s.date, 60), fanMood: 0.4 });
      return 'Fanoušci jsou spolumajiteli klubu. Atmosféra na stadionu je nejlepší za poslední roky.';
    },
    reject: 'Spolek je zklamaný, ale peníze si nechává na choreo.',
  },

  fond: {
    title: 'Investiční fond nabízí peníze za podíl z prodejů',
    available: (s) => !hasEffect(s, 'fond') && !hasEffect(s, 'partnerstvi'),
    numbers: (s) => ({ amount: roundTo(annualCosts(own(s), tierOf(s, s.owner.clubId)) * 0.15, 500_000), levy: 0.3 }),
    text: (_, n) =>
      `Fond pošle klubu ${mil(num(n, 'amount'))} hned, bez úroků a splátek. Za to si 3 roky vezme 30 % z každého prodeje hráče (prodej za 50 mil. Kč = 15 mil. Kč fondu). Vyplatí se, když v příštích letech moc prodávat nebudete.`,
    options: (_, n) => [
      { id: 'prijmout', label: 'Vzít peníze od fondu', hint: `+${mil(num(n, 'amount'))} hned · 3 roky 30 % z každého prodeje fondu` },
      { id: 'odmitnout', label: 'Odmítnout', hint: 'Nic se nemění' },
    ],
    accept: (s, n) => {
      book(s, s.owner.clubId, 'ostatni', num(n, 'amount'), 'Investiční fond: peníze za podíl z prodejů');
      const until = addMonths(s.date, 36);
      addEffect(s, { kind: 'fond', label: 'Investiční fond: podíl z prodejů', detail: `Do ${fmtDate(until)} jde 30 % z každého prodeje hráče fondu.`, until, saleLevy: 0.3, levyTo: 'investiční fond' });
      return `Fond poslal ${mil(num(n, 'amount'))}. Tři roky mu půjde 30 % z prodejů.`;
    },
    reject: 'Fond jste odmítli.',
  },

  'vetsi-stadion': {
    title: 'Jaro na větším stadionu?',
    available: (s) => {
      if (month(s) !== 1 && month(s) !== 2) return false;
      const home = homeLeague(s).filter((f) => f.result);
      if (home.length < 3 || tierOf(s, s.owner.clubId) > 2) return false;
      const avg = home.reduce((a, f) => a + f.result!.attendance, 0) / home.length;
      const rest = homeLeague(s).filter((f) => !f.result && f.date >= `${s.season + 1}-02-15`).length;
      return avg >= own(s).stadium.capacity * 0.9 && rest >= 4;
    },
    numbers: (s) => {
      const club = own(s);
      const extra = Math.round(Math.min(club.stadium.capacity, 12_000) * 0.6);
      const games = homeLeague(s).filter((f) => !f.result && f.date >= `${s.season + 1}-02-15`).length;
      const perGame = extra * club.policy.ticketPrice;
      const rent = roundTo(perGame * 0.35, 10_000);
      const monthly = roundTo(((perGame - rent) * games) / 4, 10_000);
      return { extra, games, perGame, rent, monthly };
    },
    text: (_, n) =>
      `Stadion je vyprodaný. Krajský svaz nabízí, že jarních ${num(n, 'games')} domácích zápasů můžete odehrát na větším stadionu: asi o ${num(n, 'extra').toLocaleString('cs-CZ')} diváků víc na zápas (${kc(num(n, 'perGame'))}), nájem ${kc(num(n, 'rent'))} za zápas. Kotel přijde o svůj domov.`,
    options: (_, n) => [
      { id: 'prijmout', label: 'Hrát jaro na větším stadionu', hint: `čistě asi +${kc(num(n, 'monthly'))} měsíčně (únor–květen) · fanoušci −1,5/měsíc, kotel −6` },
      { id: 'odmitnout', label: 'Zůstat doma', hint: 'Nic se nemění' },
    ],
    accept: (s, n) => {
      changeUltras(s, -6);
      addEffect(s, { kind: 'vetsi-stadion', label: 'Jaro na větším stadionu', detail: `Asi o ${num(n, 'extra').toLocaleString('cs-CZ')} diváků víc na domácí zápas, nájem ${kc(num(n, 'rent'))} za zápas.`, until: `${s.season + 1}-06-02`, monthly: num(n, 'monthly'), category: 'vstupne', fanMood: -1.5, months: [3, 4, 5, 6] });
      return 'Jarní domácí zápasy se hrají na větším stadionu. Pokladna se raduje, kotel ne.';
    },
    reject: 'Jaro doma. Atmosféra zůstává.',
  },

  akademie: {
    title: 'Šéf akademie: vsaďte na mládí',
    available: (s) => !hasEffect(s, 'akademie') && (own(s).facilities?.academy ?? 3) <= 4,
    numbers: (s) => {
      const club = own(s);
      const annual = Math.max(club.policy.transferBudget * 0.5, annualCosts(club, tierOf(s, club.id)) * 0.04);
      return { monthly: roundTo(annual / 12, 10_000), academy: Math.min(5, (club.facilities?.academy ?? 3) + 1) };
    },
    text: (_, n) =>
      `Šéf akademie chce na tři roky polovinu peněz, které by šly na přestupy: ${kc(num(n, 'monthly'))} měsíčně (celkem ${mil(num(n, 'monthly') * 36)}). Akademie by hned stoupla na úroveň ${num(n, 'academy')} a hráči do 21 let by se zlepšovali rychleji. Na posily zbude méně.`,
    options: (_, n) => [
      { id: 'prijmout', label: 'Vsadit na mládí (3 roky)', hint: `−${kc(num(n, 'monthly'))}/měsíc 36 měsíců · akademie na úroveň ${num(n, 'academy')} · hráči do 21 let rostou rychleji · fanoušci +2` },
      { id: 'odmitnout', label: 'Zůstat u současného plánu', hint: 'Nic se nemění' },
    ],
    accept: (s, n) => {
      const club = own(s);
      if (club.facilities) club.facilities.academy = num(n, 'academy');
      club.fanMood = clamp(club.fanMood + 2, 0, 100);
      addEffect(s, { kind: 'akademie', label: 'Sázka na mládí', detail: `Akademie dostává ${kc(num(n, 'monthly'))} měsíčně, hráči do 21 let se zlepšují rychleji.`, until: addMonths(s.date, 36), monthly: -num(n, 'monthly'), category: 'oddeleni', youthBoost: 0.15 });
      return 'Akademie dostala peníze na tři roky. Uvidíme, kdo z dorostu vyroste.';
    },
    reject: 'Akademie zůstává na současném rozpočtu.',
  },
  };
}

export function fanShareholderName(): string {
  return 'Fanouškovský spolek';
}

/** Šablony situací pro engine/events.ts (náhodně se nevybírají, plánuje je weeklyBigDecisions). */
export function bigDecisionTemplates() {
  const out: Record<
    string,
    {
      weight: (s: GameState) => number;
      create: (s: GameState, rng: Rng) => Omit<GameEvent, 'id' | 'template' | 'date' | 'expires'> | null;
      resolve: (s: GameState, e: GameEvent, option: string) => string;
    }
  > = {};
  for (const [id, t] of Object.entries(bigDefs())) {
    out['velke-' + id] = {
      weight: () => 0,
      create: (s) => {
        if (!t.available(s)) return null;
        const n = t.numbers(s);
        const bd = state0(s);
        bd.pending = { ...(bd.pending ?? {}), [id]: n };
        return { title: `Velké rozhodnutí: ${t.title}`, text: t.text(s, n), options: t.options(s, n), defaultOption: 'odmitnout' };
      },
      resolve: (s, _e, option) => {
        const bd = state0(s);
        const n = bd.pending?.[id] ?? t.numbers(s);
        if (bd.pending) delete bd.pending[id];
        if (option !== 'prijmout') return t.reject;
        const rng = derivedRng(s, `${id}-prijmout`);
        const msg = t.accept(s, n, rng);
        bumpAchievementStat(s, 'bigDecisions');
        return msg;
      },
    };
  }
  return out;
}

function derivedRng(state: GameState, salt: string): Rng {
  return createRng(Math.floor(hash01(`${state.seed}-${state.date}-${salt}`) * 2 ** 31) + state.nextId);
}

// ---------- Průběh ----------

function sendPartnerLoans(state: GameState, e: LongEffect, rng: Rng): string[] {
  const club = own(state);
  const level = teamLevel(state);
  const partner = FOREIGN_CLUBS.find((c) => FOREIGN_PREFIX + c.id === e.partnerId);
  const names: string[] = [];
  for (let i = 0; i < (e.loansPerSeason ?? 2); i++) {
    const { player: p } = makeForeignPlayer(state, rng, 'velke', level - 3);
    p.clubId = club.id;
    p.contractUntil = state.season + 1;
    p.loan = { fromId: e.partnerId ?? p.clubId, buyOption: roundTo(p.overall * p.overall * 6_000, 100_000) };
    if (partner) p.nationality = partner.country;
    // Dva hráči se stejným jménem by mátli.
    if (names.some((x) => x.startsWith(`${p.firstName} ${p.lastName} `))) p.lastName = `${p.lastName}-${rng.pick(['Jr.', 'Silva', 'Costa', 'Keller'])}`;
    p.wage = roundTo(playerWage(p.overall, club.reputation) * 0.5, 1_000);
    p.morale = 70;
    state.players[p.id] = p;
    names.push(`${p.firstName} ${p.lastName} (${playerAge(p, state.season)} let, ${p.overall})`);
  }
  e.lastLoanSeason = state.season;
  return names;
}

/** Měsíčně (1. den): peníze, nálada, mládež; konec efektů a hostování od partnera v nové sezóně. */
export function monthlyLongEffects(state: GameState): void {
  const list = state.longEffects;
  if (!list?.length || state.gameOver) return;
  const club = own(state);
  const m = month(state);
  for (const e of list) {
    if (e.ended) continue;
    if (state.date >= e.until) {
      e.ended = true;
      addNews(state, { kind: 'info', title: `Skončil dlouhodobý efekt: ${e.label}`, text: e.total ? `Za celou dobu: ${e.total > 0 ? '+' : '−'}${mil(e.total)}.` : undefined });
      continue;
    }
    if (e.start >= state.date) continue;
    if (e.months && !e.months.includes(m)) continue;
    if (e.monthly) {
      book(state, club.id, e.category ?? 'ostatni', e.monthly, e.label);
      e.total = (e.total ?? 0) + e.monthly;
    }
    if (e.fanMood) club.fanMood = clamp(club.fanMood + e.fanMood, 0, 100);
    if (e.youthBoost) {
      const derived = derivedRng(state, `mladi-${e.id}`);
      for (const p of squadOf(state, club.id)) {
        if (playerAge(p, state.season) <= 21 && p.overall < p.potential && derived.chance(e.youthBoost)) p.overall += 1;
      }
    }
    if (e.kind === 'partnerstvi' && e.lastLoanSeason !== state.season && m >= 7 && m <= 8) {
      const names = sendPartnerLoans(state, e, derivedRng(state, `partner-${e.id}`));
      addNews(state, { kind: 'info', title: `${e.levyTo ?? 'Partner'} posílá talenty na hostování`, text: names.join(', ') });
    }
  }
}

/** Týdně: podíl z prodejů pro partnera nebo fond a případná nabídka velkého rozhodnutí. */
export function weeklyBigDecisions(state: GameState, create: (state: GameState, rng: Rng, template: string) => void): void {
  if (state.gameOver) return;
  const bd = state0(state);
  saleLevies(state, bd);
  if (state.owner.ousted || state.events.length >= 3) return;
  const m = month(state);
  // Okna: podzim (září–listopad) a zima/jaro (leden–březen), v každém nejvýš jedno.
  const window = m >= 9 && m <= 11 ? 'podzim' : m >= 1 && m <= 3 ? 'jaro' : undefined;
  if (!window || bd.count >= BIG_DECISIONS_PER_SEASON) return;
  if (bd.last && addDays(bd.last, 75) > state.date) return;
  const rng = derivedRng(state, 'velke');
  if (!rng.chance(OFFER_CHANCE)) return;
  const eligible = Object.entries(bigDefs()).filter(([id, t]) => {
    const last = bd.offered[id];
    return (!last || addDays(last, 730) <= state.date) && !state.events.some((e) => e.template === PREFIX + id) && t.available(state);
  });
  if (!eligible.length) return;
  const [id] = eligible[Math.floor(rng.next() * eligible.length)];
  const before = state.events.length;
  create(state, rng, PREFIX + id);
  if (state.events.length > before) {
    bd.offered[id] = state.date;
    bd.last = state.date;
    bd.count += 1;
  }
}

function saleLevies(state: GameState, bd: BigDecisionsState): void {
  const from = bd.levyCursor;
  bd.levyCursor = state.date;
  const levies = (state.longEffects ?? []).filter((e) => e.saleLevy && !e.ended);
  if (!levies.length || !from) return;
  const ownId = state.owner.clubId;
  const sales = (state.transferLog ?? []).filter((x) => x.fromId === ownId && x.toId !== ownId && x.fee > 0 && x.kind !== 'hostovani' && x.date > from && x.date <= state.date);
  for (const sale of sales) {
    for (const e of levies) {
      if (sale.date < e.start || sale.date >= e.until) continue;
      const cut = Math.round(sale.fee * e.saleLevy!);
      book(state, ownId, 'prestupy', -cut, `Podíl z prodeje (${sale.playerName}): ${e.levyTo ?? e.label}`);
      e.total = (e.total ?? 0) - cut;
      addNews(state, { kind: 'info', title: `${e.levyTo ?? e.label} si bere ${Math.round(e.saleLevy! * 100)} % z prodeje`, text: `${sale.playerName}: ${mil(cut)} z ${mil(sale.fee)}.` });
    }
  }
}

/** Aktivní dlouhodobé efekty: souhrn měsíčních peněz (pro Finance a Majitele). */
export function longEffectsMonthly(state: GameState): number {
  return activeEffects(state).reduce((a, e) => a + (e.monthly && (!e.months || e.months.includes(month(state))) ? e.monthly : 0), 0);
}
