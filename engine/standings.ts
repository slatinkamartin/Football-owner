import type { Competition, GameState } from './types';

export interface TableRow {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  /** Posledních až 5 výsledků, nejnovější poslední: V, R, P. */
  form: ('V' | 'R' | 'P')[];
}

export function computeTable(comp: Competition, state?: GameState): TableRow[] {
  const rows = new Map<string, TableRow>();
  for (const id of comp.clubIds) {
    rows.set(id, { clubId: id, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0, form: [] });
  }
  const played = comp.fixtures.filter((f) => f.result).sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const f of played) {
    const h = rows.get(f.homeId);
    const a = rows.get(f.awayId);
    const r = f.result!;
    if (!h || !a) continue;
    h.played++;
    a.played++;
    h.goalsFor += r.homeGoals;
    h.goalsAgainst += r.awayGoals;
    a.goalsFor += r.awayGoals;
    a.goalsAgainst += r.homeGoals;
    if (r.homeGoals > r.awayGoals) {
      h.won++; a.lost++; h.points += 3;
      h.form.push('V'); a.form.push('P');
    } else if (r.homeGoals < r.awayGoals) {
      a.won++; h.lost++; a.points += 3;
      a.form.push('V'); h.form.push('P');
    } else {
      h.drawn++; a.drawn++; h.points++; a.points++;
      h.form.push('R'); a.form.push('R');
    }
  }
  const name = (id: string) => state?.clubs[id]?.shortName ?? id;
  return [...rows.values()]
    .map((r) => ({ ...r, form: r.form.slice(-5) }))
    .sort(
      (x, y) =>
        y.points - x.points ||
        y.goalsFor - y.goalsAgainst - (x.goalsFor - x.goalsAgainst) ||
        y.goalsFor - x.goalsFor ||
        name(x.clubId).localeCompare(name(y.clubId), 'cs'),
    );
}

/** Forma klubu jako číslo od -1 (samé prohry) do 1 (samé výhry). */
export function formScore(form: TableRow['form']): number {
  if (form.length === 0) return 0;
  return form.reduce((s, f) => s + (f === 'V' ? 1 : f === 'P' ? -1 : 0), 0) / form.length;
}
