import { addDays, parseDate } from './calendar';
import { allFixtures } from './competitions';
import { FORMATIONS, isAvailable, selectLineup } from './match';
import { bestEleven, playerAge, squadOf } from './players';
import type { ActionResult } from './staff';
import { coachOf } from './staff';
import type { GameEvent, GameState, Player, Position } from './types';
import { addNews, clamp } from './world';

/**
 * W4: Složení týmu, týmová chemie, kapitán a hierarchie kabiny.
 *
 * Chemie 0–100 se počítá jen z dat hry: společně odehrané minuty (dvojice a řady), stabilita
 * základní sestavy, počet nových hráčů, jazykové skupiny (národnost a délka v klubu), spokojenost
 * (morálka, platová propast), kapitán a lídři (věk, délka v klubu, místo v sestavě) a výsledky.
 * Skutečným hráčům se nepřisuzuje žádné chování mimo hřiště: konflikty jsou anonymní a kapitán
 * je jen sportovní role.
 *
 * Dopad (jen klub majitele, jako nálada kabiny v atmosphere.ts): síla v zápase ±2 body (asi ±3 %),
 * měsíční posun morálky a odolnost proti porážkám (po prohře klesne morálka méně / víc).
 *
 * Čtecí API pro ostatní moduly: `teamChemistry(state, clubId?)` a `chemistryEffect(state, clubId?)`.
 */

// ---------- Stav ----------

export interface ChemistryState {
  /** Společné minuty dvojic v zápasech (klíč „idA|idB“ seřazeně), jen klub majitele. */
  pairs?: Record<string, number>;
  /** Posledních až 6 základních sestav klubu majitele. */
  lineups?: { date: string; ids: string[] }[];
  /** Zpracované zápasy (id), aby se minuty nepočítaly dvakrát. */
  done?: string[];
  /** Týdenní záznam hodnoty chemie (nejvýš 26 týdnů). */
  history?: { date: string; value: number }[];
  /** Kapitán zvolený majitelem (bez volby platí návrh trenéra). */
  captainId?: string;
  /** Lídři kabiny zvolení majitelem (2–3, bez volby návrh trenéra). */
  leaders?: string[];
  /** Sezóna, pro kterou je kapitán potvrzený (rozhodnutí na začátku sezóny). */
  decidedSeason?: number;
  /** Kdy se kapitán naposledy měnil uprostřed sezóny (kabina si zvyká). */
  changedAt?: string;
  /** Kdy přišla poslední zpráva o poklesu chemie. */
  warnedAt?: string;
}

export function chemistryState(state: GameState): ChemistryState {
  state.chemistry ??= {};
  return state.chemistry;
}

// ---------- Konstanty a kalibrace ----------

/** Hodnota chemie, při které je vliv na sílu nulový (kalibrace engine/zzsim/w4_chem.test.ts). */
export const CHEMISTRY_CENTER = 78;
/** Ladění pro simulace v engine/zzsim (0 = chemie bez vlivu na sílu). */
export const CHEMISTRY_TUNING = { scale: 1 };
/** O kolik bodů chemie od středu je vliv plný. */
const CHEMISTRY_SPAN = 18;
/** Nejvyšší vliv na sílu v zápase v bodech síly (síla týmu ~60–75 → asi ±3 %). */
export const CHEMISTRY_MAX_BONUS = 2;
/** Do kolika dní od příchodu je hráč „nový“. */
const NEW_DAYS = 183;
/** Délka v klubu hráčů z původního kádru (přišli před začátkem hry) – bez vymyšlených dat. */
const ORIGINAL_TENURE = 730;

const WEIGHTS = { souhra: 0.22, stabilita: 0.13, novacci: 0.15, skupiny: 0.12, nalada: 0.15, lidri: 0.13, vysledky: 0.1 } as const;
export type ChemistryKey = keyof typeof WEIGHTS;

const LINE_LABEL: Record<Position, string> = { GK: 'brankář', DF: 'obrana', MF: 'záloha', FW: 'útok' };

// ---------- Pomocné výpočty z dat ----------

const days = (from: string, to: string) => Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000);

/** Datum příchodu do klubu (poslední přestup do klubu). Bez záznamu = původní kádr. */
export function joinedClub(p: Player, clubId: string): string | undefined {
  for (let i = p.transfers.length - 1; i >= 0; i--) if (p.transfers[i].to === clubId) return p.transfers[i].date;
  return undefined;
}

/** Kolik dní je hráč v klubu (původní kádr a odchovanci se berou jako zabydlení). */
export function tenureDays(state: GameState, p: Player, clubId = p.clubId): number {
  const joined = joinedClub(p, clubId);
  const base = joined ? Math.max(0, days(joined, state.date)) : ORIGINAL_TENURE;
  return base + (p.academy === clubId ? 365 : 0);
}

