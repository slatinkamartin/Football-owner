import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { allFixtures, careerFrom, clubLabel, competitionOf, computeTable, markReportSeen, markScenarioSeen, scenarioDef, toggleWatch, advanceDays, advanceStep, nextStep, ownMatchTomorrow, settingsOf, pulseAfterAction, currentPhase, daysUntil, formatDate, formatShortDate, milestoneToday, nextMilestone, ownerBlocked, seasonLabel, startNegotiation, type ActionResult, type GameState, type Milestone } from '../engine';
import { money } from './format';
import { deleteGame, loadGame, saveCareer, saveGame } from './storage';
import { SeasonReportView } from './screens/Report';
import { Finance, type FinanceTab } from './screens/Finance';
import { GameMenu } from './screens/GameMenu';
import { AchievementsCard, AchievementToast } from './screens/Achievements'; // W3
import { PostMatch } from './screens/PostMatch'; // W2
import { MatchDetail } from './screens/MatchDetail';
import { ClubCard } from './screens/ClubCard';
import { PlayerCard } from './screens/PlayerCard';
import { NavContext, Sheet, type ModalRef } from './nav';
import { Matches } from './screens/Matches';
import { NewGame } from './screens/NewGame';
import { ClubHistoryCard, OwnerSummary, PositionChart, ScenarioCard, ToDo } from './screens/Overview';
import { LiveMatch, MatchDialog } from './screens/MatchPrep';
import { EuroLive, EuroMatchDialog } from './screens/BigMatch'; // W1
import { bigMatchWeekStarted, euroWindowTomorrow } from '../engine'; // W1, W3
import { Owner } from './screens/Owner';
import { OwnerDecisionsCard } from './screens/OwnerDecisions'; // W5
import { CalendarStrip } from './SeasonCalendar';
import { People } from './screens/People';
import { Squad } from './screens/Squad';
import { TeamShape } from './screens/TeamShape'; // W4
import { Stadium } from './screens/Stadium';
import { Transfers } from './screens/Transfers';
import { Tables } from './screens/Tables';
import { Notice } from './components';
import { PulsePanel } from './screens/Briefing';
import { FansCard } from './screens/Fans';
import { ForumCard } from './screens/Forum';
import { SocialCard } from './screens/Social';
import { PressMemoryCard } from './screens/Press';
import { CityCard, UltrasCard } from './screens/OwnerExtras';
import { AgentsCard } from './screens/MarketExtras';
import { ForeignMarket } from './screens/ForeignMarket';
import { SideGoalsCard } from './screens/finance/Extras';
import { ChallengesCard } from './screens/Challenges';
import { EuropeSection, EuropeStarsCard } from './screens/EuropeExtras';
import { SeasonCard } from './screens/SeasonCard'; // V3
import { forumThreads, lastMonthSummary, meetingView, personalMeeting, projectOffers } from '../engine';
import { AdvisorCard, PrioritiesCard, RoutineCard } from './screens/Agenda'; // V1, W2: priority měsíce
import { TrainingCard } from './screens/Training'; // V1
import { HuntCard } from './screens/Hunt'; // V1
import { OwnerLevelCard, ProjectsCard } from './screens/Projects'; // V1
import { CupBadge, CupBracket, CupHistory, CupProgressCard, DrawPreview, EuropeLeagueTable } from './screens/CupViews'; // V3
import { Week, type StepInfo, type WeekSlots } from './screens/Week';
import { Contacts } from './screens/Contacts';
import { GuideTip, startGuide, useGuide } from './screens/Guide';
import { AppearanceCard } from './screens/Appearance';
import { WeekEndCard, type WeekEndData } from './screens/WeekEnd';
import { MatchdayStage, MatchResultToast } from './screens/Matchday'; // W3: souhrn běžného zápasu
import { opensMatchWindow } from '../engine'; // W3
import { Icon } from './icons';
import { Crest, SubTabs, type SubTab } from './ui';
import { DEFAULT_SUB, MAIN_TABS, resolveTarget, type KlubSub, type LigaSub, type MainTab, type SubTabId, type TrhSub, type TymSub } from './navmap';
import { applyClubColors, applyThemePref, clearClubColors, isDark, loadThemePref, saveThemePref, type ThemePref } from './theme';

