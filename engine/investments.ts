import { addDays } from './calendar';
import { baseAttendance, book, defaultTicketPrice } from './finance';
import { FOREIGN_CLUBS } from './names';
import { communityEffect } from './operations';
import { ownerBlocked, previewVote, satisfy, voteMessage } from './ownership';
import type { Rng } from './rng';
import type { ActionResult } from './staff';
import { CATERING_SPEND, vipRate } from './stadium';
import type { BigProject, BigProjectKind, GameState, ProgramKind, ScoutRegion } from './types';
import { addNews, clamp, FOREIGN_PREFIX, hash01, tierOf } from './world';
import { addTrophy, cityFactor, cityPermit } from './surroundings';

/**
 * Velké investice: víceleté stavby (nový stadion, tréninkový areál, komerční areál) placené měsíčně
 * během stavby, s příspěvkem města, možností investičního úvěru a rizikem překročení rozpočtu.
 * Programy klubu: roční náklad, trvalý efekt (B-tým, ženský tým, analytika, partnerský klub, integrace).
 */

const roundMoney = (v: number, step = 100_000) => Math.round(v / step) * step;
const own = (state: GameState) => state.clubs[state.owner.clubId];
const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;

/** Ceny staveb a programů podle soutěže. */
function scale(tier: number): number {
  return tier === 1 ? 1 : tier === 2 ? 0.4 : tier === 3 ? 0.16 : 0.1;
}

// ---------- Programy ----------

export interface ProgramInfo {
  label: string;
  description: string;
  /** Roční náklad klubu 1. ligy. */
  annual: number;
  /** Jednorázový vstup (partnerský klub). */
  oneOff?: number;
}

export const PROGRAMS: Record<ProgramKind, ProgramInfo> = {
  btym: { label: 'B-tým v nižší soutěži', description: 'Hráči do 21 let hrají soutěžní zápasy: rozvíjejí se, jako by pravidelně nastupovali, a neztrácejí morálku na lavičce.', annual: 18_000_000 },
  zeny: { label: 'Ženský tým', description: 'Lepší vztah k městu a fanouškům (nálada roste), sponzor ženského fotbalu pokryje asi třetinu nákladů.', annual: 10_000_000 },
  analytika: { label: 'Datové a analytické oddělení', description: 'Odhady skautů doma i v cizině o 30 % přesnější, lepší příprava na soupeře (síla týmu +1).', annual: 12_000_000 },
  partner: { label: 'Partnerský klub v zahraničí', description: 'Skautská síť v regionu partnera zdarma, poloviční nejistota odhadů a odstupné o 15 % nižší.', annual: 5_000_000, oneOff: 15_000_000 },
  integrace: { label: 'Integrační manažer a jazykové kurzy', description: 'Cizinci se zabydlí asi o 60 % rychleji (dřív hrají naplno).', annual: 2_000_000 },
};

export const PROGRAM_ORDER: ProgramKind[] = ['btym', 'zeny', 'analytika', 'partner', 'integrace'];

export function hasProgram(state: GameState, kind: ProgramKind): boolean {
  return (state.programs ?? []).some((p) => p.kind === kind);
}

export function partnerRegion(state: GameState): ScoutRegion | undefined {
  return (state.programs ?? []).find((p) => p.kind === 'partner')?.region;
}

export function programAnnual(state: GameState, kind: ProgramKind): number {
  return roundMoney(PROGRAMS[kind].annual * scale(tierOf(state, state.owner.clubId)), 50_000);
}

export function programOneOff(state: GameState, kind: ProgramKind): number {
  return roundMoney((PROGRAMS[kind].oneOff ?? 0) * scale(tierOf(state, state.owner.clubId)), 50_000);
}

/** Sponzor ženského fotbalu: třetina nákladů ženského týmu. */
export function womenSponsorMonthly(state: GameState): number {
  return hasProgram(state, 'zeny') ? (programAnnual(state, 'zeny') * 0.35) / 12 : 0;
}