const SLAVIC = ['Polsko', 'Ukrajina', 'Srbsko', 'Chorvatsko', 'Slovinsko', 'Bosna a Hercegovina', 'Černá Hora', 'Makedonie', 'Severní Makedonie', 'Bulharsko', 'Rusko', 'Bělorusko', 'Kosovo'];
const FRENCH = ['Francie', 'Belgie', 'Senegal', 'Kamerun', 'Burkina Faso', 'Pobřeží slonoviny', 'Pobřeží slonoviny (Côte ď Ivoire)', 'Guinea', 'Mali', 'Togo', 'Benin', 'Gabon', 'Středoafrická republika', 'Konžská dem. republika', 'DR Kongo', 'Burundi', 'Maroko', 'Švýcarsko'];
const ENGLISH = ['Nigérie', 'Gambie', 'Ghana', 'Zambie', 'Libérie', 'Uganda', 'Anglie', 'Skotsko', 'Spojené státy americké', 'Kanada', 'Austrálie', 'Trinidad a Tobago', 'Irsko'];
const IBERIAN = ['Brazílie', 'Portugalsko', 'Angola', 'Kapverdy', 'Španělsko', 'Argentina', 'Kolumbie', 'Ekvádor', 'Peru', 'Kostarika', 'Uruguay', 'Rovníková Guinea', 'Mexiko', 'Chile'];
const NORDIC = ['Švédsko', 'Norsko', 'Dánsko', 'Island', 'Finsko'];
const GERMAN = ['Německo', 'Rakousko', 'Nizozemsko'];
const GROUP_OF = new Map<string, string>([
  ...SLAVIC.map((c) => [c, 'slovanske'] as const),
  ...FRENCH.map((c) => [c, 'francouzske'] as const),
  ...ENGLISH.map((c) => [c, 'anglicke'] as const),
  ...IBERIAN.map((c) => [c, 'iberske'] as const),
  ...NORDIC.map((c) => [c, 'severske'] as const),
  ...GERMAN.map((c) => [c, 'nemecke'] as const),
]);
export const LANGUAGE_GROUP_LABEL: Record<string, string> = {
  cs: 'čeština a slovenština',
  slovanske: 'slovanské jazyky',
  francouzske: 'francouzsky mluvící',
  anglicke: 'anglicky mluvící',
  iberske: 'portugalsky a španělsky mluvící',
  severske: 'severské země',
  nemecke: 'německy a nizozemsky mluvící',
};

/**
 * Jazyková skupina hráče z národnosti. Cizinec po 18 měsících v klubu (doloženo přestupem během hry)
 * už se domluví česky; u původního kádru délku pobytu neznáme, platí národnost.
 */
export function chemistryLanguage(state: GameState, p: Player, clubId = p.clubId): string {
  const nat = p.nationality;
  if (!nat || nat === 'Česko' || nat === 'Slovensko') return 'cs';
  const joined = joinedClub(p, clubId);
  if (joined && days(joined, state.date) >= 540) return 'cs';
  return GROUP_OF.get(nat) ?? `zeme:${nat}`;
}

export function languageLabel(group: string): string {
  return LANGUAGE_GROUP_LABEL[group] ?? group.replace('zeme:', '');
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Sehranost dvojice 0–1: společné minuty (klub majitele), jinak společná doba v klubu. */
function familiarity(state: GameState, a: Player, b: Player, clubId: string): number {
  const own = clubId === state.owner.clubId;
  const mins = own ? state.chemistry?.pairs?.[pairKey(a.id, b.id)] ?? 0 : 0;
  // Plná sehranost asi po 30 společných zápasech; bez sledovaných minut odhad z doby v klubu (nejvýš 0,6).
  const fromMinutes = Math.min(1, mins / 2700);
  const shared = Math.min(tenureDays(state, a, clubId), tenureDays(state, b, clubId));
  const fromTenure = Math.min(1, shared / 540) * 0.6;
  return Math.max(fromMinutes, fromTenure);
}

function captainScore(state: GameState, p: Player, clubId: string, xi: Set<string>): number {
  const age = playerAge(p, state.season);
  return (
    clamp(age - 20, 0, 13) +
    p.overall / 6 +
    Math.min(5, tenureDays(state, p, clubId) / 365) * 1.6 +
    (p.academy === clubId ? 2 : 0) +
    Math.min(4, (p.intl?.caps ?? 0) / 10) +
    (xi.has(p.id) ? 4 : -3) +
    (p.loan ? -6 : 0)
  );
}

function coreOf(squad: Player[], n: number): Player[] {
  return [...squad].sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id)).slice(0, n);
}

/** Návrh trenéra: kapitán a lídři podle věku, délky v klubu, zkušeností a místa v sestavě. */
export function coachLeadershipPick(state: GameState, clubId = state.owner.clubId, squad = squadOf(state, clubId)): { captainId?: string; leaders: string[] } {
  const xi = new Set(bestEleven(squad).map((p) => p.id));
  const ranked = coreOf(squad, 16)
    .map((p) => ({ p, s: captainScore(state, p, clubId, xi) }))
    .sort((a, b) => b.s - a.s || a.p.id.localeCompare(b.p.id));
  return { captainId: ranked[0]?.p.id, leaders: ranked.slice(1, 3).map((x) => x.p.id) };
}

/** Kapitán týmu: volba majitele, jinak návrh trenéra (cizí kluby: návrh trenéra). */
export function currentCaptain(state: GameState, clubId = state.owner.clubId): Player | undefined {
  const chosen = clubId === state.owner.clubId ? state.chemistry?.captainId : undefined;
  const p = chosen ? state.players[chosen] : undefined;
  if (p && p.clubId === clubId) return p;
  const pick = coachLeadershipPick(state, clubId).captainId;
  return pick ? state.players[pick] : undefined;
}

/** Lídři kabiny (bez kapitána): volba majitele, jinak návrh trenéra. */
export function currentLeaders(state: GameState, clubId = state.owner.clubId): Player[] {
  const cap = currentCaptain(state, clubId)?.id;
  const chosen = clubId === state.owner.clubId ? state.chemistry?.leaders : undefined;
  const valid = (chosen ?? []).map((id) => state.players[id]).filter((p): p is Player => !!p && p.clubId === clubId && p.id !== cap);
  if (chosen && valid.length) return valid.slice(0, 3);
  const pick = coachLeadershipPick(state, clubId);
  const ids = [pick.captainId, ...pick.leaders].filter((id): id is string => !!id && id !== cap);
  return ids.slice(0, 2).map((id) => state.players[id]);
}

function recentResults(state: GameState, clubId: string, n = 6): number[] {
  const list = allFixtures(state)
    .map((x) => x.fixture)
    .filter((f) => f.result && f.date <= state.date && (f.homeId === clubId || f.awayId === clubId))
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, n);
  return list.map((f) => {
    const home = f.homeId === clubId;
    const gf = home ? f.result!.homeGoals : f.result!.awayGoals;
    const ga = home ? f.result!.awayGoals : f.result!.homeGoals;
    return gf > ga ? 3 : gf === ga ? 1 : 0;
  });
}

