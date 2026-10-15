import { addDays } from './calendar';
import { book, ownerAccounting } from './finance';
import type { ActionResult } from './staff';
import { CATERING_SPEND, vipRate } from './stadium';
import type { Club, GameState, ProjectKind } from './types';
import { addNews, tierOf } from './world';

/** Kapacita, která je k dispozici (při přestavbě je část tribun uzavřená). */
export function effectiveCapacity(state: GameState, club: Club): number {
  const building = club.id === state.owner.clubId && state.projects.some((p) => p.kind === 'kapacita');
  return Math.round(club.stadium.capacity * (building ? 0.85 : 1));
}

// ---------- Stavby ----------

export interface ProjectOption {
  kind: ProjectKind;
  label: string;
  description: string;
  cost: number;
  weeks: number;
  value: number;
  /** Doba odepisování v letech. */
  years: number;
  blocked?: string;
}

const TRAINING_COST = [0, 0, 10_000_000, 25_000_000, 50_000_000, 90_000_000];
const ACADEMY_COST = [0, 0, 6_000_000, 15_000_000, 30_000_000, 55_000_000];
const MEDICAL_COST = [0, 0, 3_000_000, 8_000_000, 15_000_000, 25_000_000];

export function projectOptions(state: GameState): ProjectOption[] {
  const club = state.clubs[state.owner.clubId];
  const f = club.facilities;
  const running = (kind: ProjectKind) => state.projects.some((p) => p.kind === kind);
  const options: ProjectOption[] = [
    { kind: 'kapacita', label: 'Nová tribuna (+1 000 míst)', description: 'Víc diváků a vyšší příjmy ze vstupného. Během stavby je 15 % kapacity uzavřeno.', cost: 40_000_000, weeks: 30, value: 1000, years: 30 },
    { kind: 'kapacita', label: 'Velká přestavba (+3 000 míst)', description: 'Výrazně větší stadion pro klub, který na něj má fanoušky.', cost: 110_000_000, weeks: 48, value: 3000, years: 30 },
    { kind: 'vip', label: 'VIP skyboxy (+4)', description: `Každý skybox přinese za domácí zápas ${vipRate(tierOf(state, club.id)).toLocaleString('cs-CZ')} Kč.`, cost: 12_000_000, weeks: 20, value: 4, years: 25 },
    { kind: 'catering', label: `Catering a fanshop (úroveň ${f.catering + 1})`, description: `Útrata diváka vzroste z ${CATERING_SPEND[f.catering]} na ${CATERING_SPEND[Math.min(3, f.catering + 1)]} Kč.`, cost: 3_000_000 * (f.catering + 1), weeks: 8, value: f.catering + 1, years: 10 },
    { kind: 'vyhrivani', label: 'Vyhřívaný trávník', description: 'Podmínka licence pro 1. ligu. Bez něj platí klub v 1. lize každý měsíc pokutu.', cost: 18_000_000, weeks: 10, value: 1, years: 20 },
    { kind: 'trenink', label: `Tréninkové centrum (úroveň ${f.training + 1})`, description: 'Hráči se rychleji zlepšují, hlavně mladí.', cost: TRAINING_COST[Math.min(5, f.training + 1)], weeks: 40, value: f.training + 1, years: 30 },
    { kind: 'akademie', label: `Akademie (úroveň ${f.academy + 1})`, description: 'Víc a lepších dorostenců každé léto.', cost: ACADEMY_COST[Math.min(5, f.academy + 1)], weeks: 30, value: f.academy + 1, years: 30 },
    { kind: 'medicina', label: `Regenerace a medicína (úroveň ${f.medical + 1})`, description: 'Méně zranění a rychlejší návrat do hry.', cost: MEDICAL_COST[Math.min(5, f.medical + 1)], weeks: 12, value: f.medical + 1, years: 10 },
  ];
  return options.map((o) => {
    let blocked: string | undefined;
    if (running(o.kind)) blocked = 'Stavba už probíhá.';
    else if (o.kind === 'catering' && f.catering >= 3) blocked = 'Nejvyšší úroveň.';
    else if (o.kind === 'vyhrivani' && f.heating) blocked = 'Stadion už vyhřívaný trávník má.';
    else if (o.kind === 'trenink' && f.training >= 5) blocked = 'Nejvyšší úroveň.';
    else if (o.kind === 'akademie' && f.academy >= 5) blocked = 'Nejvyšší úroveň.';
    else if (o.kind === 'medicina' && f.medical >= 5) blocked = 'Nejvyšší úroveň.';
    else if (o.cost > club.finance.balance) blocked = 'Klub na to nemá peníze.';
    return { ...o, blocked };
  });
}