/** Měsíční náklady programů (bez sponzora ženského týmu). */
export function programsMonthly(state: GameState): number {
  return (state.programs ?? []).reduce((a, p) => a + programAnnual(state, p.kind), 0) / 12;
}

export function startProgram(prev: GameState, kind: ProgramKind, region?: ScoutRegion): ActionResult {
  const blocked = ownerBlocked(prev);
  if (blocked) return { state: prev, ok: false, message: blocked };
  if (hasProgram(prev, kind)) return { state: prev, ok: false, message: 'Program už běží.' };
  if (kind === 'partner' && (!region || region === 'velke')) return { state: prev, ok: false, message: 'Vyberte region partnerského klubu.' };
  const oneOff = programOneOff(prev, kind);
  if (oneOff > own(prev).finance.balance) return { state: prev, ok: false, message: `Vstup stojí ${mil(oneOff)}, tolik klub nemá.` };
  const state = structuredClone(prev);
  const program = { kind, since: state.date } as NonNullable<GameState['programs']>[number];
  if (kind === 'partner') {
    const clubs = FOREIGN_CLUBS.filter((c) => c.region === region);
    const pick = clubs[Math.floor(hash01(`${state.seed}-${state.date}-partner`) * clubs.length)];
    program.region = region;
    program.partnerId = FOREIGN_PREFIX + pick.id;
    state.foreign ??= { networks: [], targets: [] };
    state.foreign.networks = state.foreign.networks.filter((r) => r !== region);
  }
  state.programs = [...(state.programs ?? []), program];
  if (oneOff) book(state, state.owner.clubId, 'investice', -oneOff, `Vstup do partnerství: ${PROGRAMS[kind].label}`);
  const message = `Spuštěno: ${PROGRAMS[kind].label}${program.partnerId ? ` (${FOREIGN_CLUBS.find((c) => FOREIGN_PREFIX + c.id === program.partnerId)?.name})` : ''}. Ročně ${mil(programAnnual(state, kind))}.`;
  addNews(state, { kind: 'info', title: message });
  return { state, ok: true, message };
}

export function stopProgram(prev: GameState, kind: ProgramKind): ActionResult {
  if (!hasProgram(prev, kind)) return { state: prev, ok: false, message: 'Program neběží.' };
  const state = structuredClone(prev);
  state.programs = (state.programs ?? []).filter((p) => p.kind !== kind);
  if (kind === 'zeny') {
    // Zrušení ženského týmu město i fanoušci nesou těžce.
    own(state).fanMood = clamp(own(state).fanMood - 5, 0, 100);
    satisfy(state, -6, ['mesto', 'patriot']);
  }
  const message = `Ukončeno: ${PROGRAMS[kind].label}.`;
  addNews(state, { kind: kind === 'zeny' ? 'varovani' : 'info', title: message, text: kind === 'zeny' ? 'Fanoušci a město zrušení ženského týmu kritizují.' : undefined });
  return { state, ok: true, message };
}

export function monthlyPrograms(state: GameState): void {
  const id = state.owner.clubId;
  for (const p of state.programs ?? []) book(state, id, 'programy', -programAnnual(state, p.kind) / 12, PROGRAMS[p.kind].label);
  const sponsor = womenSponsorMonthly(state);
  if (sponsor) {
    book(state, id, 'komercni', sponsor, 'Sponzor ženského fotbalu');
    own(state).fanMood = clamp(own(state).fanMood + 0.25, 0, 100);
    satisfy(state, 0.2, ['mesto', 'patriot']);
  }
}

/** Síla týmu navíc z analytiky (příprava na soupeře). */
export function analyticsBonus(state: GameState): number {
  return hasProgram(state, 'analytika') ? 1 : 0;
}

// ---------- Velké stavby ----------