// ---------- Výpočet chemie ----------

export interface ChemistryPart {
  key: ChemistryKey;
  label: string;
  /** 0–100 */
  value: number;
  /** Váha ve výsledné hodnotě (0–1). */
  weight: number;
  why: string;
}

export interface TeamChemistry {
  value: number;
  label: string;
  tone: 'good' | 'warn' | 'bad' | 'neutral';
  parts: ChemistryPart[];
  /** Změna proti stavu asi před měsícem (0 = bez dat). */
  trend: number;
  /** Sehranost řad 0–100 (pro vizuál hřiště). */
  lines: Partial<Record<Position, number>>;
}

export function chemistryLabel(v: number): { label: string; tone: TeamChemistry['tone'] } {
  if (v >= 82) return { label: 'skvělá parta', tone: 'good' };
  if (v >= 68) return { label: 'dobře sehraný tým', tone: 'good' };
  if (v >= 52) return { label: 'tým se hledá', tone: 'warn' };
  return { label: 'rozpadlá kabina', tone: 'bad' };
}

const plural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

/**
 * Týmová chemie klubu. `extra` = hypotetický nový hráč (odhad dopadu přestupu), `without` = hráč, který by odešel.
 * Nemění stav.
 */
export function teamChemistry(state: GameState, clubId = state.owner.clubId, opts: { extra?: Player; without?: string } = {}): TeamChemistry {
  let squad = squadOf(state, clubId);
  if (opts.without) squad = squad.filter((p) => p.id !== opts.without);
  if (opts.extra) squad = [...squad.filter((p) => p.id !== opts.extra!.id), opts.extra];
  const own = clubId === state.owner.clubId;
  const chem = own ? state.chemistry : undefined;
  if (squad.length < 11) {
    const parts: ChemistryPart[] = (Object.keys(WEIGHTS) as ChemistryKey[]).map((key) => ({ key, label: PART_LABEL[key], value: 30, weight: WEIGHTS[key], why: 'Kádr nemá ani jedenáct hráčů.' }));
    return { value: 30, ...chemistryLabel(30), parts, trend: 0, lines: {} };
  }
  const xi = bestEleven(squad);
  const xiIds = new Set(xi.map((p) => p.id));
  const core = coreOf(squad, 16);
  const parts: ChemistryPart[] = [];
  const add = (key: ChemistryKey, value: number, why: string) => parts.push({ key, label: PART_LABEL[key], value: Math.round(clamp(value, 0, 100)), weight: WEIGHTS[key], why });

  // 1. Souhra jedenáctky: dvojice v jedné řadě (a brankář s obranou) se počítají dvojnásob.
  const lineSum: Partial<Record<Position, { s: number; n: number }>> = {};
  let sum = 0;
  let wsum = 0;
  for (let i = 0; i < xi.length; i++) {
    for (let j = i + 1; j < xi.length; j++) {
      const a = xi[i];
      const b = xi[j];
      const same = a.position === b.position || (a.position === 'GK' && b.position === 'DF') || (a.position === 'DF' && b.position === 'GK');
      const w = same ? 2 : 1;
      const f = familiarity(state, a, b, clubId);
      sum += f * w;
      wsum += w;
      if (same) {
        const line = a.position === 'GK' || b.position === 'GK' ? 'DF' : a.position;
        const l = (lineSum[line] ??= { s: 0, n: 0 });
        l.s += f;
        l.n += 1;
      }
    }
  }
  const avgFam = wsum ? sum / wsum : 0;
  const lines: Partial<Record<Position, number>> = {};
  for (const [pos, l] of Object.entries(lineSum) as [Position, { s: number; n: number }][]) lines[pos] = Math.round(20 + 80 * (l.s / l.n));
  const weakest = (Object.entries(lines) as [Position, number][]).sort((a, b) => a[1] - b[1])[0];
  const pairMins = own && chem?.pairs ? Object.keys(chem.pairs).length : 0;
  add(
    'souhra',
    20 + 80 * avgFam,
    weakest && weakest[1] < 60
      ? `Nejméně sehraná řada: ${LINE_LABEL[weakest[0]]} (${weakest[1]}). Souhra roste se společně odehranými minutami.`
      : avgFam >= 0.8
        ? 'Základní jedenáctka spolu odehrála hodně minut, řady se znají.'
        : pairMins
          ? 'Řady se znají z tréninku, společné minuty v zápasech se teprve sčítají (plná souhra asi po 30 společných zápasech).'
          : 'Odhad podle délky v klubu, společné minuty v zápasech se teprve sčítají.',
  );

  // 2. Stabilita sestavy: překryv po sobě jdoucích základních sestav.
  let overlap: number | undefined;
  const ups = own ? chem?.lineups ?? [] : [];
  if (ups.length >= 2) {
    const last = ups.slice(-6);
    let s = 0;
    for (let i = 1; i < last.length; i++) s += last[i].ids.filter((id) => last[i - 1].ids.includes(id)).length;
    overlap = s / (last.length - 1);
  } else {
    // Bez záznamu sestav odhad z počtu startů: jak velkou část startů mají nejčastější hráči.
    const starts = squad.map((p) => p.starts).sort((a, b) => b - a);
    const total = starts.reduce((a, b) => a + b, 0);
    if (total >= 33) overlap = (starts.slice(0, 11).reduce((a, b) => a + b, 0) / total) * 11;
  }
  if (overlap === undefined) add('stabilita', 65, 'Sezóna teprve začíná, sestava se ještě neustálila.');
  else add('stabilita', 15 + 85 * ((overlap - 4) / 7), `Mezi zápasy se v základní sestavě v průměru mění ${Math.max(0, Math.round((11 - overlap) * 10) / 10).toLocaleString('cs-CZ')} ${plural(Math.round(11 - overlap), 'hráč', 'hráči', 'hráčů')}.`);

  // 3. Noví hráči: velká výměna kádru srazí chemii.
  const isNew = (p: Player) => {
    const j = p === opts.extra ? state.date : joinedClub(p, clubId);
    return !!j && days(j, state.date) < NEW_DAYS;
  };
  const newXi = xi.filter(isNew).length;
  const newBench = core.filter((p) => !xiIds.has(p.id) && isNew(p)).length;
  add(
    'novacci',
    100 - 12 * (newXi + 0.6 * newBench),
    newXi + newBench === 0
      ? 'Žádný nový hráč v kádru, tým se zná.'
      : `${newXi + newBench} ${plural(newXi + newBench, 'nový hráč', 'noví hráči', 'nových hráčů')} v širším kádru (${newXi} v základu). Zabydlení trvá asi půl roku.`,
  );

  // 4. Jazykové skupiny: víc malých izolovaných skupin = horší.
  const groups = new Map<string, number>();
  const core18 = coreOf(squad, 18);
  for (const p of core18) {
    const g = p === opts.extra ? chemistryLanguage(state, { ...p, transfers: [...p.transfers, { date: state.date, from: '', to: clubId, fee: 0 }] }, clubId) : chemistryLanguage(state, p, clubId);
    groups.set(g, (groups.get(g) ?? 0) + 1);
  }
  const main = [...groups.entries()].sort((a, b) => b[1] - a[1])[0];
  const isolated = [...groups.entries()].filter(([g, n]) => n === 1 && g !== main[0]).length;
  const small = [...groups.entries()].filter(([g, n]) => n >= 2 && n <= 3 && g !== main[0]).length;
  const mainShare = main[1] / core18.length;
  add(
    'skupiny',
    100 - isolated * 10 - small * 5 - (mainShare < 0.5 ? 15 : 0),
    isolated + small === 0
      ? 'Kabina se domluví jedním jazykem.'
      : `${groups.size} ${plural(groups.size, 'jazyková skupina', 'jazykové skupiny', 'jazykových skupin')}, z toho ${isolated} ${plural(isolated, 'hráč', 'hráči', 'hráčů')} bez krajana${small ? ` a ${small} ${plural(small, 'malá skupina', 'malé skupiny', 'malých skupin')}` : ''}. Cizinci se po roce a půl v klubu zapojí.`,
  );

  // 5. Spokojenost: morálka opor, nespokojenci, platová propast.
  const morale = core.reduce((a, p) => a + (p.morale ?? 60), 0) / core.length;
  const unhappy = core.filter((p) => (p.morale ?? 60) < 40).length;
  const wages = [...squad].map((p) => p.wage).sort((a, b) => a - b);
  const median = wages[Math.floor(wages.length / 2)] ?? 0;
  const gap = median > 0 && wages[wages.length - 1] > median * 4;
  // W5: platové pravidlo majitele (engine/ownerdecisions.ts) – strop propast tlumí, výjimka pro hvězdu ji drží.
  const wageRule = clubId === state.owner.clubId ? state.ownerDecisions?.wageRule : undefined;
  const ruleEdge = wageRule?.kind === 'strop' ? 4 + (gap ? 4 : 0) : 0;
  const ruleWhy = wageRule?.kind === 'strop' ? `. Platí platový strop ${wageRule.multiple}× průměru, kabina ho vnímá jako férový` : wageRule?.kind === 'vyjimka' ? `. Hvězda ${wageRule.starName ?? ''} má platovou výjimku, ostatní mají strop ${wageRule.multiple}× průměru` : gap ? ' (bez platového pravidla majitele)' : '';
  add(
    'nalada',
    50 + (morale - 65) * 1.6 - unhappy * 5 - (gap ? 8 : 0) + ruleEdge,
    `Průměrná morálka opor ${Math.round(morale)}${unhappy ? `, ${unhappy} ${plural(unhappy, 'nespokojený hráč', 'nespokojení hráči', 'nespokojených hráčů')} (málo minut nebo plat)` : ''}${gap ? '. Nejvyšší plat je víc než čtyřnásobek mediánu, kabina to vnímá' : ''}${ruleWhy}.`,
  );

  // 6. Kapitán a lídři.
  const cap = currentCaptainIn(state, clubId, squad);
  const leaders = currentLeadersIn(state, clubId, squad, cap?.id).slice(0, 3);
  let lead = 20;
  const why: string[] = [];
  if (cap) {
    const age = playerAge(cap, state.season);
    lead += clamp((age - 21) / 8, 0, 1) * 15 + clamp(tenureDays(state, cap, clubId) / 730, 0, 1) * 15 + (xiIds.has(cap.id) ? 10 : 0);
    why.push(`Kapitán ${cap.firstName} ${cap.lastName} (${age} let${xiIds.has(cap.id) ? ', hraje v základu' : ', mimo základ'})`);
  } else why.push('Tým nemá kapitána');
  for (const l of leaders) lead += (playerAge(l, state.season) >= 26 ? 4 : 2) + (tenureDays(state, l, clubId) >= 365 ? 3 : 0) + (xiIds.has(l.id) ? 2 : 0);
  why.push(`${leaders.length} ${plural(leaders.length, 'lídr', 'lídři', 'lídrů')} kabiny`);
  if (own && chem?.changedAt) {
    const since = days(chem.changedAt, state.date);
    if (since < 90) {
      lead -= 20 * (1 - since / 90);
      why.push('kabina si zvyká na změnu kapitána');
    }
  }
  add('lidri', lead, `${why.join(', ')}.`);

  // 7. Výsledky.
  const res = recentResults(state, clubId);
  const share = res.length ? res.reduce((a, b) => a + b, 0) / (res.length * 3) : 0.45;
  add('vysledky', 25 + 70 * share, res.length ? `${res.filter((x) => x === 3).length} ${plural(res.filter((x) => x === 3).length, 'výhra', 'výhry', 'výher')} z posledních ${res.length} zápasů.` : 'Zatím bez soutěžních zápasů.');

  const value = Math.round(parts.reduce((a, p) => a + p.value * p.weight, 0));
  const hist = own ? chem?.history ?? [] : [];
  const ref = [...hist].reverse().find((h) => days(h.date, state.date) >= 21);
  return { value, ...chemistryLabel(value), parts, trend: ref ? value - ref.value : 0, lines };
}