/** Pondělí týdne (týden = pondělí–neděle). */
function weekStart(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** Záložní shrnutí týdne (když engine nemá vlastní): výsledky a změny čísel mezi dvěma stavy. */
function basicWeekSummary(prev: GameState, next: GameState): WeekEndData {
  const own = next.owner.clubId;
  const results = allFixtures(next)
    .filter((x) => x.fixture.result && x.fixture.date > prev.date && x.fixture.date <= next.date && (x.fixture.homeId === own || x.fixture.awayId === own))
    .map((x) => `${x.name}: ${clubLabel(next, x.fixture.homeId)} – ${clubLabel(next, x.fixture.awayId)} ${x.fixture.result!.homeGoals}:${x.fixture.result!.awayGoals}`);
  const pos = (g: GameState) => {
    const comp = competitionOf(g, own);
    return comp ? computeTable(comp, g).findIndex((r) => r.clubId === own) + 1 : 0;
  };
  const bal = next.clubs[own].finance.balance - prev.clubs[own].finance.balance;
  const deltas: WeekEndData['deltas'] = [
    { label: 'Zůstatek', value: `${bal >= 0 ? '+' : '−'}${money(Math.abs(bal))}` },
    { label: 'Fanoušci', value: Math.round(next.clubs[own].fanMood - prev.clubs[own].fanMood) },
    { label: 'Důvěra trenéra', value: Math.round(next.owner.trust.trener - prev.owner.trust.trener) },
  ];
  if (results.length) deltas.splice(1, 0, { label: 'Pozice', value: pos(prev) - pos(next) });
  const fresh = next.news.filter((n) => n.date > prev.date && n.kind !== 'vysledek').slice(0, 3).map((n) => n.title);
  const mon = weekStart(prev.date);
  const sun = new Date(`${mon}T00:00:00Z`);
  sun.setUTCDate(sun.getUTCDate() + 6);
  return { title: `Konec týdne ${formatShortDate(mon)}–${formatShortDate(sun.toISOString().slice(0, 10))}`, lines: [...results, ...fresh], deltas };
}

/** Karta s vlastní zprávou o výsledku akce (pro karty, které vracejí ActionResult). */
function WithResult({ game, onChange, children }: { game: GameState; onChange: (g: GameState) => void; children: (apply: (r: ActionResult) => void) => ReactNode }) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const apply = (r: ActionResult) => {
    if (r.state !== game) onChange(r.state);
    setMessage({ text: r.message, ok: r.ok });
  };
  return (
    <>
      <Notice message={message?.text ?? null} ok={message?.ok} />
      {children(apply)}
    </>
  );
}

const TYM_TABS: SubTab<TymSub>[] = [
  { id: 'kadr', label: 'Kádr' },
  { id: 'slozeni', label: 'Složení' }, // W4
  { id: 'trenink', label: 'Trénink' },
  { id: 'vedeni', label: 'Vedení' },
  { id: 'postavy', label: 'Postavy' },
];
const TRH_TABS: SubTab<TrhSub>[] = [
  { id: 'prestupy', label: 'Přestupy' },
  { id: 'lov', label: 'Lov a skauting' },
  { id: 'agenti', label: 'Agenti' },
  { id: 'zahranici', label: 'Zahraničí' },
];
const KLUB_TABS: SubTab<KlubSub>[] = [
  { id: 'stadion', label: 'Stadion' },
  { id: 'fanousci', label: 'Fanoušci' },
  { id: 'forum', label: 'Fórum' },
  { id: 'site', label: 'Sítě a média' },
  { id: 'majitel', label: 'Majitel' },
  { id: 'projekty', label: 'Projekty a cíle' },
  { id: 'odznaky', label: 'Odznaky' },
];
const LIGA_TABS: SubTab<LigaSub>[] = [
  { id: 'tabulky', label: 'Tabulky' },
  { id: 'zapasy', label: 'Zápasy' },
  { id: 'pohary', label: 'Pohár a Evropa' },
  { id: 'historie', label: 'Historie' },
];