export interface BigOption {
  kind: BigProjectKind;
  label: string;
  description: string;
  effects: string[];
  cost: number;
  /** Příspěvek města a kraje. */
  grant: number;
  weeks: number;
  years: number;
  capacity?: number;
  /** Odhad ročního přínosu v penězích (u sportovních investic není). */
  yearlyGain?: number;
  /** Návratnost v letech (cena po příspěvku / roční přínos). */
  payback?: number;
  /** Měsíční splátka během stavby. */
  monthly: number;
  blocked?: string;
}

const roundSeats = (v: number) => Math.round(v / 500) * 500;
const SEAT_COST: Record<number, number> = { 1: 85_000, 2: 55_000, 3: 35_000 };
const WEEKS: Record<BigProjectKind, number> = { stadion: 130, velkystadion: 156, areal: 70, komercni: 80 };
/** Vlastní podíl, který musí klub mít na účtu před zahájením (zbytek může financovat investiční úvěr). */
export const OWN_SHARE = 0.2;
/** Roční výnos komerčního areálu jako podíl ceny stavby (nájmy, hotel, kongresy). */
export const COMMERCIAL_YIELD = 0.085;

function monthsOf(weeks: number): number {
  return Math.max(1, Math.round(weeks / 4.345));
}

/** Příspěvek města: podle vztahu ke komunitě a podílu města v klubu. */
function cityShare(state: GameState, kind: BigProjectKind): number {
  if (kind === 'komercni') return 0;
  const club = own(state);
  const base = kind === 'areal' ? 0.1 : 0.15;
  const city = state.shareholders.some((s) => s.kind === 'mesto') ? 0.05 : 0;
  return clamp((base + 0.08 * communityEffect(club, tierOf(state, club.id)) + city) * cityFactor(state), 0.05, 0.35);
}

/** Roční přínos nového stadionu: víc diváků (efekt nového stadionu), lepší catering a skyboxy. */
function stadiumGain(state: GameState, capacity: number): number {
  const club = own(state);
  const tier = tierOf(state, club.id);
  const demand = baseAttendance(club.reputation, tier) * Math.pow(defaultTicketPrice(tier) / Math.max(club.policy.ticketPrice, 1), 0.8) * (0.85 + 0.3 * (club.fanMood / 100));
  const now = Math.min(club.stadium.capacity, demand);
  const after = Math.min(capacity, demand * 1.15);
  const matches = 15;
  const vipNow = club.facilities.vip;
  const vipAfter = Math.max(vipNow, Math.round(capacity / 700));
  return Math.round(
    matches * ((after - now) * club.policy.ticketPrice + after * CATERING_SPEND[3] - now * CATERING_SPEND[club.facilities.catering] + (vipAfter - vipNow) * vipRate(tier)),
  );
}