/** Kapitán v hypotetickém kádru (odhad přestupu): volba majitele, pokud v kádru zůstává. */
function currentCaptainIn(state: GameState, clubId: string, squad: Player[]): Player | undefined {
  const chosen = clubId === state.owner.clubId ? state.chemistry?.captainId : undefined;
  const p = chosen ? squad.find((x) => x.id === chosen) : undefined;
  if (p) return p;
  const id = coachLeadershipPick(state, clubId, squad).captainId;
  return squad.find((x) => x.id === id);
}

function currentLeadersIn(state: GameState, clubId: string, squad: Player[], cap?: string): Player[] {
  const chosen = clubId === state.owner.clubId ? state.chemistry?.leaders : undefined;
  const valid = (chosen ?? []).map((id) => squad.find((x) => x.id === id)).filter((p): p is Player => !!p && p.id !== cap);
  if (chosen && valid.length) return valid;
  const pick = coachLeadershipPick(state, clubId, squad);
  return [pick.captainId, ...pick.leaders].filter((id) => id && id !== cap).slice(0, 2).map((id) => squad.find((x) => x.id === id)!).filter(Boolean);
}

const PART_LABEL: Record<ChemistryKey, string> = {
  souhra: 'Souhra jedenáctky',
  stabilita: 'Stabilita sestavy',
  novacci: 'Noví hráči',
  skupiny: 'Jazykové skupiny',
  nalada: 'Spokojenost v kabině',
  lidri: 'Kapitán a lídři',
  vysledky: 'Výsledky',
};

