import { book } from './finance';
import { FIRST_NAMES, LAST_NAMES } from './names';
import { newId, playersByClub, squadQualityForReputation, teamStrength } from './players';
import { createRng, type Rng } from './rng';
import { computeTable } from './standings';
import type { Club, CoachStyle, Competition, GameState, SeasonGoal, Staff, StaffRole } from './types';
import { addNews, clamp, competitionOf, FREE } from './world';

export const ROLE_LABEL: Record<StaffRole, string> = { trener: 'Hlavní trenér', reditel: 'Sportovní ředitel' };

export const STYLE_LABEL: Record<CoachStyle, string> = {
  utocny: 'útočný',
  vyvazeny: 'vyvážený',
  defenzivni: 'defenzivní',
};

export interface ActionResult {
  state: GameState;
  ok: boolean;
  message: string;
}

export function staffAge(s: Staff, season: number): number {
  return season - s.birthYear;
}

export function staffWage(ability: number, role: StaffRole): number {
  const base = 25_000 * Math.pow(1.065, ability - 30);
  return Math.round((role === 'trener' ? base : base * 0.8) / 1000) * 1000;
}

/** Úroveň trenéra, jakou si klub s danou pověstí obvykle najímá. */
export function staffLevelForReputation(reputation: number): number {
  return 20 + reputation * 0.6;
}

export function generateStaff(
  rng: Rng,
  state: Pick<GameState, 'nextId' | 'season'>,
  role: StaffRole,
  ability: number,
  clubId: string,
): Staff {
  const a = Math.round(clamp(ability, 20, 95));
  return {
    id: newId(state, 's'),
    firstName: rng.pick(FIRST_NAMES),
    lastName: rng.pick(LAST_NAMES),
    role,
    birthYear: state.season - rng.int(34, 64),
    ability: a,
    ambition: rng.int(1, 20),
    ego: rng.int(1, 20),
    loyalty: rng.int(1, 20),
    style: rng.pick(['utocny', 'vyvazeny', 'vyvazeny', 'defenzivni'] as CoachStyle[]),
    youthFocus: rng.chance(0.25),
    clubId,
    wage: staffWage(a, role),
    contractUntil: state.season + rng.int(1, 3),
  };
}

export function coachOf(state: GameState, clubId: string): Staff | undefined {
  const id = state.clubs[clubId]?.staff.coachId;
  return id ? state.staff[id] : undefined;
}

export function directorOf(state: GameState, clubId: string): Staff | undefined {
  const id = state.clubs[clubId]?.staff.directorId;
  return id ? state.staff[id] : undefined;
}

/** Schopnost, se kterou klub majitele skautuje a vyjednává. Bez ředitele to dělá majitel sám. */
export function directorAbility(state: GameState): number {
  return directorOf(state, state.owner.clubId)?.ability ?? 35;
}

/** O kolik trenér zlepší (nebo zhorší) sílu týmu. Bez trenéra vede tým asistent. */
export function coachBonus(coach: Staff | undefined): number {
  if (!coach) return -3;
  return (coach.ability - 50) / 8 - (coach.youthFocus ? 0.5 : 0);
}

export function clubStrength(state: GameState, clubId: string, squads = playersByClub(state)): number {
  return teamStrength(squads.get(clubId) ?? []) + coachBonus(coachOf(state, clubId));
}

// ---------- Cíle sezóny ----------

export function goalTarget(goal: SeasonGoal, comp: Competition): number {
  const n = comp.clubIds.length;
  switch (goal) {
    case 'titul':
      return 1;
    case 'postup':
      return comp.promote > 0 ? comp.promote : 3;
    case 'horni':
      return Math.ceil(n / 2);
    case 'stred':
      return n - 4;
    case 'zachrana':
      return n - Math.max(comp.relegate, 2);
  }
}

export function goalLabel(goal: SeasonGoal, comp?: Competition): string {
  const n = comp?.clubIds.length ?? 16;
  switch (goal) {
    case 'titul':
      return 'Vyhrát soutěž';
    case 'postup':
      return comp && comp.promote === 0 ? 'Evropské poháry (do 3. místa)' : 'Postup';
    case 'horni':
      return `Horní polovina (do ${Math.ceil(n / 2)}. místa)`;
    case 'stred':
      return `Klidný střed (do ${n - 4}. místa)`;
    case 'zachrana':
      return 'Záchrana';
  }
}

export const GOALS: SeasonGoal[] = ['titul', 'postup', 'horni', 'stred', 'zachrana'];

