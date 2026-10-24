import { agendaSlots, monthPriorities, priorityAdvice, type PriorityId } from './agenda';
import { projectOffers } from './projects';
import type { GameState } from './types';

/**
 * Rádce „Co teď“ (V1 A2, v0.29 W2): doporučení priorit na měsíc z dat (důvěra, kotel, město,
 * sponzoři, okno a lov, projekty) a nejvýš 2 další kroky (rozhodnutí s termínem, projekty, trénink).
 */

export interface OwnerAdvice {
  id: string;
  title: string;
  reason: string;
  /** Doporučená sada priorit měsíce (setMonthPriorities). */
  priorities?: PriorityId[];
  /** Kam navigovat (podzáložka): 'rozhodnuti' | 'projekty' | 'trenink' | 'lov'. */
  tab?: string;
}

export interface MonthAdvice {
  /** Doporučené priority s důvodem (tolik, kolik jich majitel smí mít). */
  priorities: { id: PriorityId; title: string; reason: string }[];
  /** Doporučení se liší od aktuálních priorit (nebo je zatím zvolilo vedení). */
  differs: boolean;
  other: OwnerAdvice[];
}

export function monthAdvice(state: GameState): MonthAdvice {
  if (state.owner.ousted || state.gameOver) return { priorities: [], differs: false, other: [] };
  const n = Math.max(2, agendaSlots(state));
  const pr = priorityAdvice(state).slice(0, n).map(({ id, title, reason }) => ({ id, title, reason }));
  const cur = monthPriorities(state);
  const differs = cur.by === 'vedeni' || pr.some((p) => !cur.priorities.includes(p.id));
  const other: (OwnerAdvice & { score: number })[] = [];
  const urgent = [...state.events].sort((a, b) => (a.expires < b.expires ? -1 : 1))[0];
  if (urgent) {
    const days = Math.round((Date.parse(urgent.expires) - Date.parse(state.date)) / 86_400_000);
    other.push({ id: `rozhodnuti-${urgent.id}`, title: `Rozhodnout: ${urgent.title}`, reason: days <= 2 ? `Termín za ${Math.max(0, days)} dny, jinak platí výchozí volba.` : `Čeká ${state.events.length} rozhodnutí.`, tab: 'rozhodnuti', score: days <= 2 ? 90 : 40 });
  }
  if (!state.strategy?.picked && projectOffers(state).length) {
    other.push({ id: 'projekty', title: 'Vybrat strategické projekty', reason: 'Vedení připravilo nabídku projektů na sezónu. Vyberte 1–3, kroky pak plní priority měsíce i výsledky.', tab: 'projekty', score: 85 });
  }
  const club = state.clubs[state.owner.clubId];
  if (!state.training?.set && club.staff.coachId) other.push({ id: 'trenink-plan', title: 'Nastavit plán tréninku', reason: 'Trenér trénuje po svém. Přijatý plán přidá sílu v zápasech.', tab: 'trenink', score: 30 });
  return {
    priorities: pr,
    differs,
    other: other.sort((a, b) => b.score - a.score).slice(0, 2).map(({ score: _s, ...a }) => a),
  };
}

/** Kompatibilní seznam (nejvýš 3): doporučené priority jako jedna položka + další kroky. */
export function weeklyAdvice(state: GameState): OwnerAdvice[] {
  const m = monthAdvice(state);
  if (!m.priorities.length && !m.other.length) return [];
  const out: OwnerAdvice[] = [];
  if (m.differs && m.priorities.length) {
    out.push({ id: 'priority', title: `Priority měsíce: ${m.priorities.map((p) => p.title).join(', ')}`, reason: m.priorities.map((p) => p.reason).join(' '), priorities: m.priorities.map((p) => p.id) });
  }
  return [...out, ...m.other].slice(0, 3);
}