export function bigProjectOptions(state: GameState): BigOption[] {
  const club = own(state);
  const tier = tierOf(state, club.id);
  // Areály se dimenzují podle velikosti klubu (pověst), ne jen podle soutěže.
  const k = scale(tier) * clamp((club.reputation / 75) ** 2, 0.35, 1.3);
  const seat = SEAT_COST[Math.min(3, tier)] ?? 35_000;
  const cap = club.stadium.capacity;
  const running = state.bigProjects ?? [];
  const stadiumRunning = running.some((p) => p.kind === 'stadion' || p.kind === 'velkystadion') || state.projects.some((p) => p.kind === 'kapacita');
  const small = roundSeats(Math.max(cap * 1.5, cap + 3000, 6000));
  const large = roundSeats(Math.max(cap * 2, cap + 8000, 10000));
  const raw: Omit<BigOption, 'grant' | 'monthly' | 'payback'>[] = [
    {
      kind: 'stadion',
      label: `Nový stadion (${small.toLocaleString('cs-CZ')} míst)`,
      description: 'Moderní stadion místo současného. Během stavby hraje klub na provizorních tribunách (70 % kapacity).',
      effects: [`kapacita ${small.toLocaleString('cs-CZ')} míst`, 'efekt nového stadionu: o 15 % víc diváků', 'catering 4 hvězdy, skyboxy, vyhřívaný trávník', 'pověst +2, nálada fanoušků +15'],
      cost: roundMoney(small * seat, 1_000_000),
      weeks: WEEKS.stadion,
      years: 40,
      capacity: small,
      yearlyGain: stadiumGain(state, small),
    },
    {
      kind: 'velkystadion',
      label: `Velký stadion (${large.toLocaleString('cs-CZ')} míst)`,
      description: 'Stadion pro klub s evropskými ambicemi. Dražší a delší stavba, vyplatí se jen s velkou fanouškovskou základnou.',
      effects: [`kapacita ${large.toLocaleString('cs-CZ')} míst`, 'efekt nového stadionu: o 15 % víc diváků', 'catering 4 hvězdy, skyboxy, vyhřívaný trávník', 'pověst +3, nálada fanoušků +15'],
      cost: roundMoney(large * seat * 1.05, 1_000_000),
      weeks: WEEKS.velkystadion,
      years: 40,
      capacity: large,
      yearlyGain: stadiumGain(state, large),
    },
    {
      kind: 'areal',
      label: 'Tréninkový areál',
      description: 'Komplex hřišť, posilovny, regenerace a ubytování pro mládež. Sportovní investice: nevydělává přímo, ale zlepšuje hráče.',
      effects: ['tréninkové centrum 5 hvězd, medicína aspoň 4', 'vývoj hráčů o 10 % rychlejší', 'lepší hráči mají větší zájem přijít (+3 body)', 'provoz zázemí dražší'],
      cost: roundMoney(220_000_000 * k, 1_000_000),
      weeks: WEEKS.areal,
      years: 30,
    },
    {
      kind: 'komercni',
      label: 'Komerční areál u stadionu',
      description: 'Hotel, obchody, kanceláře a kongresový sál. Stabilní příjem, který nezávisí na výsledcích. Bez dotace.',
      effects: [`nájmy a provoz asi ${Math.round(COMMERCIAL_YIELD * 100 * 10) / 10} % ceny ročně`, 'příjem roste s náladou fanoušků (±15 %)'],
      cost: roundMoney(300_000_000 * k, 1_000_000),
      weeks: WEEKS.komercni,
      years: 40,
    },
  ];
  return raw.map((o) => {
    const grant = roundMoney(o.cost * cityShare(state, o.kind));
    const monthly = Math.round((o.cost - grant) / monthsOf(o.weeks));
    const gain = o.kind === 'komercni' ? Math.round(o.cost * COMMERCIAL_YIELD) : o.yearlyGain;
    const payback = gain && gain > 0 ? (o.cost - grant) / gain : undefined;
    let blocked: string | undefined;
    if ((o.kind === 'stadion' || o.kind === 'velkystadion') && stadiumRunning) blocked = 'Stadion se už staví nebo rozšiřuje.';
    else if (running.some((p) => p.kind === o.kind)) blocked = 'Stavba už probíhá.';
    else if (o.kind === 'areal' && club.facilities.complex) blocked = 'Klub už areál má.';
    else if (o.kind === 'areal' && club.facilities.training < 3) blocked = 'Nejdřív tréninkové centrum aspoň na 3 hvězdy.';
    else if (o.kind === 'komercni' && club.facilities.commercial) blocked = 'Klub už komerční areál má.';
    else if ((o.kind === 'stadion' || o.kind === 'velkystadion') && club.facilities.newStadium && cap >= (o.capacity ?? 0)) blocked = 'Klub už nový stadion této velikosti má.';
    else if ((o.kind === 'stadion' || o.kind === 'velkystadion' || o.kind === 'komercni') && cityPermit(state)) blocked = cityPermit(state);
    else if (club.finance.balance < Math.max(monthly * 3, (o.cost - grant) * OWN_SHARE)) blocked = `Banka financuje nejvýš 80 %: klub musí mít aspoň ${mil(Math.max(monthly * 3, (o.cost - grant) * OWN_SHARE))} vlastních peněz. Pomůže vklad nebo půjčka majitele.`;
    return { ...o, grant, monthly, yearlyGain: gain, payback, blocked };
  });
}