// ---------- Dopad ----------

export interface ChemistryEffect {
  value: number;
  /** Bonus síly v zápase (body síly). */
  strength: number;
  /** Násobek poklesu morálky po prohře (0,5 = polovina, 1,4 = o 40 % víc). */
  lossFactor: number;
  /** Měsíční posun morálky hráčů. */
  moraleDrift: number;
  text: string;
}

export function chemistryEffectOf(value: number): Omit<ChemistryEffect, 'text'> {
  const strength = Math.round(clamp((value - CHEMISTRY_CENTER) / CHEMISTRY_SPAN, -1, 1) * CHEMISTRY_MAX_BONUS * CHEMISTRY_TUNING.scale * 100) / 100;
  const lossFactor = Math.round(clamp(1 - (value - CHEMISTRY_CENTER) / 40, 0.5, 1.4) * 100) / 100;
  const moraleDrift = Math.round(clamp((value - CHEMISTRY_CENTER) / 15, -1.5, 1.5) * 10) / 10;
  return { value, strength, lossFactor, moraleDrift };
}

/** Dopad chemie na tým (síla v zápase, odolnost proti porážkám, morálka). */
export function chemistryEffect(state: GameState, clubId = state.owner.clubId): ChemistryEffect {
  const { value } = teamChemistry(state, clubId);
  const e = chemistryEffectOf(value);
  const pct = Math.round((e.strength / 65) * 1000) / 10;
  const loss = Math.round((1 - e.lossFactor) * 100);
  const text = `Síla v zápase ${pct >= 0 ? '+' : '−'}${Math.abs(pct).toLocaleString('cs-CZ')} %, po porážce klesne morálka ${loss >= 0 ? `o ${loss} % méně` : `o ${-loss} % víc`}.`;
  return { ...e, text };
}

/** Bonus síly v zápase pro klub majitele (volá se z playMatchesOn a evropských zápasů). */
export function chemistryMatchBonus(state: GameState): number {
  return chemistryEffect(state, state.owner.clubId).strength;
}

/** Odhad dopadu příchodu hráče na chemii klubu majitele (karta hráče, lov, přestupy). */
export function chemistryImpact(state: GameState, p: Player): { delta: number; text: string } {
  const own = state.owner.clubId;
  if (p.clubId === own) return { delta: 0, text: '' };
  const base = teamChemistry(state, own).value;
  const virtual: Player = { ...p, clubId: own, morale: 65, transfers: [...p.transfers, { date: state.date, from: p.clubId, to: own, fee: 0 }] };
  const after = teamChemistry(state, own, { extra: virtual }).value;
  const delta = after - base;
  const squad = squadOf(state, own);
  const xi = new Set(bestEleven([...squad, virtual]).map((x) => x.id));
  const group = chemistryLanguage(state, virtual, own);
  const mates = squad.filter((x) => chemistryLanguage(state, x, own) === group).length;
  const bits = [xi.has(virtual.id) ? 'nový hráč do základu' : 'spíš na lavičku'];
  if (group !== 'cs') bits.push(mates ? `${mates} ${plural(mates, 'hráč', 'hráči', 'hráčů')} se stejným jazykem` : 'bez krajana v kádru');
  return { delta, text: `Chemie ${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${Math.abs(delta)} (${bits.join(', ')})` };
}

// ---------- Složení týmu ----------

export interface ShapeSlot {
  position: Position;
  starter?: Player;
  backup?: Player;
  /** Díra: bez náhradníka, nebo základ výrazně pod úrovní týmu. */
  weak?: string;
}