/** Zahájení stavby: celá částka se zaplatí hned a stane se majetkem klubu. */
export function startProject(prev: GameState, label: string): ActionResult {
  const option = projectOptions(prev).find((o) => o.label === label);
  if (!option) return { state: prev, ok: false, message: 'Tuto stavbu teď nelze zahájit.' };
  if (option.blocked) return { state: prev, ok: false, message: option.blocked };
  const state = structuredClone(prev);
  const club = state.clubs[state.owner.clubId];
  book(state, club.id, 'investice', -option.cost, `Investice: ${option.label}`);
  state.projects.push({
    id: `st${++state.nextId}`,
    kind: option.kind,
    label: option.label,
    cost: option.cost,
    start: state.date,
    end: addDays(state.date, option.weeks * 7),
    value: option.value,
  });
  club.finance.assets = [...(club.finance.assets ?? []), { label: option.label, value: option.cost, monthly: option.cost / (option.years * 12) }];
  const message = `Stavba zahájena: ${option.label}. Hotovo ${addDays(state.date, option.weeks * 7).split('-').reverse().join('. ')}.`;
  addNews(state, { kind: 'info', title: message });
  return { state, ok: true, message };
}

/** Dokončení staveb. */
export function completeProjects(state: GameState): void {
  const club = state.clubs[state.owner.clubId];
  const done = state.projects.filter((p) => p.end <= state.date);
  for (const p of done) {
    const f = club.facilities;
    if (p.kind === 'kapacita') club.stadium.capacity += p.value;
    if (p.kind === 'vip') f.vip += p.value;
    if (p.kind === 'catering') f.catering = Math.min(3, p.value);
    if (p.kind === 'vyhrivani') f.heating = true;
    if (p.kind === 'trenink') f.training = Math.min(5, p.value);
    if (p.kind === 'akademie') f.academy = Math.min(5, p.value);
    if (p.kind === 'medicina') f.medical = Math.min(5, p.value);
    addNews(state, { kind: 'sezona', title: `Dokončeno: ${p.label}` });
  }
  state.projects = state.projects.filter((p) => p.end > state.date);
}

/** Měsíční odpisy staveb a vybavení klubu majitele. */
export function monthlyBuildingDepreciation(state: GameState): void {
  const club = state.clubs[state.owner.clubId];
  const acc = ownerAccounting(state);
  for (const a of club.finance.assets ?? []) {
    const dep = Math.min(a.value, a.monthly);
    a.value -= dep;
    acc.buildingDepreciation += dep;
  }
  club.finance.assets = (club.finance.assets ?? []).filter((a) => a.value > 1);
}

/** Licence 1. ligy: bez vyhřívaného trávníku platí klub měsíčně pokutu. */
export function licenseCheck(state: GameState): void {
  const club = state.clubs[state.owner.clubId];
  if (tierOf(state, club.id) !== 1 || club.facilities.heating) return;
  const building = state.projects.some((p) => p.kind === 'vyhrivani');
  const fine = building ? 100_000 : 300_000;
  book(state, club.id, 'ostatni', -fine, 'Licenční pokuta: chybí vyhřívaný trávník');
  addNews(state, {
    kind: 'varovani',
    title: `Licenční pokuta ${fine.toLocaleString('cs-CZ')} Kč`,
    text: building ? 'Vyhřívaný trávník se staví, pokuta je snížená.' : 'Stadion nesplňuje licenci 1. ligy. Postavte vyhřívaný trávník (Stadion a zázemí).',
  });
}