export function startBigProject(prev: GameState, kind: BigProjectKind): ActionResult {
  const option = bigProjectOptions(prev).find((o) => o.kind === kind);
  if (!option) return { state: prev, ok: false, message: 'Tuto stavbu teď nelze zahájit.' };
  if (option.blocked) return { state: prev, ok: false, message: option.blocked };
  const blocked = ownerBlocked(prev);
  if (blocked) return { state: prev, ok: false, message: blocked };
  const vote = previewVote(prev, 'stavba', option.cost);
  if (vote.needed && !vote.passes) return { state: prev, ok: false, message: `Akcionáři stavbu neschválili. ${voteMessage(vote)}` };
  const state = structuredClone(prev);
  const project: BigProject = {
    id: `bp${++state.nextId}`,
    kind,
    label: option.label,
    cost: option.cost,
    grant: option.grant,
    paid: 0,
    start: state.date,
    end: addDays(state.date, option.weeks * 7),
    capacity: option.capacity,
    years: option.years,
  };
  state.bigProjects = [...(state.bigProjects ?? []), project];
  const club = own(state);
  club.finance.assets = [...(club.finance.assets ?? []), { projectId: project.id, label: `${option.label} (rozestavěno)`, value: 0, monthly: 0 }];
  if (kind === 'stadion' || kind === 'velkystadion') club.fanMood = clamp(club.fanMood + 5, 0, 100);
  satisfy(state, kind === 'komercni' ? 3 : 5, kind === 'komercni' ? ['investor', 'spekulant'] : ['mesto', 'patriot']);
  const message = `Zahájena stavba: ${option.label}. Cena ${mil(option.cost)}, město přispěje ${mil(option.grant)}, splátky asi ${mil(option.monthly)} měsíčně do ${project.end.split('-').reverse().join('. ')}. Na splátky můžete čerpat investiční úvěr (Finance › Financování).`;
  addNews(state, { kind: 'sezona', title: `Zahájena stavba: ${option.label}`, text: message });
  return { state, ok: true, message };
}

/** Zbývá zaplatit (po příspěvku města). */
export function bigRemaining(p: BigProject): number {
  return Math.max(0, p.cost - p.grant - p.paid);
}

function monthsLeft(state: GameState, p: BigProject): number {
  const [y1, m1] = state.date.split('-').map(Number);
  const [y2, m2] = p.end.split('-').map(Number);
  return Math.max(1, (y2 - y1) * 12 + (m2 - m1) + 1);
}

/** Měsíční splátka stavby. */
export function bigMonthly(state: GameState, p: BigProject): number {
  return Math.round(bigRemaining(p) / monthsLeft(state, p));
}

/** Plán splátek staveb od zítřka (pro výhled peněz): datum začátku měsíce a částka. */
export function bigPaymentSchedule(state: GameState): { date: string; amount: number }[] {
  const out: { date: string; amount: number }[] = [];
  for (const p of state.bigProjects ?? []) {
    let left = bigRemaining(p);
    const n = monthsLeft(state, p);
    const per = left / n;
    let [y, m] = state.date.split('-').map(Number);
    for (let i = 0; i < n && left > 1; i++) {
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
      const amount = Math.min(left, per);
      left -= amount;
      out.push({ date: `${y}-${String(m).padStart(2, '0')}-01`, amount });
    }
  }
  return out;
}

function payInto(state: GameState, p: BigProject, amount: number): void {
  const value = Math.round(Math.min(amount, bigRemaining(p)));
  if (value <= 0) return;
  book(state, state.owner.clubId, 'investice', -value, `Splátka stavby: ${p.label}`);
  p.paid += value;
  const asset = own(state).finance.assets?.find((a) => a.projectId === p.id);
  if (asset) asset.value += value;
}