export interface SquadShape {
  formation: string;
  xi: Player[];
  bench: Player[];
  lines: { position: Position; label: string; need: number; players: Player[]; starters: Player[]; avg: number; weak?: string }[];
  ages: { label: string; count: number; minutesShare: number }[];
  avgAge: number;
  foreigners: number;
  nonEu: number;
  nonEuLimit: number;
  academy: number;
  expiring: Player[];
  topWages: Player[];
  wageMedian: number;
  unavailable: Player[];
  tired: Player[];
  inForm: Player[];
  outOfForm: Player[];
}

const NON_EU = 7; // engine/foreign.ts NON_EU_LIMIT (bez importu kvůli závislostem)

/** Složení kádru klubu majitele: rozestavení, hloubka postů, věk, cizinci, smlouvy, platy, forma. */
export function squadShape(state: GameState, clubId = state.owner.clubId): SquadShape {
  const squad = squadOf(state, clubId);
  const coach = coachOf(state, clubId);
  const style = coach?.style ?? 'vyvazeny';
  const shape = FORMATIONS[style].shape;
  const lineup = selectLineup(squad, style, !!coach?.youthFocus, state.date, state.season);
  const teamAvg = lineup.xi.length ? lineup.xi.reduce((a, p) => a + p.overall, 0) / lineup.xi.length : 0;
  const labels: Record<Position, string> = { GK: 'Brankáři', DF: 'Obrana', MF: 'Záloha', FW: 'Útok' };
  const lines = (['GK', 'DF', 'MF', 'FW'] as Position[]).map((pos) => {
    const players = squad.filter((p) => p.position === pos).sort((a, b) => b.overall - a.overall);
    const fit = players.filter((p) => isAvailable(p, state.date));
    const starters = lineup.xi.filter((p) => p.position === pos);
    const need = shape[pos];
    const avg = starters.length ? starters.reduce((a, p) => a + p.overall, 0) / starters.length : 0;
    let weak: string | undefined;
    if (fit.length < need) weak = `chybí ${need - fit.length} ${plural(need - fit.length, 'hráč', 'hráči', 'hráčů')} do základu`;
    else if (fit.length < need + 1) weak = 'bez náhradníka';
    else if (avg && avg < teamAvg - 4) weak = `základ o ${Math.round(teamAvg - avg)} pod úrovní týmu`;
    return { position: pos, label: labels[pos], need, players, starters, avg: Math.round(avg), weak };
  });
  const buckets: [string, number, number][] = [['do 21', 0, 21], ['22–25', 22, 25], ['26–29', 26, 29], ['30–33', 30, 33], ['34+', 34, 99]];
  const totalMin = squad.reduce((a, p) => a + p.minutes, 0);
  const ages = buckets.map(([label, lo, hi]) => {
    const list = squad.filter((p) => {
      const a = playerAge(p, state.season);
      return a >= lo && a <= hi;
    });
    return { label, count: list.length, minutesShare: totalMin ? Math.round((list.reduce((a, p) => a + p.minutes, 0) / totalMin) * 100) : 0 };
  });
  const wages = squad.map((p) => p.wage).sort((a, b) => a - b);
  const avgForm = (p: Player) => (p.recent.length ? p.recent.reduce((a, b) => a + b, 0) / p.recent.length : 0);
  return {
    formation: FORMATIONS[style].name,
    xi: lineup.xi,
    bench: lineup.bench,
    lines,
    ages,
    avgAge: squad.length ? Math.round((squad.reduce((a, p) => a + playerAge(p, state.season), 0) / squad.length) * 10) / 10 : 0,
    foreigners: squad.filter((p) => p.nationality && p.nationality !== 'Česko').length,
    nonEu: squad.filter((p) => p.nonEu).length,
    nonEuLimit: NON_EU,
    academy: squad.filter((p) => p.academy === clubId).length,
    expiring: squad.filter((p) => !p.loan && p.contractUntil <= state.season + 1).sort((a, b) => b.overall - a.overall),
    topWages: [...squad].sort((a, b) => b.wage - a.wage).slice(0, 5),
    wageMedian: wages[Math.floor(wages.length / 2)] ?? 0,
    unavailable: squad.filter((p) => !isAvailable(p, state.date)),
    tired: squad.filter((p) => isAvailable(p, state.date) && p.fitness < 80).sort((a, b) => a.fitness - b.fitness),
    inForm: squad.filter((p) => p.recent.length >= 3 && avgForm(p) >= 7.2).sort((a, b) => avgForm(b) - avgForm(a)).slice(0, 4),
    outOfForm: squad.filter((p) => p.recent.length >= 3 && avgForm(p) < 6.2).sort((a, b) => avgForm(a) - avgForm(b)).slice(0, 4),
  };
}

// ---------- Akce majitele ----------

/** Lze teď kapitána změnit bez ceny? (letní příprava, nebo kapitán v klubu už není) */
export function captainChangeFree(state: GameState): boolean {
  const md = state.date.slice(5);
  const chosen = state.chemistry?.captainId;
  const stillHere = !!chosen && state.players[chosen]?.clubId === state.owner.clubId;
  return (md >= '06-21' && md <= '07-31') || !stillHere;
}

