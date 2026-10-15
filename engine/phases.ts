import { addDays } from './calendar';
import type { GameState } from './types';
import { competitionOf, transferWindow } from './world';

export type PhaseKind = 'okno' | 'podzim' | 'pauza' | 'jaro' | 'nadstavba' | 'baraz' | 'priprava';

export interface Phase {
  kind: PhaseKind;
  label: string;
  start: string;
  end: string;
}

export interface CalendarMarker {
  date: string;
  label: string;
  kind: 'pohar' | 'zapas';
}

/** Fáze aktuální sezóny klubu majitele (1. 7. – 30. 6.) pro kalendář. */
export function seasonPhases(state: GameState): { start: string; end: string; phases: Phase[]; markers: CalendarMarker[] } {
  const y = state.season;
  const start = `${y}-07-01`;
  const end = `${y + 1}-06-30`;
  const phases: Phase[] = [
    { kind: 'okno', label: 'Letní přestupní okno', start: `${y}-07-01`, end: `${y}-08-31` },
    { kind: 'okno', label: 'Zimní přestupní okno', start: `${y + 1}-01-08`, end: `${y + 1}-02-14` },
  ];
  const comp = competitionOf(state, state.owner.clubId);
  if (comp?.fixtures.length) {
    const groupStart = comp.groups ? Math.min(...comp.fixtures.filter((f) => f.id.includes('-n')).map((f) => f.round)) : Infinity;
    const base = comp.fixtures.filter((f) => f.round < groupStart);
    const dates = [...new Set(base.map((f) => f.date))].sort();
    const autumn = dates.filter((d) => d < `${y + 1}-01-01`);
    const spring = dates.filter((d) => d >= `${y + 1}-01-01`);
    if (autumn.length) phases.push({ kind: 'podzim', label: 'Liga: podzim', start: autumn[0], end: autumn[autumn.length - 1] });
    if (autumn.length && spring.length) phases.push({ kind: 'pauza', label: 'Zimní pauza', start: addDays(autumn[autumn.length - 1], 1), end: addDays(spring[0], -1) });
    if (spring.length) phases.push({ kind: 'jaro', label: 'Liga: jaro', start: spring[0], end: spring[spring.length - 1] });
    const reserved = comp.reservedDates;
    if (reserved?.length) {
      const nStart = comp.groups ? [...comp.fixtures.filter((f) => f.round >= groupStart).map((f) => f.date)].sort()[0] : reserved[0];
      const nEnd = comp.groups ? [...comp.fixtures.filter((f) => f.round >= groupStart).map((f) => f.date)].sort().pop()! : reserved[reserved.length - 1];
      phases.push({ kind: 'nadstavba', label: 'Nadstavba', start: nStart, end: nEnd });
    }
    if (comp.playoff || Object.values(state.competitions).some((c) => c.playoff?.vs === comp.id)) {
      phases.push({ kind: 'baraz', label: 'Baráž', start: `${y + 1}-06-10`, end: `${y + 1}-06-13` });
    }
    if (autumn.length) phases.push({ kind: 'priprava', label: 'Letní příprava', start, end: addDays(autumn[0], -1) });
  }
  const markers: CalendarMarker[] = (state.cups.pohar?.rounds ?? []).map((r) => ({ date: r.date, label: `Pohár: ${r.name}`, kind: 'pohar' as const }));
  return { start, end, phases, markers };
}

/** Co se právě děje (pro lištu nahoře): fáze a kolik dní zbývá. */
export function currentPhase(state: GameState): { label: string; detail: string; tone: 'okno' | 'liga' | 'klid' } {
  const window = transferWindow(state.date);
  const days = (to: string) => Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${state.date}T00:00:00Z`).getTime()) / 86_400_000);
  const fmt = (d: string) => d.split('-').slice(1).reverse().map(Number).join('. ') + '.';
  if (window) {
    const end = window === 'leto' ? `${state.season}-08-31` : `${state.season + 1}-02-14`;
    return { label: window === 'leto' ? 'Letní přestupní okno' : 'Zimní přestupní okno', detail: `do ${fmt(end)} (${days(end)} dní)`, tone: 'okno' };
  }
  const { phases } = seasonPhases(state);
  const now = phases.find((p) => p.kind !== 'okno' && p.start <= state.date && state.date <= p.end);
  if (now) {
    const next = phases.filter((p) => p.start > state.date).sort((a, b) => (a.start < b.start ? -1 : 1))[0];
    const detail = now.kind === 'pauza' || now.kind === 'priprava' ? (next ? `${next.label} od ${fmt(next.start)}` : '') : `do ${fmt(now.end)}`;
    return { label: now.label, detail, tone: now.kind === 'pauza' || now.kind === 'priprava' ? 'klid' : 'liga' };
  }
  return { label: 'Konec sezóny', detail: `nová sezóna od 1. 7.`, tone: 'klid' };
}
