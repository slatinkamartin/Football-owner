import { formatDate } from './calendar';
import { budgetApproved, budgetDue, forecastSeason } from './budget';
import { annualCosts } from './finance';
import { licenceProblems } from './financing';
import type { MilestoneTab } from './milestones';
import { squadOf } from './players';
import { coachOf, directorOf } from './staff';
import { activeStories } from './stories';
import { budgetRemaining, contractExpiring, playerName } from './transfers';
import type { GameState } from './types';
import { tierOf, transferWindow } from './world';

/**
 * Týdenní porada: pár konkrétních úkolů na tento týden podle stavu klubu. Každý úkol
 * vede tam, kde se řeší. Nic se tu neukládá, porada se počítá z aktuálního stavu.
 */

export interface BriefingTask {
  id: string;
  /** 1 = hoří, 2 = tento týden, 3 = stojí za pozornost. */
  urgency: 1 | 2 | 3;
  text: string;
  detail?: string;
  tab: MilestoneTab;
  sub?: 'prehled' | 'rozpocet' | 'prijmy' | 'vydaje' | 'prestupy' | 'financovani';
  action: string;
}

const days = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;

export function weeklyBriefing(state: GameState, limit = 5): BriefingTask[] {
  if (state.gameOver) return [];
  const out: BriefingTask[] = [];
  const own = state.owner.clubId;
  const club = state.clubs[own];
  const squad = squadOf(state, own);
  const window = transferWindow(state.date);

  // Rozhodnutí, která čekají (nejbližší termín).
  const events = [...state.events].sort((a, b) => (a.expires < b.expires ? -1 : 1));
  if (events.length) {
    const e = events[0];
    const left = days(state.date, e.expires);
    out.push({ id: `e-${e.id}`, urgency: left <= 3 ? 1 : 2, text: `Rozhodnout: ${e.title}`, detail: `${events.length > 1 ? `${events.length} situace čekají, ` : ''}termín ${formatDate(e.expires)}. Jinak platí „${e.options.find((o) => o.id === e.defaultOption)?.label}“.`, tab: 'prehled', action: 'Rozhodnout' });
  }

  // Nabídky na naše hráče brzy vyprší.
  const offers = state.market.offers.filter((o) => state.players[o.playerId]?.clubId === own).sort((a, b) => b.fee - a.fee);
  if (offers.length) {
    const o = offers[0];
    const left = days(state.date, o.expires);
    out.push({ id: `o-${o.id}`, urgency: left <= 2 ? 1 : 2, text: `Nabídka ${mil(o.fee)} za ${playerName(state.players[o.playerId])}`, detail: `${offers.length > 1 ? `Celkem ${offers.length} nabídky. ` : ''}Platí do ${formatDate(o.expires)}, ředitel doporučuje ${o.advice === 'prijmout' ? 'přijmout' : 'odmítnout'}.`, tab: 'prestupy', action: 'Rozhodnout' });
  }

  // Rozpočet sezóny.
  if (!budgetApproved(state) && state.date <= budgetDue(state) && state.date >= `${state.season}-07-01`) {
    const left = days(state.date, budgetDue(state));
    out.push({ id: 'rozpocet', urgency: left <= 5 ? 1 : 2, text: 'Schválit rozpočet sezóny', detail: `Termín ${formatDate(budgetDue(state))}. Při schválení se prodají permanentky.`, tab: 'finance', sub: 'rozpocet', action: 'Rozpočet' });
  }

  // Peníze: potřeba od majitele, licence.
  const plan = forecastSeason(state);
  if ((plan.ownerNeed ?? 0) > 0) out.push({ id: 'penize', urgency: 1, text: `Klubu dojdou peníze: chybí asi ${mil(plan.ownerNeed!)}`, detail: plan.cashMinDate ? `Nejhůř ${formatDate(plan.cashMinDate)}. Vklad, půjčka, prodej hráče nebo úspory.` : undefined, tab: 'finance', sub: 'financovani', action: 'Financování' });
  const licence = `${state.season + 1}-03-31`;
  if (state.date >= `${state.season + 1}-02-01` && state.date <= licence && licenceProblems(state).length) {
    out.push({ id: 'licence', urgency: 1, text: 'Licence by teď neprošla', detail: licenceProblems(state).join(', '), tab: 'finance', sub: 'financovani', action: 'Financování' });
  }

  // Vedení.
  if (!coachOf(state, own) || coachOf(state, own)?.interim) out.push({ id: 'trener', urgency: 2, text: 'Klub nemá stálého trenéra', detail: 'Tým vede zastupující trenér, výkon trpí.', tab: 'vedeni', action: 'Najmout' });
  if (!directorOf(state, own) || directorOf(state, own)?.interim) out.push({ id: 'reditel', urgency: 2, text: 'Klub nemá stálého sportovního ředitele', detail: 'Přestupy a smlouvy vyřizuje zastupující ředitel.', tab: 'vedeni', action: 'Najmout' });

  // Přestupní okno.
  if (window) {
    const end = window === 'leto' ? `${state.date.slice(0, 4)}-08-31` : `${state.date.slice(0, 4)}-02-14`;
    const left = days(state.date, end);
    if (left <= 7 && squad.length < 20) out.push({ id: 'okno-kadr', urgency: 1, text: `Okno končí za ${left} dní a v kádru je jen ${squad.length} hráčů`, tab: 'prestupy', action: 'Přestupy' });
    else if (left <= 5 && budgetRemaining(state) > annualCosts(club, tierOf(state, own)) * 0.05) out.push({ id: 'okno-penize', urgency: 2, text: `Okno končí za ${left} dní, na přestupy zbývá ${mil(budgetRemaining(state))}`, tab: 'prestupy', action: 'Přestupy' });
  }

  // Kádr: nespokojené opory a končící smlouvy klíčových hráčů.
  const core = [...squad].sort((a, b) => b.overall - a.overall).slice(0, 11);
  const unhappy = core.filter((p) => p.morale < 30);
  if (unhappy.length) out.push({ id: 'moralka', urgency: 2, text: `Nespokojené opory: ${unhappy.slice(0, 2).map(playerName).join(', ')}${unhappy.length > 2 ? ` a další (${unhappy.length - 2})` : ''}`, detail: 'Málo minut, nízký plat nebo nesplněný slib. Kabina to cítí.', tab: 'kadr', action: 'Kádr' });
  const month = Number(state.date.slice(5, 7));
  const expiring = core.filter((p) => contractExpiring(state, p));
  if (expiring.length && month >= 1 && month <= 6) out.push({ id: 'smlouvy', urgency: month >= 5 ? 1 : 3, text: `Opory s končící smlouvou: ${expiring.slice(0, 3).map(playerName).join(', ')}`, detail: 'Bez prodloužení v létě odejdou zadarmo.', tab: 'finance', sub: 'vydaje', action: 'Smlouvy' });

  // Příběhy čekající na zápasy (jen připomínka).
  const story = activeStories(state).find((s) => s.waiting === 'zapasy' || s.waiting === 'tydny' || s.waiting === 'nabidka');
  if (story) out.push({ id: `pb-${story.id}`, urgency: 3, text: `Příběh běží: ${story.title}`, detail: story.waiting === 'zapasy' ? `Rozhodne se za ${story.matchesLeft ?? 3} zápasy.` : story.until ? `Vyhodnotí se ${formatDate(story.until)}.` : undefined, tab: 'prehled', action: 'Ukázat' });

  // Nevyužité peníze.
  const idle = club.finance.balance - annualCosts(club, tierOf(state, own)) * 0.8;
  if (idle > 0 && !(plan.ownerNeed ?? 0)) out.push({ id: 'idle', urgency: 3, text: `Na účtu leží ${mil(club.finance.balance)}`, detail: window ? 'Okno je otevřené: posily, nebo velká investice do zázemí.' : 'Peníze můžou pracovat: velké investice, programy klubu nebo vyšší mzdový strop.', tab: window ? 'prestupy' : 'stadion', action: window ? 'Přestupy' : 'Investice' });

  return out.sort((a, b) => a.urgency - b.urgency).slice(0, limit);
}
