import { strictnessFactor } from './settings';
import { toScore } from './scales';
import { addDays } from './calendar';
import { annualCosts, book } from './finance';
import { satisfy } from './ownership';
import type { Rng } from './rng';
import type { GameState, GreyAction } from './types';
import { addNews, clamp, competitionOf, tierOf } from './world';

/**
 * Šedá zóna: rozhodnutí na hraně etiky (agresivní daňová optimalizace, obchody se spřízněnými
 * firmami, oslovování hráčů před oknem…). Nejsou to zločiny, ale když vyjdou najevo, přijde
 * skandál, pokuty, doměrky a nespokojení akcionáři. Každá taková akce zvýší skryté riziko odhalení.
 */

/** Celková závažnost odhalených prohřešků, od které svaz majiteli zakáže činnost. */
export const BAN_SEVERITY = 40;
const BAN_DAYS = 365;

export function greyAction(state: GameState, action: Omit<GreyAction, 'date'>, exposure: number): void {
  state.grey.actions.push({ date: state.date, ...action });
  state.grey.exposure = clamp(state.grey.exposure + exposure, 0, 100);
}

export function riskLevel(state: GameState): { label: string; tone: 'good' | 'warn' | 'bad' } {
  const e = state.grey.exposure;
  if (e >= 40) return { label: 'vysoké', tone: 'bad' };
  if (e >= 15) return { label: 'střední', tone: 'warn' };
  return { label: 'nízké', tone: 'good' };
}

/** Pověst u svazu násobí pokuty: dobré vztahy je zmírní, špatné zpřísní. */
export function fineFactor(state: GameState): number {
  return 1.5 - state.owner.league / 100;
}

export function media(state: GameState, delta: number): void {
  // Tiskový mluvčí tlumí mediální propady.
  const pr = state.clubs[state.owner.clubId]?.staff.mediaId ? 0.75 : 1;
  state.owner.media = clamp(state.owner.media + (delta < 0 ? delta * pr : delta), 0, 100);
}

export function league(state: GameState, delta: number): void {
  state.owner.league = clamp(state.owner.league + delta, 0, 100);
}

/** Pokuta od svazu (škálovaná podle velikosti klubu a vztahů se svazem). */
export function fine(state: GameState, base: number, note: string): number {
  const club = state.clubs[state.owner.clubId];
  const scale = annualCosts(club, tierOf(state, club.id)) / 70_000_000;
  const amount = Math.max(20_000, Math.round((base * Math.max(0.3, scale) * fineFactor(state) * strictnessFactor(state)) / 10_000) * 10_000);
  book(state, club.id, 'ostatni', -amount, note);
  return amount;
}

/** Komerční příjmy podle pověsti majitele a případného skandálu. */
export function ownerCommercialFactor(state: GameState): number {
  const scandal = state.grey.scandalUntil && state.grey.scandalUntil > state.date ? 0.85 : 1;
  return (0.95 + 0.1 * (state.owner.media / 100)) * scandal;
}

/** Měsíčně: daňové schéma zvyšuje riziko, riziko pomalu klesá, šance na odhalení, pověst se vrací k normálu. */
export function monthlyGrey(state: GameState, rng: Rng): void {
  const g = state.grey;
  if (g.taxSchemeUntil && g.taxSchemeUntil > state.date) g.exposure = clamp(g.exposure + 2, 0, 100);
  else g.taxSchemeUntil = undefined;
  const hidden = g.actions.filter((a) => !a.discovered);
  if (hidden.length && g.exposure > 0) {
    // Slabý finanční ředitel nechává stopy, dobrý je umí zamést (a nespokojený sportovní ředitel mluví).
    const finance = state.staff[state.clubs[state.owner.clubId].staff.financeId ?? '']?.ability ?? 40;
    const leaky = (state.owner.trust.reditel < 30 ? 1.4 : 1) * (1.2 - finance / 250);
    if (rng.chance((g.exposure / 100) * 0.08 * leaky)) discover(state);
  }
  g.exposure = clamp(g.exposure - 2, 0, 100);
  const prTarget = state.clubs[state.owner.clubId].staff.mediaId ? 58 : 50;
  state.owner.media += (prTarget - state.owner.media) * 0.05;
  state.owner.league += (50 - state.owner.league) * 0.03;
}

