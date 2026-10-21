import { useEffect, useRef, useState } from 'react';
import { careerFrom, clubLabel, markReportSeen, markScenarioSeen, scenarioDef, toggleWatch, advanceDays, advanceStep, nextStep, ownMatchTomorrow, settingsOf, pulseAfterAction, competitionOf, currentPhase, daysUntil, formatDate, milestoneToday, nextMilestone, ownerBlocked, seasonLabel, startNegotiation, type GameState, type Milestone } from '../engine';
import { money } from './format';
import { deleteGame, loadGame, saveCareer, saveGame } from './storage';
import { SeasonReportView } from './screens/Report';
import { Finance, type FinanceTab } from './screens/Finance';
import { GameMenu } from './screens/GameMenu';
import { AchievementToast } from './screens/Achievements'; // W3
import { PostMatch } from './screens/PostMatch'; // W2
import { MatchDetail } from './screens/MatchDetail';
import { ClubCard } from './screens/ClubCard';
import { PlayerCard } from './screens/PlayerCard';
import { NavContext, Sheet, type ModalRef } from './nav';
import { Matches } from './screens/Matches';
import { NewGame } from './screens/NewGame';
import { Overview } from './screens/Overview';
import { LiveMatch, MatchDialog } from './screens/MatchPrep';
import { EuroLive, EuroMatchDialog } from './screens/BigMatch'; // W1
import { bigMatchWeekStarted, euroMatchTomorrow } from '../engine'; // W1
import { Owner } from './screens/Owner';
import { CalendarStrip } from './SeasonCalendar';
import { People } from './screens/People';
import { Squad } from './screens/Squad';
import { Stadium } from './screens/Stadium';
import { Transfers } from './screens/Transfers';
import { Tables } from './screens/Tables';

type Tab = 'prehled' | 'tabulky' | 'zapasy' | 'kadr' | 'prestupy' | 'vedeni' | 'majitel' | 'stadion' | 'finance' | 'hra';

const TABS: { id: Tab; label: string }[] = [
  { id: 'prehled', label: 'Přehled' },
  { id: 'tabulky', label: 'Tabulky' },
  { id: 'zapasy', label: 'Zápasy' },
  { id: 'kadr', label: 'Kádr' },
  { id: 'prestupy', label: 'Přestupy' },
  { id: 'vedeni', label: 'Vedení' },
  { id: 'majitel', label: 'Majitel' },
  { id: 'stadion', label: 'Stadion' },
  { id: 'finance', label: 'Finance' },
  { id: 'hra', label: 'Hra' },
];

