import { playerAge } from './players';
import type { GameState, Player, TransferLogEntry } from './types';
import { clubLabel, FREE, isForeign } from './world';

/**
 * Historie přestupů: každý přesun hráče mezi kluby (přestup, hostování, volný hráč, zahraničí, odchod bez klubu).
 * Klub majitele si pamatuje poslední 3 roky, ostatní přestupy ligy jen aktuální sezónu.
 */

const KEEP_YEARS = 3;

/** Zapíše přestup do historie a promaže staré záznamy. */
export function logTransfer(
  state: GameState,
  p: Player,
  fromId: string,
  toId: string,
  fee: number,
  kind?: TransferLogEntry['kind'],
): void {
  const k: TransferLogEntry['kind'] =
    kind ?? (toId === FREE ? 'odchod' : isForeign(fromId) || isForeign(toId) ? 'zahranici' : fromId === FREE ? 'volny' : 'prestup');
  const entry: TransferLogEntry = {
    date: state.date,
    playerId: p.id,
    playerName: `${p.firstName} ${p.lastName}`,
    position: p.position,
    age: playerAge(p, state.season),
    overall: p.overall,
    fromId,
    toId,
    fromName: clubLabel(state, fromId),
    toName: clubLabel(state, toId),
    fee: Number.isFinite(fee) ? Math.round(fee) : 0,
    kind: k,
  };
  state.transferLog = pruneTransferLog(state, [entry, ...(state.transferLog ?? [])]);
}

/** Klub majitele: poslední 3 roky; ostatní: od začátku aktuální sezóny. */
export function pruneTransferLog(state: GameState, log: TransferLogEntry[]): TransferLogEntry[] {
  const own = state.owner.clubId;
  const ownFrom = `${state.season - KEEP_YEARS}-07-01`;
  const seasonFrom = `${state.season}-07-01`;
  return log.filter((e) => (e.fromId === own || e.toId === own ? e.date >= ownFrom : e.date >= seasonFrom));
}

/** Přestupy klubu majitele za poslední 3 roky (nejnovější první). */
export function ownTransferLog(state: GameState): TransferLogEntry[] {
  const own = state.owner.clubId;
  const from = `${state.season - KEEP_YEARS}-07-01`;
  return (state.transferLog ?? []).filter((e) => (e.fromId === own || e.toId === own) && e.date >= from);
}

/** Přestupy v soutěži klubu majitele v aktuální sezóně (aspoň jeden z klubů hraje stejnou soutěž). */
export function leagueTransferLog(state: GameState, clubIds: string[]): TransferLogEntry[] {
  const from = `${state.season}-07-01`;
  const set = new Set(clubIds);
  return (state.transferLog ?? []).filter((e) => e.date >= from && (set.has(e.fromId) || set.has(e.toId)));
}