export function setCaptain(prev: GameState, playerId: string): ActionResult {
  const p = prev.players[playerId];
  if (!p || p.clubId !== prev.owner.clubId) return { state: prev, ok: false, message: 'Hráč není v kádru.' };
  if (prev.owner.ousted) return { state: prev, ok: false, message: 'Klub teď řídí představenstvo.' };
  const former = currentCaptain(prev);
  if (former?.id === playerId) return { state: prev, ok: false, message: 'Hráč už kapitánem je.' };
  const free = captainChangeFree(prev);
  const state = structuredClone(prev);
  const chem = chemistryState(state);
  chem.captainId = playerId;
  chem.leaders = (chem.leaders ?? []).filter((id) => id !== playerId);
  chem.decidedSeason = state.season;
  const np = state.players[playerId];
  if (!free && former) {
    const fp = state.players[former.id];
    if (fp) fp.morale = clamp(fp.morale - 8, 0, 100);
    chem.changedAt = state.date;
    addNews(state, { kind: 'info', title: 'Změna kapitána uprostřed sezóny', text: `Kapitánskou pásku přebírá ${np.firstName} ${np.lastName}. Hráč, který o pásku přišel, je zklamaný (morálka −8) a kabina si na novou hierarchii chvíli zvyká.` });
    return { state, ok: true, message: `Kapitánem je ${np.firstName} ${np.lastName}. Změna uprostřed sezóny stojí chemii a morálku bývalého kapitána.` };
  }
  np.morale = clamp(np.morale + 3, 0, 100);
  return { state, ok: true, message: `Kapitánem je ${np.firstName} ${np.lastName}.` };
}

export function setLeaders(prev: GameState, ids: string[]): ActionResult {
  const cap = currentCaptain(prev)?.id;
  const list = [...new Set(ids)].filter((id) => prev.players[id]?.clubId === prev.owner.clubId && id !== cap);
  if (list.length > 3) return { state: prev, ok: false, message: 'Lídři kabiny mohou být nejvýš tři.' };
  const state = structuredClone(prev);
  chemistryState(state).leaders = list;
  return { state, ok: true, message: list.length ? `Lídři kabiny: ${list.map((id) => state.players[id].lastName).join(', ')}.` : 'Lídry kabiny vybírá trenér.' };
}

/** Vrátí kapitána a lídry na návrh trenéra. */
export function resetLeadership(prev: GameState): ActionResult {
  const state = structuredClone(prev);
  const chem = chemistryState(state);
  const pick = coachLeadershipPick(state);
  if (pick.captainId && pick.captainId !== currentCaptain(prev)?.id && !captainChangeFree(prev)) {
    const r = setCaptain(prev, pick.captainId);
    if (!r.ok) return r;
    chemistryState(r.state).leaders = undefined;
    return { state: r.state, ok: true, message: `Platí návrh trenéra. ${r.message}` };
  }
  chem.captainId = undefined;
  chem.leaders = undefined;
  return { state, ok: true, message: 'Kapitána a lídry kabiny vybírá trenér.' };
}

// ---------- Rozhodnutí na začátku sezóny (situace) ----------

type CreateEvent = (state: GameState, rng: import('./rng').Rng, template: string, expires?: string) => void;

function candidateText(state: GameState, p: Player): string {
  const own = state.owner.clubId;
  const joined = joinedClub(p, own);
  const tenure = p.academy === own ? 'odchovanec klubu' : joined ? `v klubu od ${joined.split('-').reverse().join('. ')}` : 'v klubu od začátku hry';
  return `${p.firstName} ${p.lastName} (${playerAge(p, state.season)} let, hodnocení ${p.overall}, ${tenure})`;
}

export function chemistryTemplates(): Record<string, { weight: () => number; create: (s: GameState) => Omit<GameEvent, 'id' | 'template' | 'date' | 'expires'> | null; resolve: (s: GameState, e: GameEvent, o: string) => string }> {
  return {
    'kapitan-sezona': {
      weight: () => 0,
      create: (s) => {
        const own = s.owner.clubId;
        const squad = squadOf(s, own);
        if (squad.length < 11) return null;
        const pick = coachLeadershipPick(s);
        const coachId = pick.captainId;
        if (!coachId) return null;
        const xi = new Set(bestEleven(squad).map((p) => p.id));
        const prevCap = s.chemistry?.captainId && s.players[s.chemistry.captainId]?.clubId === own ? s.chemistry.captainId : undefined;
        const experienced = coreOf(squad, 16)
          .filter((p) => p.id !== coachId)
          .sort((a, b) => playerAge(b, s.season) + tenureDays(s, b, own) / 365 - (playerAge(a, s.season) + tenureDays(s, a, own) / 365) || a.id.localeCompare(b.id))[0];
        const academy = coreOf(squad, 16).filter((p) => p.academy === own && p.id !== coachId && xi.has(p.id))[0];
        const alt = prevCap && prevCap !== coachId ? s.players[prevCap] : experienced;
        const third = academy && academy.id !== alt?.id ? academy : undefined;
        const options = [{ id: 'trener', label: `Návrh trenéra: ${s.players[coachId].lastName}`, hint: `${candidateText(s, s.players[coachId])}. Trenér je spokojený, lídry vybere sám.` }];
        if (alt) options.push({ id: 'alt', label: prevCap === alt.id ? `Ponechat kapitána: ${alt.lastName}` : `Nejzkušenější: ${alt.lastName}`, hint: `${candidateText(s, alt)}. Důvěra trenéra −2.` });
        if (third) options.push({ id: 'odchovanec', label: `Odchovanec: ${third.lastName}`, hint: `${candidateText(s, third)}. Fanoušci +2, důvěra trenéra −2.` });
        return {
          title: 'Kapitán na novou sezónu',
          text: `Trenér navrhuje, kdo ponese kapitánskou pásku. Kapitán a lídři kabiny ovlivňují týmovou chemii (Tým › Složení), a tím morálku i výkon. Změna během sezóny už něco stojí.`,
          defaultOption: 'trener',
          options,
          data: { trener: coachId, ...(alt ? { alt: alt.id } : {}), ...(third ? { odchovanec: third.id } : {}) },
        };
      },
      resolve: (s, e, o) => {
        const chem = chemistryState(s);
        const id = String(e.data?.[o] ?? e.data?.trener ?? '');
        const p = s.players[id];
        chem.decidedSeason = s.season;
        chem.leaders = undefined;
        if (!p || p.clubId !== s.owner.clubId) {
          chem.captainId = undefined;
          return 'Kapitána vybere trenér.';
        }
        chem.captainId = id;
        p.morale = clamp(p.morale + 3, 0, 100);
        if (o !== 'trener') s.owner.trust.trener = clamp(s.owner.trust.trener - 2, 0, 100);
        if (o === 'odchovanec') s.clubs[s.owner.clubId].fanMood = clamp(s.clubs[s.owner.clubId].fanMood + 2, 0, 100);
        return `Kapitánem pro sezónu je ${p.firstName} ${p.lastName}.`;
      },
    },
  };
}