/** Každý měsíc: splátky staveb, riziko překročení rozpočtu a nájem z komerčního areálu. */
export function monthlyBigProjects(state: GameState, rng: Rng): void {
  for (const p of state.bigProjects ?? []) {
    payInto(state, p, bigMonthly(state, p));
    if (!p.overrun && rng.chance(0.025)) {
      p.overrun = true;
      const extra = roundMoney(p.cost * (0.05 + 0.15 * rng.next()), 1_000_000);
      const delay = rng.int(6, 16);
      p.cost += extra;
      p.end = addDays(p.end, delay * 7);
      addNews(state, {
        kind: 'varovani',
        title: `Stavba se prodraží: ${p.label}`,
        text: `Dodavatel hlásí vícepráce za ${mil(extra)} a zpoždění o ${delay} týdnů. Splátky se rozloží do zbytku stavby.`,
      });
    }
  }
  const income = commercialIncomeMonthly(state);
  if (income > 0) book(state, state.owner.clubId, 'areal', income, 'Komerční areál: hotel, obchody, kongresy');
}

/** Měsíční výnos komerčního areálu (podle nálady fanoušků ±15 %). */
export function commercialIncomeMonthly(state: GameState): number {
  const club = own(state);
  const value = club.facilities.commercial ?? 0;
  return value ? Math.round(((value * COMMERCIAL_YIELD) / 12) * (0.85 + 0.3 * (club.fanMood / 100))) : 0;
}

/** Dokončení velkých staveb (denně). */
export function completeBigProjects(state: GameState): void {
  const club = own(state);
  for (const p of (state.bigProjects ?? []).filter((x) => x.end <= state.date)) {
    payInto(state, p, bigRemaining(p));
    const f = club.facilities;
    if (p.kind === 'stadion' || p.kind === 'velkystadion') {
      club.stadium.capacity = Math.max(club.stadium.capacity, p.capacity ?? club.stadium.capacity);
      f.vip = Math.max(f.vip, Math.round(club.stadium.capacity / 700));
      f.catering = 3;
      f.heating = true;
      f.newStadium = true;
      club.reputation = Math.min(99, club.reputation + (p.kind === 'velkystadion' ? 3 : 2));
      club.fanMood = clamp(club.fanMood + 15, 0, 100);
    }
    if (p.kind === 'areal') {
      f.training = 5;
      f.medical = Math.max(f.medical, 4);
      f.complex = true;
    }
    if (p.kind === 'komercni') f.commercial = p.cost;
    if (p.kind === 'stadion' || p.kind === 'velkystadion') addTrophy(state, 'stadion', `Otevření nového stadionu (${(p.capacity ?? 0).toLocaleString('cs-CZ')} míst)`);
    const asset = club.finance.assets?.find((a) => a.projectId === p.id);
    if (asset) {
      asset.projectId = undefined;
      asset.label = p.label;
      asset.monthly = asset.value / (p.years * 12);
    }
    addNews(state, { kind: 'sezona', title: `Dokončeno: ${p.label}`, text: `Celkem ${mil(p.cost)}, z toho město ${mil(p.grant)}.` });
  }
  state.bigProjects = (state.bigProjects ?? []).filter((x) => x.end > state.date);
}

/** Během stavby nového stadionu hraje klub na provizorních tribunách. */
export function stadiumBuilding(state: GameState): boolean {
  return (state.bigProjects ?? []).some((p) => p.kind === 'stadion' || p.kind === 'velkystadion');
}

/** Rozestavěno (pro investiční úvěr): zbývá zaplatit. */
export function bigBuildingOutstanding(state: GameState): number {
  return (state.bigProjects ?? []).reduce((a, p) => a + bigRemaining(p), 0);
}