/** Pořadí, které by podle síly kádru a trenéra odpovídalo klubu. */
export function expectedPosition(state: GameState, clubId: string): number {
  const comp = competitionOf(state, clubId);
  if (!comp) return 1;
  const squads = playersByClub(state);
  const ranked = [...comp.clubIds].sort((a, b) => clubStrength(state, b, squads) - clubStrength(state, a, squads));
  return ranked.indexOf(clubId) + 1;
}

/** Nejbližší cíl, který odpovídá síle kádru. */
export function realisticGoal(state: GameState, clubId: string): SeasonGoal {
  const comp = competitionOf(state, clubId);
  if (!comp) return 'stred';
  const expected = expectedPosition(state, clubId);
  return [...GOALS].reverse().find((g) => goalTarget(g, comp) <= expected + 1) ?? 'titul';
}

export function setSeasonGoal(prev: GameState, goal: SeasonGoal): ActionResult {
  const state = structuredClone(prev);
  const comp = competitionOf(state, state.owner.clubId);
  if (!comp) return { state: prev, ok: false, message: 'Klub nehraje žádnou soutěž.' };
  state.owner.seasonGoal = goal;
  const gap = expectedPosition(state, state.owner.clubId) - goalTarget(goal, comp);
  let message = `Cíl sezóny: ${goalLabel(goal, comp)}.`;
  if (gap > comp.clubIds.length / 4) {
    state.owner.trust.trener = clamp(state.owner.trust.trener - 5, 0, 100);
    message += ' Trenér cíl považuje za nereálný s tímhle kádrem.';
  } else if (gap < -3) {
    message += ' Trenér cíl přijal s úlevou, čekal vyšší nároky.';
  } else {
    message += ' Trenér cíl přijal.';
  }
  addNews(state, { kind: 'info', title: message });
  return { state, ok: true, message };
}

// ---------- Rady trenérovi ----------

export type Advice = 'mladi' | 'zkuseni' | 'utok' | 'obrana' | 'vyvazene';

export const ADVICE_LABEL: Record<Advice, string> = {
  mladi: 'Dávej víc šancí mladým',
  zkuseni: 'Spoléhej na zkušené',
  utok: 'Hrajte útočněji',
  obrana: 'Hrajte bezpečněji vzadu',
  vyvazene: 'Hrajte vyváženě',
};

const ADVICE_COOLDOWN_DAYS = 28;