// ---------- Denní háček ----------

function recordMatches(state: GameState): { lost: boolean; ids: string[] } | undefined {
  const own = state.owner.clubId;
  const chem = chemistryState(state);
  chem.done ??= [];
  let out: { lost: boolean; ids: string[] } | undefined;
  for (const { fixture: f } of allFixtures(state)) {
    if (f.date !== state.date || !f.result || (f.homeId !== own && f.awayId !== own) || chem.done.includes(f.id)) continue;
    chem.done = [...chem.done, f.id].slice(-12);
    const home = f.homeId === own;
    const side = f.result.detail ? (home ? f.result.detail.home : f.result.detail.away) : undefined;
    const gf = home ? f.result.homeGoals : f.result.awayGoals;
    const ga = home ? f.result.awayGoals : f.result.homeGoals;
    const lost = gf < ga && !f.result.penalties;
    const played = side ? [...side.lineup, ...side.bench].filter((l) => l.minutes > 0) : [];
    if (side) {
      chem.pairs ??= {};
      for (let i = 0; i < played.length; i++) {
        for (let j = i + 1; j < played.length; j++) {
          const k = pairKey(played[i].id, played[j].id);
          chem.pairs[k] = (chem.pairs[k] ?? 0) + Math.min(played[i].minutes, played[j].minutes);
        }
      }
      chem.lineups = [...(chem.lineups ?? []), { date: f.date, ids: side.lineup.filter((l) => l.started).map((l) => l.id) }].slice(-6);
    }
    out = { lost: (out?.lost ?? false) || lost, ids: played.map((l) => l.id) };
  }
  return out;
}

function prunePairs(state: GameState): void {
  const chem = state.chemistry;
  if (!chem?.pairs) return;
  const own = state.owner.clubId;
  for (const k of Object.keys(chem.pairs)) {
    const [a, b] = k.split('|');
    if (state.players[a]?.clubId !== own || state.players[b]?.clubId !== own) delete chem.pairs[k];
  }
}

/**
 * Denně (game.ts processDay): zapíše společné minuty po vlastním zápase, tlumí nebo zesiluje pokles
 * morálky po porážce, jednou týdně zapíše hodnotu chemie, měsíčně posune morálku, na začátku sezóny
 * nabídne volbu kapitána (v rámci týdenního limitu rozhodnutí).
 */
export function dailyChemistry(state: GameState, rng: import('./rng').Rng, createEvent: CreateEvent, budgetLeft: (s: GameState) => number): void {
  if (state.gameOver) return;
  const own = state.owner.clubId;
  const played = recordMatches(state);
  if (played?.lost && played.ids.length) {
    // Po prohře match.ts ubral hráčům 2 body morálky; dobrá parta ztrátu tlumí, rozpadlá kabina ji zesílí.
    const { lossFactor } = chemistryEffect(state, own);
    const adj = 2 * (1 - lossFactor);
    for (const id of played.ids) {
      const p = state.players[id];
      if (p && p.clubId === own) p.morale = clamp(p.morale + adj, 0, 100);
    }
  }
  const md = state.date.slice(5);
  const chem = chemistryState(state);
  if (parseDate(state.date).getUTCDay() === 1) {
    prunePairs(state);
    const c = teamChemistry(state, own);
    chem.history = [...(chem.history ?? []), { date: state.date, value: c.value }].slice(-26);
    const ref = chem.history.find((h) => days(h.date, state.date) >= 28 && days(h.date, state.date) <= 42);
    if (ref && c.value <= ref.value - 8 && (!chem.warnedAt || days(chem.warnedAt, state.date) > 45)) {
      chem.warnedAt = state.date;
      const worst = [...c.parts].sort((a, b) => a.value - b.value)[0];
      addNews(state, { kind: 'varovani', title: `Týmová chemie klesá (${ref.value} → ${c.value})`, text: `Nejslabší místo: ${worst.label.toLowerCase()}. ${worst.why} Podrobnosti v Tým › Složení.` });
    }
  }
  if (state.date.endsWith('-01')) {
    const { moraleDrift } = chemistryEffect(state, own);
    if (moraleDrift) for (const p of squadOf(state, own)) p.morale = clamp(p.morale + moraleDrift, 0, 100);
  }
  // Kapitán na novou sezónu: rozhodnutí jen v rámci týdenního limitu, jinak platí návrh trenéra.
  if (chem.decidedSeason !== state.season && md >= '07-02' && md <= '07-24' && !state.owner.ousted) {
    if (budgetLeft(state) > 0 && state.events.length < 4 && !state.events.some((e) => e.template === 'kapitan-sezona')) createEvent(state, rng, 'kapitan-sezona', addDays(state.date, 10));
  }
  if (chem.decidedSeason !== state.season && md === '07-25' && !state.events.some((e) => e.template === 'kapitan-sezona')) {
    chem.decidedSeason = state.season;
    const prevChosen = chem.captainId && state.players[chem.captainId]?.clubId === own ? chem.captainId : undefined;
    if (!prevChosen) {
      const cap = currentCaptain(state);
      if (cap) addNews(state, { kind: 'info', title: `Kapitánem pro sezónu je ${cap.firstName} ${cap.lastName}`, text: 'Platí návrh trenéra. Kapitána a lídry kabiny můžete změnit v Tým › Složení.' });
    }
  }
}
