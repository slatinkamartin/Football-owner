import { useEffect, useState } from 'react';
import { advanceWeek, competitionOf, formatDate, seasonLabel, type GameState } from '../engine';
import { money } from './format';
import { deleteGame, loadGame, saveGame } from './storage';
import { Finance } from './screens/Finance';
import { GameMenu } from './screens/GameMenu';
import { Matches } from './screens/Matches';
import { NewGame } from './screens/NewGame';
import { Overview } from './screens/Overview';
import { Squad } from './screens/Squad';
import { Tables } from './screens/Tables';

type Tab = 'prehled' | 'tabulky' | 'zapasy' | 'kadr' | 'finance' | 'hra';

const TABS: { id: Tab; label: string }[] = [
  { id: 'prehled', label: 'Přehled' },
  { id: 'tabulky', label: 'Tabulky' },
  { id: 'zapasy', label: 'Zápasy' },
  { id: 'kadr', label: 'Kádr' },
  { id: 'finance', label: 'Finance' },
  { id: 'hra', label: 'Hra' },
];

export function App() {
  const [game, setGame] = useState<GameState | null | undefined>(undefined);
  const [tab, setTab] = useState<Tab>('prehled');

  useEffect(() => {
    loadGame().then(setGame);
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

  if (game === undefined) return <div className="loading">Načítám…</div>;
  if (game === null) return <NewGame onStart={(g) => { setTab('prehled'); update(g); }} />;

  const club = game.clubs[game.owner.clubId];
  const comp = competitionOf(game, club.id);

  return (
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
            <button className="primary" disabled={!!game.gameOver} onClick={() => update(advanceWeek(game))}>
              Další týden ›
            </button>
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
        {tab === 'prehled' && <Overview game={game} />}
        {tab === 'tabulky' && <Tables game={game} />}
        {tab === 'zapasy' && <Matches game={game} />}
        {tab === 'kadr' && <Squad game={game} />}
        {tab === 'finance' && <Finance game={game} onChange={update} />}
        {tab === 'hra' && <GameMenu game={game} onLoad={update} onNewGame={startOver} />}
      </main>

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
  );
}
