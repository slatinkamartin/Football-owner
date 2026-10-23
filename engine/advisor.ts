import { weekAgenda } from './agenda';
import { characterTopics, characters } from './characters';
import { sponsorRelation } from './finplus';
import { huntTargets } from './hunt';
import { squadOf } from './players';
import { activeProjects, projectOffers } from './projects';
import { contracts } from './sponsors';
import { cityOf, ultrasOf } from './surroundings';
import type { GameState } from './types';
import { transferWindow } from './world';

/**
 * V1 (A2): Rádce „Co teď“. Nejvýš 3 nejužitečnější kroky tento týden s důvodem z dat
 * (důvěra, kotel, město, sponzoři, projekty, lov, rozhodnutí s termínem).
 */

export interface OwnerAdvice {
  id: string;
  title: string;
  reason: string;
  /** Akce agendy, kterou rádce doporučuje (planAgendaAction). */
  actionId?: string;
  target?: string;
  /** Kam navigovat (podzáložka), když nejde o akci agendy: 'rozhodnuti' | 'projekty' | 'trenink' | 'lov'. */
  tab?: string;
}

export function weeklyAdvice(state: GameState): OwnerAdvice[] {
  if (state.owner.ousted || state.gameOver) return [];
  const out: (OwnerAdvice & { score: number })[] = [];
  const ag = weekAgenda(state);
  const can = (id: string) => {
    const o = ag.options.find((x) => x.id === id);
    return !!o && !o.disabledReason;
  };
  const free = ag.slots - ag.used.filter((u) => !u.routine).length;
  const club = state.clubs[state.owner.clubId];

  // Rozhodnutí s blížícím se termínem.
  const urgent = [...state.events].sort((a, b) => (a.expires < b.expires ? -1 : 1))[0];
  if (urgent) {
    const days = Math.round((Date.parse(urgent.expires) - Date.parse(state.date)) / 86_400_000);
    out.push({ id: `rozhodnuti-${urgent.id}`, title: `Rozhodnout: ${urgent.title}`, reason: days <= 2 ? `Termín za ${Math.max(0, days)} dny, jinak platí výchozí volba.` : `Čeká ${state.events.length} ${state.events.length === 1 ? 'rozhodnutí' : 'rozhodnutí'}.`, tab: 'rozhodnuti', score: days <= 2 ? 90 : 40 });
  }
  if (!state.strategy?.picked && projectOffers(state).length) {
    out.push({ id: 'projekty', title: 'Vybrat strategické projekty', reason: 'Vedení připravilo nabídku projektů na sezónu. Vyberte 1–3, kroky pak plníte agendou i výsledky.', tab: 'projekty', score: 85 });
  }
  if (free > 0) {
    const trust = state.owner.trust.trener;
    if (trust < 45 && can('trener')) out.push({ id: 'trener', title: 'Porada s trenérem', reason: `Důvěra trenéra je jen ${Math.round(trust)}. Podpora ji zvedne.`, actionId: 'trener', target: 'podpora', score: 80 - trust / 2 });
    const u = ultrasOf(state);
    if ((u.relation < 45 || (u.boycottUntil && u.boycottUntil >= state.date)) && can('kotel')) out.push({ id: 'kotel', title: 'Setkání s kotlem', reason: u.boycottUntil && u.boycottUntil >= state.date ? 'Kotel bojkotuje zápasy. Schůzka ho může ukončit.' : `Vztah s kotlem je ${Math.round(u.relation)}: hrozí bojkot a pokuty.`, actionId: 'kotel', score: 75 - u.relation / 2 });
    const city = cityOf(state);
    const building = (state.bigProjects ?? []).some((p) => p.end > state.date);
    if ((city.relation < 40 || building) && can('radnice')) out.push({ id: 'radnice', title: 'Jednání na radnici', reason: city.relation < 40 ? `Vztah s městem je ${Math.round(city.relation)}: povolení staveb a dotace jsou v ohrožení.` : 'Běží stavba – dobrý vztah s městem urychlí povolení.', actionId: 'radnice', score: 60 - city.relation / 3 });
    const gen = contracts(state).find((c) => c.slot === 'generalni');
    const rel = sponsorRelation(state, 'generalni');
    if (gen && (rel < 50 || gen.untilSeason <= state.season || (state.sponsorOffers ?? []).length) && can('sponzor'))
      out.push({ id: 'sponzor', title: 'Oběd se sponzorem', reason: gen.untilSeason <= state.season ? `Smlouva s ${gen.name} končí v létě.` : (state.sponsorOffers ?? []).length ? 'Na stole jsou sponzorské nabídky – oběd je vylepší.' : `Vztah s ${gen.name} je ${Math.round(rel)}.`, actionId: 'sponzor', target: 'generalni', score: 55 - rel / 4 });
    if (transferWindow(state.date)) {
      const t = huntTargets(state).find((x) => !x.foreign && x.trips === 0);
      if (t && can('skauting')) out.push({ id: 'skauting', title: `Skautská cesta: ${t.name}`, reason: `Okno je otevřené a odhad je jen ${t.lo}–${t.hi}.${t.rival ? ` Zájem má i ${t.rival.name}.` : ''}`, actionId: 'skauting', target: t.id, score: 58 });
      const r = huntTargets(state).find((x) => !x.foreign && x.rival && x.rival.strength >= 50);
      if (r && can('prestup')) out.push({ id: 'prestup', title: `Osobní jednání: ${r.name}`, reason: `${r.rival!.name} o hráče stojí (${r.rival!.strength} %). Osobní jednání konkurenci zchladí.`, actionId: 'prestup', target: r.playerId, score: 62 });
    }
    for (const p of activeProjects(state)) {
      const step = p.steps.find((s) => !s.done && s.text.includes('z agendy'));
      if (step && can('projekt')) {
        out.push({ id: `projekt-${p.id}`, title: `Krok projektu: ${p.title}`, reason: step.text, actionId: 'projekt', target: p.id, score: 45 + p.progress * 20 });
        break;
      }
    }
    const squad = squadOf(state, club.id);
    const morale = squad.length ? squad.reduce((a, x) => a + x.morale, 0) / squad.length : 50;
    if (morale < 50 && can('trenink')) out.push({ id: 'trenink', title: 'Návštěva tréninku', reason: `Morálka týmu je ${Math.round(morale)}.`, actionId: 'trenink', score: 65 - morale / 2 });
    if (state.owner.media < 40 && can('media')) out.push({ id: 'media', title: 'Rozhovor pro média', reason: `Pověst u médií je ${Math.round(state.owner.media)}.`, actionId: 'media', target: 'klid', score: 50 - state.owner.media / 2 });
    const unhappy = characters(state).filter((c) => c.relation < -20 && c.role !== 'trener' && c.role !== 'kotel').sort((a, b) => a.relation - b.relation)[0];
    if (unhappy && can('postava')) out.push({ id: `postava-${unhappy.id}`, title: `Schůzka: ${unhappy.name}`, reason: `${unhappy.roleLabel}: vztah ${unhappy.relation}${unhappy.need ? `, potřebuje: ${unhappy.need.toLowerCase()}` : ''}.`, actionId: 'postava', target: `${unhappy.id}|${characterTopics(state, unhappy.id).find((t) => !t.disabledReason)?.id ?? ''}`, score: 50 - unhappy.relation / 4 });
  }
  if (!state.training?.set && club.staff.coachId) out.push({ id: 'trenink-plan', title: 'Nastavit plán tréninku', reason: 'Trenér trénuje po svém. Přijatý plán přidá sílu v zápasech.', tab: 'trenink', score: 30 });
  // Doplnění: když není co hasit, aspoň užitečná akce, aby agenda nepropadla.
  if (free > 0 && out.filter((x) => x.actionId).length === 0) {
    if (can('trenink')) out.push({ id: 'trenink', title: 'Návštěva tréninku', reason: 'Nic nehoří – morálka a vztah s kapitánem se vždy hodí.', actionId: 'trenink', score: 20 });
    else if (can('media')) out.push({ id: 'media', title: 'Rozhovor pro média', reason: 'Udržet dobré jméno majitele.', actionId: 'media', target: 'klid', score: 15 });
  }
  const seen = new Set<string>();
  return out
    .sort((a, b) => b.score - a.score)
    .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
    .slice(0, 3)
    .map(({ score: _s, ...a }) => a);
}
