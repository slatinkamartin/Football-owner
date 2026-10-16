import { useEffect, useState } from 'react';
import { clubLabel, dismissMatchPlan, pendingPrematch, advanceDays, advanceToNextMatch, advanceUntil, PLAY_TARGET_LABEL, pulseAfterAction, type PlayTarget, competitionOf, currentPhase, daysUntil, formatDate, milestoneToday, nextMilestone, ownerBlocked, seasonLabel, startNegotiation, type GameState, type Milestone } from '../engine';
import { money } from './format';
import { deleteGame, loadGame, saveGame } from './storage';
import { Finance, type FinanceTab } from './screens/Finance';
import { GameMenu } from './screens/GameMenu';
import { MatchDetail } from './screens/MatchDetail';
import { ClubCard } from './screens/ClubCard';
import { PlayerCard } from './screens/PlayerCard';
import { NavContext, Sheet, type ModalRef } from './nav';
import { Matches } from './screens/Matches';
import { NewGame } from './screens/NewGame';
import { Overview } from './screens/Overview';
import { LiveMatch, MatchPrep } from './screens/MatchPrep';
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

  const update = (next: GameState) => {
    setGame(next);
    void saveGame(next);
  };

  const startOver = async () => {
    await deleteGame();
    setTab('prehled');
    setGame(null);
  };

  const nav = {
    open: openModal,
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
  const step = nm && nmDays <= 7 ? { label: `Do ${nm.short} ›`, days: nmDays, milestone: nm } : { label: 'Týden ›', days: 7, milestone: undefined };
  const advance = (next: GameState) => {
    setStopReason(null);
    update(next);
    const m = milestoneToday(next);
    if (m && next.date !== game.date && !next.gameOver) setMilestone(m);
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
      <div className="sticky-head">
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
              <button
                className={step.milestone ? 'milestone-btn' : ''}
                disabled={!!game.gameOver}
                title={step.milestone ? step.milestone.title : 'Posunout o týden'}
                onClick={() => advance(advanceDays(game, step.days).state)}
              >
                {step.label}
              </button>
              <button
                className="primary"
                disabled={!!game.gameOver}
                title={nm && nmDays < 60 ? `Hrát do příštího zápasu, nejdál ale do milníku: ${nm.title}` : 'Hrát do příštího zápasu vašeho klubu a ukázat jeho souhrn'}
                onClick={() => {
                  const r = advanceToNextMatch(game, nm ? nmDays : 60);
                  advance(r.state);
                  if (r.fixtureId && !r.state.gameOver) setModals([{ type: 'match', id: r.fixtureId }]);
                }}
              >
                Do zápasu ›
              </button>
              <select
                className="play-until"
                aria-label="Hrát do…"
                value=""
                disabled={!!game.gameOver}
                onChange={(e) => {
                  const target = e.target.value as PlayTarget;
                  if (!target) return;
                  const r = advanceUntil(game, target);
                  advance(r.state);
                  setStopReason(r.reason ?? null);
                  if (target === 'zapas' && r.fixtureId && !r.reason && !r.state.gameOver) setModals([{ type: 'match', id: r.fixtureId }]);
                }}
              >
                <option value="">Hrát do…</option>
                {(Object.keys(PLAY_TARGET_LABEL) as PlayTarget[]).map((t) => <option key={t} value={t}>{PLAY_TARGET_LABEL[t]}</option>)}
              </select>
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
        {tab === 'hra' && <GameMenu game={game} onLoad={update} onNewGame={startOver} />}
      </main>

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

      {live && !game.gameOver && (
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

      {!live && !milestone && !game.gameOver && modals.length === 0 && (() => {
        const p = pendingPrematch(game);
        if (!p) return null;
        return (
          <div className="overlay">
            <div className="card dialog prematch-dialog" role="dialog" aria-modal="true" aria-label="Zápas se sázkou">
              <span className="muted small">{formatDate(p.fixture.date, true)} · {p.name}</span>
              <h2>{p.home ? 'Doma' : 'Venku'} s {clubLabel(game, p.opponentId)}: zápas, o který jde</h2>
              <MatchPrep game={game} onChange={managed} onLive={() => setLive(true)} compact />
              <button onClick={() => update(dismissMatchPlan(game, p.fixture.id))}>Hotovo, pokračovat</button>
            </div>
          </div>
        );
      })()}

      {milestone && !game.gameOver && (
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
            <button className="primary" onClick={startOver}>Nová hra</button>
          </div>
        </div>
      )}
    </div>
    </NavContext.Provider>
  );
}