export function App() {
  const [game, setGame] = useState<GameState | null | undefined>(undefined);
  const [tab, setTab] = useState<MainTab>('tyden');
  const [subs, setSubs] = useState<Partial<Record<MainTab, SubTabId>>>(DEFAULT_SUB);

  const [outdated, setOutdated] = useState(false);
  const [modals, setModals] = useState<ModalRef[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const [financeTab, setFinanceTab] = useState<{ tab: FinanceTab; n: number }>({ tab: 'prehled', n: 0 });
  const [stopReason, setStopReason] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [playedId, setPlayedId] = useState<string | null>(null); // W3: odehraný běžný zápas (krátký souhrn)
  const [liveEuro, setLiveEuro] = useState(false); // W1: evropský přenos
  const [theme, setTheme] = useState<ThemePref>(() => loadThemePref());
  const [systemTick, setSystemTick] = useState(0);
  const [weekEnd, setWeekEnd] = useState<WeekEndData | null>(null);
  const [, setGuideTick] = useState(0);
  /** Stav na začátku týdne (pro shrnutí konce týdne). */
  const weekSnap = useRef<GameState | null>(null);
  const openModal = (m: ModalRef) => setModals((stack) => [...stack.filter((x) => !(x.type === m.type && x.id === m.id)), m]);
  const setOpenMatch = (id: string | null) => (id ? openModal({ type: 'match', id }) : setModals([]));

  useEffect(() => {
    loadGame().then(({ game: saved, outdated: old }) => {
      setOutdated(old);
      setGame(saved);
    });
  }, []);

  // B12: tmavý režim podle systému nebo ručně; B7: barvy klubu jako CSS proměnné.
  useEffect(() => {
    applyThemePref(theme);
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const on = () => setSystemTick((n) => n + 1);
    mq?.addEventListener?.('change', on);
    return () => mq?.removeEventListener?.('change', on);
  }, [theme]);
  const clubColors = game ? game.clubs[game.owner.clubId]?.colors : undefined;
  const colorKey = clubColors?.join(',');
  useEffect(() => {
    if (clubColors) applyClubColors(clubColors, isDark(theme));
    else clearClubColors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorKey, theme, systemTick]);

  const sub = subs[tab];
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab, sub, game === null]);

  // Výška horní lišty: okna s kartami začínají pod ní, takže při posunu zajíždějí pod lištu.
  const headRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty('--head-h', `${Math.round(el.getBoundingClientRect().bottom)}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    window.addEventListener('scroll', set, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', set);
    };
  }, [game === null || game === undefined]);

  const update = (next: GameState) => {
    setGame(next);
    void saveGame(next);
  };

  /** Přejít na záložku/podzáložku (nové i staré cíle odkazů). */
  const go = useCallback((target: string, subTarget?: string) => {
    const t = resolveTarget(target, subTarget);
    if (t.main === 'penize') setFinanceTab((f) => ({ tab: (t.sub as FinanceTab) ?? 'prehled', n: f.n + 1 }));
    else if (t.sub) setSubs((s) => ({ ...s, [t.main]: t.sub }));
    setTab(t.main);
  }, []);

  // Při nové nebo nahrané hře zavřít všechna okna, ať se nic nepřenese do jiné hry.
  const resetView = () => {
    setLive(false);
    setLiveEuro(false);
    setMatchOpen(false);
    setPlayedId(null);
    setModals([]);
    setMilestone(null);
    setStopReason(null);
    setNotice(null);
    setWeekEnd(null);
  };

  const startOver = async () => {
    await deleteGame();
    resetView();
    setTab('tyden');
    setGame(null);
  };

  const nav = {
    open: openModal,
    go,
    watch: (playerId: string) => {
      if (game) update(toggleWatch(game, playerId).state);
    },
    negotiate: (playerId: string) => {
      if (!game) return;
      const r = startNegotiation(game, playerId);
      if (r.state !== game) update(r.state);
      setNotice(r.ok ? null : r.message);
      setModals([]);
      go('trh/prestupy');
    },
  };

  const guide = useGuide(game ?? ({ seed: -1, date: '2000-01-01' } as GameState));

  if (game === undefined) return <div className="loading">Načítám…</div>;
  if (game === null) return <NewGame outdatedSave={outdated} onStart={(g) => { startGuide(g); setTab('tyden'); setSubs(DEFAULT_SUB); update(g); }} />;

  const club = game.clubs[game.owner.clubId];
  const comp = competitionOf(game, club.id);
  const phase = currentPhase(game);
  const nm = nextMilestone(game);
  const nmDays = nm ? daysUntil(game, nm.date) : 99;
  const match = ownMatchTomorrow(game);
  // W1: evropský zápas klubu majitele zítra (když se nehraje i domácí zápas).
  const euro = match ? undefined : euroWindowTomorrow(game); // W3: okno jen u klíčového evropského zápasu
  const step = nextStep(game);
  const showMilestones = settingsOf(game).stops.milestone;
  const advance = (next: GameState, reason?: string) => {
    setStopReason(reason ?? null);
    update(next);
    const m = milestoneToday(next);
    if (showMilestones && m && next.date !== game.date && !next.gameOver) setMilestone(m);
    // B8 → W2: přechod do nového měsíce → krátké shrnutí měsíce (týdenní karta zmizela).
    if (!next.gameOver && next.date.slice(0, 7) !== game.date.slice(0, 7)) {
      const from = weekSnap.current && weekSnap.current.date.slice(0, 7) === game.date.slice(0, 7) ? weekSnap.current : game;
      const v1 = lastMonthSummary(next);
      setWeekEnd(v1 && v1.month === game.date.slice(0, 7) ? v1 : basicWeekSummary(from, next));
      weekSnap.current = next;
    } else if (!weekSnap.current) weekSnap.current = game;
  };
  // Jedno tlačítko: v předvečer zápasu otevře zápas, jinak posune hru k dalšímu zápasu, milníku nebo o týden.
  // W3: okno před zápasem jen u klíčových zápasů (nebo podle nastavení); běžný zápas se odehraje rovnou.
  const keyEve = !!match && opensMatchWindow(game, match);
  const onStep = () => {
    setPlayedId(null);
    if (keyEve || euro) {
      setMatchOpen(true);
      return;
    }
    if (match) {
      const r = advanceDays(game, 1, true);
      advance(r.state, bigMatchWeekStarted(r.state, game.bigMatch?.id));
      if (r.fixtureId && !r.state.gameOver) setPlayedId(r.fixtureId);
      return;
    }
    const r = advanceStep(game);
    advance(r.state, r.reason);
    if (r.fixtureId && !r.state.gameOver) setPlayedId(r.fixtureId);
  };
  const stepLabel = match ? (keyEve ? 'Zápas' : 'Odehrát zápas') : euro ? 'Evropský zápas' : step.kind === 'tyden' ? 'Další týden' : step.label;
  const stepTitle = match
    ? `Zítra: ${clubLabel(game, match.fixture.homeId)} – ${clubLabel(game, match.fixture.awayId)} (${match.name})`
    : euro
      ? `Zítra: ${euro.stage}, ${euro.opponent.name}`
      : step.kind === 'zapas'
      ? 'Posunout hru na předvečer dalšího zápasu'
      : step.kind === 'milnik'
        ? `Posunout hru k milníku: ${nm?.title ?? ''}`
        : step.kind === 'deadline'
          ? 'Deadline day: hra jde po dnech'
          : 'Posunout hru o týden';
  const stepInfo: StepInfo = { label: `${stepLabel} ›`, title: stepTitle, match: !!(match || euro), disabled: !!game.gameOver, onStep };
  // Výroční zpráva se ukáže na začátku nové sezóny spolu s milníkem a výsledkem scénáře v jednom okně.
  const latest = game.seasonReports?.[0];
  const report = latest && !latest.seen && game.season > latest.season ? latest : undefined;
  const closeReport = () => {
    if (!report) return;
    let next = markReportSeen(game, report.season);
    if (next.scenario?.result && !next.scenario.result.seen) next = markScenarioSeen(next);
    update(next);
    setMilestone(null);
  };
  const blocked = ownerBlocked(game);
  // Odvolaný majitel klub neřídí: změny v ostatních záložkách se neuloží.
  const managed = (next: GameState) => {
    if (blocked && next !== game) {
      setNotice(blocked);
      return;
    }
    update(pulseAfterAction(game, next));
  };
  const onChangeHome = (next: GameState) => update(pulseAfterAction(game, next));
  const legacyGo = (t: string, s?: string) => go(t, s);

  // Osobní schůzka s postavou (mimo priority měsíce, jedna týdně zdarma).
  const meeting = meetingView(game); // W2: jedna osobní schůzka týdně zdarma
  const meet = (id: string, topic: string): ActionResult => {
    const r = personalMeeting(game, id, topic);
    if (r.state !== game) managed(r.state);
    return r;
  };
  const offers = projectOffers(game);

  const weekKey = weekStart(game.date);
  const slots: WeekSlots = {
    agenda: <WithResult game={game} onChange={onChangeHome}>{(apply) => <PrioritiesCard game={game} onResult={apply} />}</WithResult>,
    advisor: <WithResult game={game} onChange={onChangeHome}>{(apply) => <AdvisorCard game={game} onResult={apply} onNavigate={(t) => go(t)} />}</WithResult>,
    cupBadge: <CupBadge game={game} onClick={() => go('liga/pohary')} />,
    cupCard: <CupProgressCard game={game} onOpenMatch={setOpenMatch} onOpen={() => go('liga/pohary')} />,
    inboxExtra: offers.length ? [{ id: 'projekty', title: 'Vyberte strategické projekty sezóny', text: `${offers.length} v nabídce, vyberte 1–3`, icon: 'projekt', link: 'klub/projekty', linkLabel: 'Vybrat' }] : [],
    tips: {
      agenda: <GuideTip guide={guide} id="agenda" />,
      inbox: <GuideTip guide={guide} id="inbox" />,
      step: <GuideTip guide={guide} id="step" />,
    },
  };

  const subNav = (main: MainTab, tabs: SubTab<string>[]) => (
    <SubTabs tabs={tabs} value={(subs[main] ?? DEFAULT_SUB[main]) as string} label={`Části: ${MAIN_TABS.find((m) => m.id === main)?.label ?? ''}`} onChange={(v) => setSubs((s) => ({ ...s, [main]: v as SubTabId }))} />
  );

  const eventsCount = game.events.length;

  let content: ReactNode = null;
  if (tab === 'tyden') {
    content = <Week game={game} onChange={onChangeHome} onNavigate={(t) => go(t)} onOpenMatch={setOpenMatch} step={stepInfo} slots={slots} weekKey={weekKey} />;
  } else if (tab === 'tym') {
    const s = (subs.tym ?? 'kadr') as TymSub;
    content = (
      <>
        {subNav('tym', TYM_TABS)}
        {s === 'kadr' && <Squad game={game} onChange={managed} />}
        {s === 'slozeni' && <TeamShape game={game} onChange={managed} />}{/* W4 */}
        {s === 'trenink' && <WithResult game={game} onChange={managed}>{(apply) => <TrainingCard game={game} onResult={apply} />}</WithResult>}
        {s === 'vedeni' && (
          <div className="stack">
            <div className="grid two">
              <ToDo game={game} onNavigate={(t) => go(t)} />
              <WithResult game={game} onChange={managed}>{(apply) => <RoutineCard game={game} onResult={apply} />}</WithResult>
            </div>
            <People game={game} onChange={managed} />
          </div>
        )}
        {s === 'postavy' && <Contacts game={game} onMeet={meet} meetLabel="Domluvit osobní schůzku" meetNote={meeting.note} meetDisabled={!meeting.free} />}
      </>
    );
  } else if (tab === 'trh') {
    const s = (subs.trh ?? 'prestupy') as TrhSub;
    content = (
      <>
        {subNav('trh', TRH_TABS)}
        {s === 'prestupy' && <Transfers game={game} onChange={managed} omit={['agenti', 'zahranici']} />}
        {s === 'lov' && <WithResult game={game} onChange={managed}>{(apply) => <HuntCard game={game} onResult={apply} />}</WithResult>}
        {s === 'agenti' && <AgentsCard game={game} />}
        {s === 'zahranici' && <WithResult game={game} onChange={managed}>{(apply) => <ForeignMarket game={game} onChange={managed} onResult={apply} />}</WithResult>}
      </>
    );
  } else if (tab === 'klub') {
    const s = (subs.klub ?? 'stadion') as KlubSub;
    content = (
      <>
        {subNav('klub', KLUB_TABS)}
        {s === 'stadion' && <Stadium game={game} onChange={managed} />}
        {s === 'fanousci' && (
          <WithResult game={game} onChange={managed}>
            {(apply) => (
              <div className="grid two">
                <FansCard game={game} onChange={managed} />
                <UltrasCard game={game} />
                <CityCard game={game} onResult={apply} />
                <PulsePanel game={game} />
              </div>
            )}
          </WithResult>
        )}
        {s === 'forum' && (forumThreads(game).length ? <ForumCard game={game} onChange={managed} /> : <section className="card"><h2>Fórum fanoušků</h2><p className="muted">Fanoušci zatím nemají o čem diskutovat. Vlákna vznikají z výsledků, sestav a tabulky – po prvních zápasech se tu objeví.</p></section>)}
        {s === 'site' && (
          <WithResult game={game} onChange={managed}>
            {(apply) => (
              <div className="stack">
                <SocialCard game={game} onResult={apply} />
                <PressMemoryCard game={game} />
              </div>
            )}
          </WithResult>
        )}
        {s === 'majitel' && (
          <div className="stack">
            <div className="grid two">
              <OwnerLevelCard game={game} />
              <OwnerSummary game={game} />
            </div>
            <WithResult game={game} onChange={managed}>{(apply) => <OwnerDecisionsCard game={game} onResult={apply} />}</WithResult>
            <Owner game={game} onChange={update} hide={['social', 'press', 'ultras', 'city']} />
          </div>
        )}
        {s === 'projekty' && (
          <div className="grid two">
            <WithResult game={game} onChange={managed}>{(apply) => <ProjectsCard game={game} onResult={apply} />}</WithResult>
            <ScenarioCard game={game} />
            <SideGoalsCard game={game} onChange={managed} />
            <ChallengesCard game={game} />
          </div>
        )}
        {s === 'odznaky' && <div className="grid two"><AchievementsCard game={game} /></div>}
      </>
    );
  } else if (tab === 'penize') {
    content = <Finance key={financeTab.n} game={game} onChange={managed} initialTab={financeTab.tab} />;
  } else if (tab === 'liga') {
    const s = (subs.liga ?? 'tabulky') as LigaSub;
    content = (
      <>
        {subNav('liga', LIGA_TABS)}
        {s === 'tabulky' && (
          <div className="stack">
            <PositionChart game={game} />
            <Tables game={game} />
          </div>
        )}
        {s === 'zapasy' && <Matches game={game} onOpenMatch={setOpenMatch} />}
        {s === 'pohary' && (
          <div className="stack">
            <CupProgressCard game={game} onOpenMatch={setOpenMatch} />
            <DrawPreview game={game} />
            <CupBracket game={game} onOpenMatch={setOpenMatch} />
            <EuropeLeagueTable game={game} onOpenMatch={setOpenMatch} />
            <EuropeSection game={game} onOpenMatch={setOpenMatch} />
            <EuropeStarsCard game={game} onOpenMatch={setOpenMatch} />
          </div>
        )}
        {s === 'historie' && (
          <div className="stack">
            <ClubHistoryCard game={game} />
            <CupHistory game={game} />
            {(game.seasonReports?.length ?? 0) > 0 && <SeasonCard game={game} season={game.seasonReports![0].season} />}
          </div>
        )}
      </>
    );
  } else if (tab === 'hra') {
    content = (
      <div className="stack">
        <AppearanceCard game={game} theme={theme} onTheme={(t) => { saveThemePref(t); setTheme(t); }} onGuide={() => setGuideTick((n) => n + 1)} />
        <GameMenu game={game} onLoad={(g) => { resetView(); update(g); }} onNewGame={startOver} />
      </div>
    );
  }

  const selectMain = (id: MainTab) => {
    if (id === 'penize') setFinanceTab({ tab: 'prehled', n: financeTab.n + 1 });
    setTab(id);
  };

  return (
    <NavContext.Provider value={nav}>
    <div className={`app tab-${tab}`}>
      <div className="sticky-head" ref={headRef}>
        <header className="topbar">
          <div className="topbar-club">
            <button className="crest-btn" aria-label="Domů: Týden" onClick={() => setTab('tyden')}>
              <Crest colors={club.colors} name={club.name} size={36} />
            </button>
            <div className="topbar-text">
              <div className="topbar-name">{club.name}</div>
              <div className="topbar-sub">
                {formatDate(game.date, true)}<span className="hide-mobile"> · {comp?.name ?? 'mimo soutěž'} {seasonLabel(game.season)}</span>
              </div>
              <div className={`phase-chip phase-${phase.tone}`}>
                <strong>{phase.label}</strong> <span className="hide-mobile">{phase.detail}</span>
                {nm && nmDays <= 21 && <span className="next-milestone hide-mobile"> · do {nm.short} {nmDays} {nmDays === 1 ? 'den' : nmDays < 5 ? 'dny' : 'dní'}</span>}
                {eventsCount > 0 && (
                  <button className="linkbtn events-link" onClick={() => setTab('tyden')}>
                    · rozhodnutí: {eventsCount}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="topbar-right">
            <span className="topbar-cup hide-mobile"><CupBadge game={game} onClick={() => go('liga/pohary')} /></span>
            <div className={`topbar-balance ${club.finance.balance < 0 ? 'neg' : ''}`}>
              <span>Klub</span>
              <strong className="num">{money(club.finance.balance)}</strong>
            </div>
            <div className="advance">
              <button className={match || euro ? 'primary match-btn' : 'primary'} disabled={!!game.gameOver} title={stepTitle} onClick={onStep}>
                {stepLabel} ›
              </button>
            </div>
            <button className={`icon-btn game-btn${tab === 'hra' ? ' active' : ''}`} aria-label="Hra: menu, nastavení, záloha" title="Hra: menu, nastavení, záloha" onClick={() => setTab('hra')}>
              <Icon name="hra" size={22} />
            </button>
          </div>
        </header>

        <CalendarStrip game={game} />
        <nav className="tabs main-tabs" aria-label="Hlavní záložky">
          {MAIN_TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => selectMain(t.id)}>
              <Icon name={t.icon} size={18} /> {t.label}
              {t.id === 'tyden' && eventsCount > 0 && <span className="tab-count">{eventsCount}</span>}
              {t.id === 'klub' && blocked && <span className="tab-dot" aria-label="odvolán" />}
            </button>
          ))}
          <button className={`tab-hra${tab === 'hra' ? ' active' : ''}`} onClick={() => setTab('hra')}>
            <Icon name="hra" size={18} /> Hra
          </button>
        </nav>
      </div>

      <main>
        {blocked && !(tab === 'klub' && subs.klub === 'majitel') && (
          <p className="warning banner">
            {blocked} <button className="linkbtn" onClick={() => go('klub/majitel')}>Cesty zpět ›</button>
          </p>
        )}
        {content}
      </main>

      {/* B3: mobilní spodní lišta a palcem dosažitelný posun hry */}
      <nav className="bottom-bar" aria-label="Hlavní záložky (mobil)">
        {MAIN_TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => selectMain(t.id)}>
            <Icon name={t.icon} size={22} />
            <span>{t.label}</span>
            {t.id === 'tyden' && eventsCount > 0 && <span className="bb-badge">{eventsCount}</span>}
          </button>
        ))}
      </nav>
      {!live && !matchOpen && (
        <button className={`step-fab primary${match || euro ? ' match-btn' : ''}`} disabled={!!game.gameOver} title={stepTitle} aria-label={stepTitle} onClick={onStep}>
          <Icon name={match || euro ? 'play' : 'next'} size={20} /> <span>{stepLabel}</span>
        </button>
      )}

      <AchievementToast game={game} />
      {playedId && !live && !matchOpen && modals.length === 0 && !game.gameOver && <MatchResultToast game={game} fixtureId={playedId} onOpen={() => { setModals([{ type: 'match', id: playedId }]); setPlayedId(null); }} onClose={() => setPlayedId(null)} />}
      {!live && !matchOpen && modals.length === 0 && !milestone && !report && !game.gameOver && <PostMatch game={game} onChange={update} />}{/* W2: krok po zápase */}
      {weekEnd && !live && !matchOpen && !milestone && !report && <WeekEndCard data={weekEnd} onClose={() => setWeekEnd(null)} />}
      {stopReason && !milestone && (
        <div className="toast stop-toast" role="status">
          <strong>Zastaveno:</strong> {stopReason} <button className="linkbtn" onClick={() => setStopReason(null)}>Zavřít</button>
        </div>
      )}

      {notice && ((tab === 'trh') || blocked) && (
        <div className="toast" role="status">
          {notice} <button className="linkbtn" onClick={() => setNotice(null)}>Zavřít</button>
        </div>
      )}

      {modals.length > 0 && (() => {
        const top = modals[modals.length - 1];
        const close = () => setModals([]);
        const back = modals.length > 1 ? () => setModals(modals.slice(0, -1)) : undefined;
        if (top.type === 'match') return <MatchDetail game={game} fixtureId={top.id} onClose={close} onBack={back} />;
        return (
          <Sheet label={top.type === 'player' ? 'Karta hráče' : 'Karta klubu'} onClose={close} onBack={back}>
            {top.type === 'player' ? <PlayerCard game={game} playerId={top.id} /> : <ClubCard game={game} clubId={top.id} />}
          </Sheet>
        );
      })()}

      {live && liveEuro && !game.gameOver && (
        <MatchdayStage game={game} kind="evropa">
          <EuroLive
            game={game}
            onChange={(g) => { update(g); setStopReason(bigMatchWeekStarted(g, game.bigMatch?.id) ?? null); }}
            onClose={() => { setLive(false); setLiveEuro(false); }}
            onSummary={(id) => {
              setLive(false);
              setLiveEuro(false);
              setModals([{ type: 'match', id }]);
            }}
          />
        </MatchdayStage>
      )}

      {matchOpen && euro && !live && !game.gameOver && (
        <EuroMatchDialog
          game={game}
          onChange={managed}
          onClose={() => setMatchOpen(false)}
          onResult={() => {
            setMatchOpen(false);
            const r = advanceDays(game, 1);
            advance(r.state, bigMatchWeekStarted(r.state, game.bigMatch?.id));
            if (!r.state.gameOver) setModals([{ type: 'match', id: euro.id }]);
          }}
          onLive={() => {
            setMatchOpen(false);
            setLiveEuro(true);
            setLive(true);
          }}
        />
      )}

      {live && !liveEuro && !game.gameOver && (
        <MatchdayStage game={game}>
          <LiveMatch
            game={game}
            onChange={update}
            onClose={() => setLive(false)}
            onSummary={(id) => {
              setLive(false);
              setModals([{ type: 'match', id }]);
            }}
          />
        </MatchdayStage>
      )}

      {matchOpen && match && !live && !game.gameOver && (
        <MatchDialog
          game={game}
          onChange={managed}
          onClose={() => setMatchOpen(false)}
          onResult={() => {
            setMatchOpen(false);
            const r = advanceDays(game, 1, true);
            advance(r.state, bigMatchWeekStarted(r.state, game.bigMatch?.id)); // W1: začal týden dalšího velkého zápasu
            if (r.fixtureId && !r.state.gameOver) setModals([{ type: 'match', id: r.fixtureId }]);
          }}
          onLive={() => {
            setMatchOpen(false);
            setLive(true);
          }}
        />
      )}

      {!live && !game.gameOver && modals.length === 0 && report && (
        <SeasonReportView report={report} onClose={closeReport}>
          <SeasonCard game={game} season={report.season} compact />
          {game.scenario?.result && !game.scenario.result.seen && (
            <>
              <h3>Scénář: {scenarioDef(game.scenario.id).title} <span className="scenario-stars">{'★'.repeat(game.scenario.result.stars)}{'☆'.repeat(3 - game.scenario.result.stars)}</span></h3>
              <p className="small">{game.scenario.result.text} Hra pokračuje jako volná hra se stejným klubem.</p>
            </>
          )}
          {milestone && (
            <>
              <h3>{milestone.title}</h3>
              {milestone.text.map((x, i) => <p key={i} className="small">{x}</p>)}
              {milestone.todo.length > 0 && (
                <div className="milestone-todo">
                  {milestone.todo.map((x) => (
                    <button key={x.label} onClick={() => { legacyGo(x.tab, x.sub); closeReport(); }}>{x.label} ›</button>
                  ))}
                </div>
              )}
            </>
          )}
        </SeasonReportView>
      )}

      {!live && !milestone && !game.gameOver && !report && game.scenario?.result && !game.scenario.result.seen && (
        <div className="overlay">
          <div className="card dialog" role="dialog" aria-modal="true" aria-label="Výsledek scénáře">
            <h2>Scénář: {scenarioDef(game.scenario.id).title}</h2>
            <p className="scenario-stars">{'★'.repeat(game.scenario.result.stars)}{'☆'.repeat(3 - game.scenario.result.stars)}</p>
            <p>{game.scenario.result.text}</p>
            <p className="muted small">Hra pokračuje jako volná hra se stejným klubem.</p>
            <button className="primary" onClick={() => update(markScenarioSeen(game))}>Pokračovat</button>
          </div>
        </div>
      )}

      {milestone && !report && !game.gameOver && (
        <div className="overlay" onClick={() => setMilestone(null)}>
          <div className="card dialog milestone-dialog" role="dialog" aria-modal="true" aria-label={milestone.title} onClick={(e) => e.stopPropagation()}>
            <span className="muted small">{formatDate(game.date, true)}</span>
            <h2>{milestone.title}</h2>
            {milestone.text.map((t, i) => <p key={i}>{t}</p>)}
            {milestone.todo.length > 0 && (
              <>
                <h3>Co teď udělat</h3>
                <div className="milestone-todo">
                  {milestone.todo.map((t) => (
                    <button key={t.label} onClick={() => { legacyGo(t.tab, t.sub); setMilestone(null); }}>{t.label} ›</button>
                  ))}
                </div>
              </>
            )}
            <button className="primary" autoFocus onClick={() => setMilestone(null)}>Rozumím, pokračovat</button>
          </div>
        </div>
      )}

      {game.gameOver && (
        <div className="overlay">
          <div className="card dialog">
            <h2>{game.gameOver.kind === 'prodej' ? 'Klub prodán' : 'Konec hry'}</h2>
            <p>{game.gameOver.reason}</p>
            <p className="muted">{formatDate(game.gameOver.date)}</p>
            <div className="buttons">
              <button className="primary" onClick={() => { saveCareer(careerFrom(game, game.career)); void startOver(); }}>Pokračovat v kariéře: koupit jiný klub</button>
              <button onClick={() => { saveCareer(null); void startOver(); }}>Nová hra od začátku</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </NavContext.Provider>
  );
}
