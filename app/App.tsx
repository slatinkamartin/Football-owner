import { useEffect, useState } from 'react';
import { advanceToNextMatch, advanceWeek, competitionOf, formatDate, seasonLabel, startNegotiation, type GameState } from '../engine';
import { money } from './format';
import { deleteGame, loadGame, saveGame } from './storage';
import { Finance } from './screens/Finance';
import { GameMenu } from './screens/GameMenu';
import { MatchDetail } from './screens/MatchDetail';
import { ClubCard } from './screens/ClubCard';
import { PlayerCard } from './screens/PlayerCard';
import { NavContext, Sheet, type ModalRef } from './nav';
import { Matches } from './screens/Matches';
import { NewGame } from './screens/NewGame';
import { Overview } from './screens/Overview';
import { People } from './screens/People';
import { Squad } from './screens/Squad';
import { Transfers } from './screens/Transfers';
import { Tables } from './screens/Tables';

type Tab = 'prehled' | 'tabulky' | 'zapasy' | 'kadr' | 'prestupy' | 'vedeni' | 'finance' | 'hra';

const TABS: { id: Tab; label: string }[] = [
  { id: 'prehled', label: 'Přehled' },
  { id: 'tabulky', label: 'Tabulky' },
  { id: 'zapasy', label: 'Zápasy' },
  { id: 'kadr', label: 'Kádr' },
  { id: 'prestupy', label: 'Přestupy' },
  { id: 'vedeni', label: 'Vedení' },
  { id: 'finance', label: 'Finance' },
  { id: 'hra', label: 'Hra' },
];

export function App() {
  const [game, setGame] = useState<GameState | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('prehled');

  const [outdated, setOutdated] = useState(false);
  const [modals, setModals] = useState<ModalRef[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
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
            </div>
          </div>
          <div className="topbar-right">
            <div className={`topbar-balance ${club.finance.balance < 0 ? 'neg' : ''}`}>
              <span>Klub</span>
              <strong>{money(club.finance.balance)}</strong>
            </div>
            <div className="advance">
              <button disabled={!!game.gameOver} onClick={() => update(advanceWeek(game))}>
                Týden ›
              </button>
              <button
                className="primary"
                disabled={!!game.gameOver}
                title="Hrát do příštího zápasu vašeho klubu a ukázat jeho souhrn"
                onClick={() => {
                  const r = advanceToNextMatch(game);
                  update(r.state);
                  if (r.fixtureId && !r.state.gameOver) setModals([{ type: 'match', id: r.fixtureId }]);
                }}
              >
                Do zápasu ›
              </button>
            </div>
          </div>
        </header>

        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <main>
        {tab === 'prehled' && <Overview game={game} onNavigate={(t) => setTab(t)} onOpenMatch={setOpenMatch} />}
        {tab === 'tabulky' && <Tables game={game} />}
        {tab === 'zapasy' && <Matches game={game} onOpenMatch={setOpenMatch} />}
        {tab === 'kadr' && <Squad game={game} onChange={update} />}
        {tab === 'prestupy' && <Transfers game={game} onChange={update} />}
        {tab === 'vedeni' && <People game={game} onChange={update} />}
        {tab === 'finance' && <Finance game={game} onChange={update} />}
        {tab === 'hra' && <GameMenu game={game} onLoad={update} onNewGame={startOver} />}
      </main>

      {notice && tab === 'prestupy' && (
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

      {game.gameOver && (
        <div className="overlay">
          <div className="card dialog">
            <h2>Konec hry</h2>
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
