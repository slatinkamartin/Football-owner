import { useRef, useState } from 'react';
import { DIFFICULTY, formatDate, type GameState } from '../../engine';
import { exportGame, importGame } from '../storage';

export function GameMenu({
  game,
  onLoad,
  onNewGame,
}: {
  game: GameState;
  onLoad: (g: GameState) => void;
  onNewGame: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid two">
      <section className="card">
        <h2>Uložená hra</h2>
        <dl className="kv">
          <dt>Majitel</dt><dd>{game.owner.name}</dd>
          <dt>Startovní podmínky</dt><dd>{DIFFICULTY[game.owner.difficulty].label}</dd>
          <dt>Datum ve hře</dt><dd>{formatDate(game.date)}</dd>
        </dl>
        <p className="muted small">Hra se ukládá automaticky po každém tahu do tohoto prohlížeče.</p>
        <div className="buttons">
          <button onClick={() => exportGame(game)}>Stáhnout zálohu</button>
          <button onClick={() => fileInput.current?.click()}>Nahrát zálohu</button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                onLoad(await importGame(file));
                setError(null);
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Soubor se nepodařilo načíst.');
              }
              e.target.value = '';
            }}
          />
        </div>
        {error && <p className="warning">{error}</p>}
      </section>

      <section className="card">
        <h2>Nová hra</h2>
        <p className="muted">Současná hra se smaže. Pokud o ni nechcete přijít, nejdřív si stáhněte zálohu.</p>
        <button
          className="danger"
          onClick={() => {
            if (confirm('Opravdu začít novou hru? Současná hra se smaže.')) onNewGame();
          }}
        >
          Začít novou hru
        </button>
      </section>
    </div>
  );
}