/** Odhalení: skandál, pokuty a doměrky, případně odečet bodů; při velké závažnosti zákaz činnosti. */
export function discover(state: GameState): void {
  const g = state.grey;
  const club = state.clubs[state.owner.clubId];
  const found = g.actions.filter((a) => !a.discovered);
  if (!found.length) return;
  for (const a of found) a.discovered = true;
  const severity = g.actions.filter((a) => a.discovered).reduce((s, a) => s + a.severity, 0);
  const labels = found.map((a) => a.label.toLowerCase()).join(', ');

  club.fanMood = clamp(club.fanMood - 12, 0, 100);
  club.reputation = clamp(club.reputation - 2, 1, 99);
  g.scandalUntil = addDays(state.date, 182);
  g.taxSchemeUntil = undefined;
  g.tapped = [];
  g.exposure = Math.round(g.exposure * 0.3);
  media(state, -25);
  league(state, -15);
  satisfy(state, -15);
  if (found.some((a) => a.minority)) satisfy(state, -20);

  const base = found.reduce((s, a) => s + a.severity, 0) * 100_000;
  const amount = fine(state, base, 'Pokuta svazu po mediální kauze');
  const refund = Math.round(found.reduce((s, a) => s + (a.gain ?? 0), 0) * 1.3);
  if (refund > 0) book(state, club.id, 'ostatni', -refund, 'Doměrky a vrácení peněz s penále');
  let text = `Média rozkryla: ${labels}. Pokuta ${amount.toLocaleString('cs-CZ')} Kč${refund > 0 ? `, doměrky a vratky ${refund.toLocaleString('cs-CZ')} Kč` : ''}. Sponzoři půl roku krátí plnění.`;
  const points = found.reduce((s, a) => s + (a.points ?? 0), 0);
  const comp = competitionOf(state, club.id);
  if (points > 0 && comp) {
    comp.penalties = { ...(comp.penalties ?? {}), [club.id]: (comp.penalties?.[club.id] ?? 0) + points };
    text += ` Disciplinárka odečetla ${points} ${points === 1 ? 'bod' : points < 5 ? 'body' : 'bodů'}.`;
  }
  if (severity >= BAN_SEVERITY) {
    const until = addDays(state.date, BAN_DAYS);
    state.owner.ousted = { ...(state.owner.ousted ?? { since: state.date }), banUntil: until };
    text += ` Opakované prohřešky: svaz vám na rok zakázal činnost ve fotbale (do ${until.split('-').reverse().join('. ')}). Klub zatím řídí představenstvo.`;
  } else {
    text += ` Celková závažnost vašich kauz je ${toScore(severity, 0, BAN_SEVERITY)} ze 100; při 100 hrozí zákaz činnosti.`;
  }
  addNews(state, { kind: 'varovani', title: 'Kauza: majitel na hraně etiky', text });
}

/** Konec zákazu činnosti: s většinou se majitel vrací hned, jinak musí přesvědčit akcionáře. */
export function checkBan(state: GameState): void {
  const o = state.owner.ousted;
  if (!o?.banUntil || o.banUntil > state.date) return;
  const others = state.shareholders.reduce((a, s) => a + s.share, 0);
  if (others < 0.5 || state.owner.share > 0.5) {
    state.owner.ousted = undefined;
    addNews(state, { kind: 'info', title: 'Zákaz činnosti skončil', text: 'Vracíte se do vedení klubu.' });
  } else {
    state.owner.ousted = { since: o.since, lastAttempt: o.lastAttempt };
    addNews(state, { kind: 'info', title: 'Zákaz činnosti skončil', text: 'O návratu do vedení teď rozhodnou spolumajitelé.' });
  }
}
