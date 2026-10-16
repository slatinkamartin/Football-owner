import { SEASON_END } from './calendar';
import { dressingRoom } from './atmosphere';
import type { GameState, NewsItem, PulseKey, PulseState } from './types';

/**
 * Panel tlaku: čtyři ukazatele (fanoušci, média, kabina, vedení a akcionáři) s trendem
 * a důvody, proč se pohnuly. Důvod se bere z toho, co se ten den stalo (zprávy dne).
 */

export const PULSE_KEYS: PulseKey[] = ['fans', 'media', 'kabina', 'vedeni'];
export const PULSE_LABEL: Record<PulseKey, string> = { fans: 'Fanoušci', media: 'Média', kabina: 'Kabina', vedeni: 'Vedení a akcionáři' };
const MIN_DELTA: Record<PulseKey, number> = { fans: 0.8, media: 0.8, kabina: 1, vedeni: 0.8 };

export type PulseValues = Record<PulseKey, number>;

export function pulseValues(state: GameState): PulseValues {
  const club = state.clubs[state.owner.clubId];
  const trust = (state.owner.trust.trener + state.owner.trust.reditel) / 2;
  const shares = state.shareholders.reduce((a, s) => a + s.share, 0);
  const satisfaction = shares > 0 ? state.shareholders.reduce((a, s) => a + s.satisfaction * s.share, 0) / shares : undefined;
  return {
    fans: club.fanMood,
    media: state.owner.media,
    kabina: dressingRoom(state).morale,
    vedeni: satisfaction === undefined ? trust : trust * 0.6 + satisfaction * 0.4,
  };
}

function pulseOf(state: GameState): PulseState {
  return (state.pulse ??= { history: [], causes: [] });
}

/** Proč se ukazatel pohnul: zápas dne, jinak nejdůležitější zpráva dne, na začátku měsíce měsíční vývoj. */
function reasonFrom(state: GameState, news: NewsItem[]): string {
  if (state.date.slice(5) === SEASON_END) return 'Konec sezóny: umístění, postupy a hodnocení vedení';
  const result = news.find((n) => n.kind === 'vysledek');
  if (result) return result.title;
  const notable = news.find((n) => n.kind === 'sezona') ?? news.find((n) => n.kind === 'varovani') ?? (state.date.endsWith('-01') ? undefined : news[0]);
  if (notable) return notable.title;
  if (state.date.endsWith('-01')) return 'Měsíční vývoj (ceny, komunita, morálka, výsledky)';
  return 'Průběžný vývoj';
}

/** Zapíše změny ukazatelů mezi dvěma stavy (den hry nebo rozhodnutí majitele). */
export function recordPulse(state: GameState, before: PulseValues, news: NewsItem[], reason?: string): void {
  const after = pulseValues(state);
  const pulse = pulseOf(state);
  let why: string | undefined = reason;
  for (const key of PULSE_KEYS) {
    const delta = after[key] - before[key];
    if (Math.abs(delta) < MIN_DELTA[key]) continue;
    why ??= reasonFrom(state, news);
    pulse.causes.unshift({ date: state.date, key, delta: Math.round(delta * 10) / 10, reason: why });
  }
  pulse.causes.length = Math.min(pulse.causes.length, 120);
}

/** Týdenní záznam hodnot (pro šipku trendu). */
export function snapshotPulse(state: GameState): void {
  const v = pulseValues(state);
  const pulse = pulseOf(state);
  pulse.history.push({ date: state.date, fans: Math.round(v.fans), media: Math.round(v.media), kabina: Math.round(v.kabina), vedeni: Math.round(v.vedeni) });
  pulse.history = pulse.history.slice(-60);
}

export interface PulseRow {
  key: PulseKey;
  label: string;
  value: number;
  /** Změna za poslední čtyři týdny. */
  trend: number;
  causes: { date: string; delta: number; reason: string }[];
}

export function pulseRows(state: GameState): PulseRow[] {
  const v = pulseValues(state);
  const history = state.pulse?.history ?? [];
  const old = history.length >= 5 ? history[history.length - 5] : history[0];
  return PULSE_KEYS.map((key) => ({
    key,
    label: PULSE_LABEL[key],
    value: Math.round(v[key]),
    trend: old ? Math.round(v[key] - old[key]) : 0,
    causes: (state.pulse?.causes ?? []).filter((c) => c.key === key).slice(0, 3),
  }));
}

/** Rozhodnutí majitele v rozhraní: změny ukazatelů se zapíšou s důvodem z nové zprávy. */
export function pulseAfterAction(prev: GameState, next: GameState): GameState {
  if (next === prev) return next;
  const before = pulseValues(prev);
  const after = pulseValues(next);
  if (!PULSE_KEYS.some((k) => Math.abs(after[k] - before[k]) >= MIN_DELTA[k])) return next;
  // Nové zprávy jsou na začátku seznamu, až po první zprávu, kterou znal původní stav.
  const top = prev.news[0];
  const cut = top ? next.news.findIndex((n) => n.date === top.date && n.title === top.title) : next.news.length;
  const fresh = next.news.slice(0, cut < 0 ? 3 : cut);
  const out = structuredClone(next);
  recordPulse(out, before, fresh, fresh[0]?.title ?? 'Vaše rozhodnutí');
  return out;
}