export function adviceAvailableFrom(state: GameState): string | null {
  if (!state.owner.lastAdvice) return null;
  const d = new Date(`${state.owner.lastAdvice}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ADVICE_COOLDOWN_DAYS);
  const from = d.toISOString().slice(0, 10);
  return from > state.date ? from : null;
}

export function giveAdvice(prev: GameState, advice: Advice): ActionResult {
  const coach = coachOf(prev, prev.owner.clubId);
  if (!coach) return { state: prev, ok: false, message: 'Klub nemá hlavního trenéra.' };
  if (adviceAvailableFrom(prev)) return { state: prev, ok: false, message: 'Trenér potřebuje čas, než mu znovu budete radit.' };

  const state = structuredClone(prev);
  const rng = createRng(state.rngState);
  const c = state.staff[coach.id];
  const accept = rng.chance(clamp(0.95 - (c.ego - 8) * 0.06, 0.15, 0.95));
  state.rngState = rng.state();
  state.owner.lastAdvice = state.date;

  if (!accept) {
    state.owner.trust.trener = clamp(state.owner.trust.trener - 6, 0, 100);
    const message = `${c.firstName} ${c.lastName} si do vedení týmu mluvit nenechá. Vztah s trenérem se zhoršil.`;
    addNews(state, { kind: 'varovani', title: 'Trenér odmítl radu', text: message });
    return { state, ok: false, message };
  }
  if (advice === 'mladi') c.youthFocus = true;
  if (advice === 'zkuseni') c.youthFocus = false;
  if (advice === 'utok') c.style = 'utocny';
  if (advice === 'obrana') c.style = 'defenzivni';
  if (advice === 'vyvazene') c.style = 'vyvazeny';
  if (c.loyalty < 12) state.owner.trust.trener = clamp(state.owner.trust.trener - 2, 0, 100);
  const message = `Trenér radu přijal: ${ADVICE_LABEL[advice].toLowerCase()}.`;
  addNews(state, { kind: 'info', title: message });
  return { state, ok: true, message };
}

// ---------- Nábor a odvolání ----------

/** Odstupné: plat do konce smlouvy, nejvýš za 12 měsíců. */
export function severance(state: GameState, s: { wage: number; contractUntil: number }): number {
  const [y, m] = state.date.split('-').map(Number);
  const months = (s.contractUntil - y) * 12 + (6 - m);
  return Math.max(0, Math.min(12, months)) * s.wage;
}

export function isInterested(s: Staff, club: Club): boolean {
  return s.ability - staffLevelForReputation(club.reputation) <= 15;
}

export function candidates(state: GameState, role: StaffRole): Staff[] {
  return Object.values(state.staff)
    .filter((s) => s.role === role && s.clubId === FREE)
    .sort((a, b) => b.ability - a.ability);
}

function releaseCurrent(state: GameState, role: StaffRole, payout: boolean): Staff | undefined {
  const club = state.clubs[state.owner.clubId];
  const key = role === 'trener' ? 'coachId' : 'directorId';
  const current = club.staff[key] ? state.staff[club.staff[key]] : undefined;
  if (!current) return undefined;
  if (payout) {
    const cost = severance(state, current);
    if (cost > 0) book(state, club.id, 'vedeni', -cost, `Odstupné: ${current.firstName} ${current.lastName}`);
  }
  current.clubId = FREE;
  club.staff[key] = '';
  return current;
}

export function fireStaff(prev: GameState, role: StaffRole): ActionResult {
  const club = prev.clubs[prev.owner.clubId];
  const id = role === 'trener' ? club.staff.coachId : club.staff.directorId;
  if (!id) return { state: prev, ok: false, message: 'Tuto pozici nikdo nezastává.' };
  const state = structuredClone(prev);
  const cost = severance(state, state.staff[id]);
  const gone = releaseCurrent(state, role, true)!;
  const message = `${ROLE_LABEL[role]} ${gone.firstName} ${gone.lastName} byl odvolán. Odstupné ${Math.round(cost).toLocaleString('cs-CZ')} Kč.`;
  addNews(state, { kind: 'info', title: message });
  return { state, ok: true, message };
}

export function hireStaff(prev: GameState, staffId: string, years: number): ActionResult {
  const candidate = prev.staff[staffId];
  const club = prev.clubs[prev.owner.clubId];
  if (!candidate || candidate.clubId !== FREE) return { state: prev, ok: false, message: 'Kandidát už není k dispozici.' };
  if (!isInterested(candidate, club)) {
    return { state: prev, ok: false, message: `${candidate.firstName} ${candidate.lastName} nemá o práci v klubu této úrovně zájem.` };
  }
  const state = structuredClone(prev);
  const role = candidate.role;
  const previous = releaseCurrent(state, role, true);
  const s = state.staff[staffId];
  s.clubId = club.id;
  s.contractUntil = state.season + Math.max(1, Math.min(4, years));
  if (role === 'trener') state.clubs[club.id].staff.coachId = s.id;
  else state.clubs[club.id].staff.directorId = s.id;
  book(state, club.id, 'vedeni', -s.wage, `Podpisový bonus: ${s.firstName} ${s.lastName}`);
  state.owner.trust[role] = 60;
  const message = `Novým ${role === 'trener' ? 'hlavním trenérem' : 'sportovním ředitelem'} je ${s.firstName} ${s.lastName}${previous ? `, nahradil ${previous.firstName} ${previous.lastName}` : ''}.`;
  addNews(state, { kind: 'info', title: message });
  return { state, ok: true, message };
}

// ---------- Průběžné vyhodnocení ----------

function ownPosition(state: GameState): { comp: Competition; position: number; played: number } | undefined {
  const comp = competitionOf(state, state.owner.clubId);
  if (!comp) return undefined;
  const table = computeTable(comp, state);
  const i = table.findIndex((r) => r.clubId === state.owner.clubId);
  return { comp, position: i + 1, played: table[i].played };
}

/** Měsíčně: platy vedení, důvěra podle průběžného plnění cíle, výměny trenérů v ostatních klubech. */
export function monthlyStaff(state: GameState, rng: Rng): void {
  for (const comp of Object.values(state.competitions)) {
    for (const clubId of comp.clubIds) {
      const coach = coachOf(state, clubId);
      const director = directorOf(state, clubId);
      const wages = (coach?.wage ?? 0) + (director?.wage ?? 0);
      if (wages > 0) book(state, clubId, 'vedeni', -wages, 'Platy trenéra a vedení');
    }
  }

  const own = ownPosition(state);
  if (own && own.played >= 4) {
    const diff = goalTarget(state.owner.seasonGoal, own.comp) - own.position;
    const delta = clamp(diff * 0.5, -3, 2);
    state.owner.trust.trener = clamp(state.owner.trust.trener + delta, 0, 100);
    state.owner.trust.reditel = clamp(state.owner.trust.reditel + delta / 2, 0, 100);
  }

  // Ostatní kluby občas vymění trenéra, když se jim nedaří.
  for (const comp of Object.values(state.competitions)) {
    const table = computeTable(comp, state);
    if (!table.length || table[0].played < 8) continue;
    for (const row of table.slice(-2)) {
      if (row.clubId === state.owner.clubId || !rng.chance(0.25)) continue;
      replaceAiCoach(state, rng, row.clubId, comp);
    }
  }
}

function replaceAiCoach(state: GameState, rng: Rng, clubId: string, comp: Competition): void {
  const club = state.clubs[clubId];
  const old = coachOf(state, clubId);
  if (old) old.clubId = FREE;
  const pick = candidates(state, 'trener').find((s) => isInterested(s, club) && rng.chance(0.5));
  const coach = pick ?? generateStaff(rng, state, 'trener', staffLevelForReputation(club.reputation) + rng.normal(0, 6), clubId);
  coach.clubId = clubId;
  coach.contractUntil = state.season + 2;
  state.staff[coach.id] = coach;
  club.staff.coachId = coach.id;
  if (comp.id === competitionOf(state, state.owner.clubId)?.id) {
    addNews(state, { kind: 'info', title: `${club.shortName} mění trenéra: ${coach.firstName} ${coach.lastName} nahrazuje ${old ? `${old.firstName} ${old.lastName}` : 'asistenta'}` });
  }
}

/** Konec sezóny: hodnocení cíle, rezignace, konce smluv vedení. */
export function seasonEndStaff(state: GameState, rng: Rng, position: number, comp: Competition | undefined): void {
  if (comp) {
    const target = goalTarget(state.owner.seasonGoal, comp);
    const met = position <= target;
    const delta = met ? 12 : -Math.min(25, (position - target) * 2);
    state.owner.trust.trener = clamp(state.owner.trust.trener + delta, 0, 100);
    state.owner.trust.reditel = clamp(state.owner.trust.reditel + delta / 2, 0, 100);
    addNews(state, {
      kind: met ? 'sezona' : 'varovani',
      title: met ? `Cíl sezóny splněn (${position}. místo)` : `Cíl sezóny nesplněn (${position}. místo, cíl do ${target}. místa)`,
    });
  }

  const club = state.clubs[state.owner.clubId];
  for (const role of ['trener', 'reditel'] as StaffRole[]) {
    const key = role === 'trener' ? 'coachId' : 'directorId';
    const s = club.staff[key] ? state.staff[club.staff[key]] : undefined;
    if (!s) continue;
    const trust = state.owner.trust[role];
    const resigns = trust < 15 && rng.chance(0.5 + s.ambition / 40);
    const expires = s.contractUntil <= state.season + 1;
    if (resigns || (expires && trust < 40)) {
      s.clubId = FREE;
      club.staff[key] = '';
      addNews(state, {
        kind: 'varovani',
        title: `${ROLE_LABEL[role]} ${s.firstName} ${s.lastName} odchází`,
        text: resigns ? 'Ztratil důvěru ve vedení klubu a rezignoval.' : 'Smlouvu kvůli špatným vztahům neprodloužil.',
      });
    } else if (expires) {
      s.contractUntil = state.season + 1 + rng.int(1, 2);
      s.wage = Math.round((s.wage * 1.1) / 1000) * 1000;
      addNews(state, { kind: 'info', title: `${ROLE_LABEL[role]} ${s.firstName} ${s.lastName} prodloužil smlouvu do roku ${s.contractUntil}` });
    }
  }

  // Ostatním klubům smlouvy trenérů automaticky prodlužujeme.
  for (const s of Object.values(state.staff)) {
    if (s.clubId !== FREE && s.clubId !== club.id && s.contractUntil <= state.season + 1) {
      s.contractUntil = state.season + 1 + rng.int(1, 2);
    }
  }
}

/** Začátek sezóny: doplnit nabídku volných trenérů a ředitelů. */
export function refreshStaffPool(state: GameState, rng: Rng): void {
  for (const s of Object.values(state.staff)) {
    if (s.clubId === FREE && staffAge(s, state.season) > 68) delete state.staff[s.id];
  }
  const want: Record<StaffRole, number> = { trener: 14, reditel: 10 };
  for (const role of ['trener', 'reditel'] as StaffRole[]) {
    let free = candidates(state, role).length;
    while (free < want[role]) {
      const s = generateStaff(rng, state, role, rng.int(30, 85), FREE);
      state.staff[s.id] = s;
      free++;
    }
  }
}

/** Úroveň skautingu vlastního klubu: přibližná hodnocení cizích hráčů. */
export function scoutingError(state: GameState): number {
  return (100 - directorAbility(state)) / 12;
}

export function squadLevel(state: GameState, clubId: string): number {
  return squadQualityForReputation(state.clubs[clubId].reputation);
}