export function App() {
  const [game, setGame] = useState<GameState | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('prehled');

  const [outdated, setOutdated] = useState(false);
  const [modals, setModals] = useState<ModalRef[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [milestone, setMilestone] = useState<Milestone | null>(null);
  const [financeTab, setFinanceTab] = useState<{ tab: FinanceTab; n: number }>({ tab: 'prehled', n: 0 });
  const [stopReason, setStopReason] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [liveEuro, setLiveEuro] = useState(false); // W1: evropský přenos
  const openModal = (m: ModalRef) => setModals((stack) => [...stack.filter((x) => !(x.type === m.type && x.id === m.id)), m]);
  const setOpenMatch = (id: string | null) => (id ? openModal({ type: 'match', id }) : setModals([]));

  useEffect(() => {
    loadGame().then(({ game: saved, outdated: old }) => {
      setOutdated(old);
      setGame(saved);
    });
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [tab, game === null]);

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

  // Při nové nebo nahrané hře zavřít všechna okna, ať se nic nepřenese do jiné hry.
  const resetView = () => {
    setLive(false);
    setLiveEuro(false);
    setMatchOpen(false);
    setModals([]);
    setMilestone(null);
    setStopReason(null);
    setNotice(null);
  };

  const startOver = async () => {
    await deleteGame();
    resetView();
    setTab('prehled');
    setGame(null);
  };

  const nav = {
    open: openModal,
    watch: (playerId: string) => {
      if (game) update(toggleWatch(game, playerId).state);
    },
    negotiate: (playerId: string) => {
      if (!game) return;
      const r = startNegotiation(game, playerId);
      if (r.state !== game) update(r.state);
      setNotice(r.ok ? null : r.message);
      setModals([]);
      setTab('prestupy');
    },
  };

  if (game === undefined) return <div className="loading">Načítám…</div>;
  if (game === null) return <NewGame outdatedSave={outdated} onStart={(g) => { setTab('prehled'); update(g); }} />;

  const club = game.clubs[game.owner.clubId];
  const comp = competitionOf(game, club.id);
  const phase = currentPhase(game);
  const nm = nextMilestone(game);
  const nmDays = nm ? daysUntil(game, nm.date) : 99;
  const match = ownMatchTomorrow(game);
  // W1: evropský zápas klubu majitele zítra (když se nehraje i domácí zápas).
  const euro = match ? undefined : euroMatchTomorrow(game);
  const step = nextStep(game);
  const showMilestones = settingsOf(game).stops.milestone;
  const advance = (next: GameState, reason?: string) => {
    setStopReason(reason ?? null);
    update(next);
    const m = milestoneToday(next);
    if (showMilestones && m && next.date !== game.date && !next.gameOver) setMilestone(m);
  };
  // Jedno tlačítko: v předvečer zápasu otevře zápas, jinak posune hru k dalšímu zápasu, milníku nebo o týden.
  const onStep = () => {
    if (match || euro) {
      setMatchOpen(true);
      return;
    }
    const r = advanceStep(game);
    advance(r.state, r.reason);
  };
  const stepLabel = match ? 'Zápas ›' : euro ? 'Evropský zápas ›' : `${step.label} ›`;
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

  return (
    <NavContext.Provider value={nav}>
    <div className="app">
      <div className="sticky-head" ref={headRef}>
        <header className="topbar">
          <div className="topbar-club">
            <span className="crest" style={{ background: club.colors[0], borderColor: club.colors[1] }} />
            <div>
              <div className="topbar-name">{club.name}</div>
              <div className="topbar-sub">
                {formatDate(game.date, true)} · {comp?.name ?? 'mimo soutěž'} {seasonLabel(game.season)}
              </div>
              <div className={`phase-chip phase-${phase.tone}`}>
                <strong>{phase.label}</strong> {phase.detail}
                {nm && nmDays <= 21 && <span className="next-milestone"> · do {nm.short} {nmDays} {nmDays === 1 ? 'den' : nmDays < 5 ? 'dny' : 'dní'}</span>}
                {game.events.length > 0 && (
                  <button className="linkbtn events-link" onClick={() => setTab('prehled')}>
                    · rozhodnutí: {game.events.length}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="topbar-right">
            <div className={`topbar-balance ${club.finance.balance < 0 ? 'neg' : ''}`}>
              <span>Klub</span>
              <strong>{money(club.finance.balance)}</strong>
            </div>
            <div className="advance">
              <button className={match || euro ? 'primary match-btn' : 'primary'} disabled={!!game.gameOver} title={stepTitle} onClick={onStep}>
                {stepLabel}
              </button>
            </div>
          </div>
        </header>

        <CalendarStrip game={game} />
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => { if (t.id === 'finance') setFinanceTab({ tab: 'prehled', n: financeTab.n }); setTab(t.id); }}>
              {t.label}
              {t.id === 'majitel' && blocked && <span className="tab-dot" aria-label="odvolán" />}
            </button>
          ))}
        </nav>
      </div>

      <main>
        {blocked && tab !== 'majitel' && (
          <p className="warning banner">
            {blocked} <button className="linkbtn" onClick={() => setTab('majitel')}>Cesty zpět ›</button>
          </p>
        )}
        {tab === 'prehled' && (
          <Overview
            game={game}
            onChange={(next) => update(pulseAfterAction(game, next))}
            onNavigate={(t, sub) => {
              if (t === 'finance') setFinanceTab({ tab: sub ?? 'prehled', n: financeTab.n + 1 });
              setTab(t);
            }}
            onOpenMatch={setOpenMatch}
            onLive={() => setLive(true)}
          />
        )}
        {tab === 'tabulky' && <Tables game={game} />}
        {tab === 'zapasy' && <Matches game={game} onOpenMatch={setOpenMatch} />}
        {tab === 'kadr' && <Squad game={game} onChange={managed} />}
        {tab === 'prestupy' && <Transfers game={game} onChange={managed} />}
        {tab === 'vedeni' && <People game={game} onChange={managed} />}
        {tab === 'majitel' && <Owner game={game} onChange={update} />}
        {tab === 'stadion' && <Stadium game={game} onChange={managed} />}
        {tab === 'finance' && <Finance key={financeTab.n} game={game} onChange={managed} initialTab={financeTab.tab} />}
        {tab === 'hra' && <GameMenu game={game} onLoad={(g) => { resetView(); update(g); }} onNewGame={startOver} />}
      </main>

      <AchievementToast game={game} />
      {!live && !matchOpen && modals.length === 0 && !milestone && !report && !game.gameOver && <PostMatch game={game} onChange={update} />}{/* W2: krok po zápase */}
      {stopReason && !milestone && (
        <div className="toast stop-toast" role="status">
          <strong>Zastaveno:</strong> {stopReason} <button className="linkbtn" onClick={() => setStopReason(null)}>Zavřít</button>
        </div>
      )}

      {notice && (tab === 'prestupy' || blocked) && (
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
      )}

      {matchOpen && euro && !live && !game.gameOver && (
        <EuroMatchDialog
          game={game}
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
        <LiveMatch
          game={game}
          onChange={update}
          onClose={() => setLive(false)}
          onSummary={(id) => {
            setLive(false);
            setModals([{ type: 'match', id }]);
          }}
        />
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
                    <button key={x.label} onClick={() => { if (x.sub) setFinanceTab({ tab: x.sub, n: financeTab.n + 1 }); setTab(x.tab); closeReport(); }}>{x.label} ›</button>
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
                    <button key={t.label} onClick={() => { if (t.sub) setFinanceTab({ tab: t.sub, n: financeTab.n + 1 }); setTab(t.tab); setMilestone(null); }}>{t.label} ›</button>
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
