import { useState } from 'react';
import { DIFFICULTY, formatDate, type GameState } from '../../engine';
import { parseGame, serializeGame } from '../storage';

export function GameMenu({
  game,
  onLoad,
  onNewGame,
}: {
  game: GameState;
  onLoad: (g: GameState) => void;
  onNewGame: () => void;
}) {
  const [backupText, setBackupText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const copyBackup = () => {
    const text = serializeGame(game);
    setCopied(false);
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setBackupText(null);
      })
      .catch(() => setBackupText(text));
  };

  const load = (text: string) => {
    try {
      onLoad(parseGame(text));
      setError(null);
      setImportText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zálohu se nepodařilo načíst.');
    }
  };

  return (
    <div className="grid two">
      <section className="card">
        <h2>Uložená hra</h2>
        <dl className="kv">
          <dt>Majitel</dt><dd>{game.owner.name}</dd>
          <dt>Startovní podmínky</dt><dd>{DIFFICULTY[game.owner.difficulty].label}</dd>
          <dt>Datum ve hře</dt><dd>{formatDate(game.date)}</dd>
        </dl>
        <p className="muted small">
          Hra se ukládá automaticky po každém tahu do tohoto prohlížeče. Pro přenos na jiné zařízení si zkopírujte zálohu.
        </p>
        <div className="buttons">
          <button id="copy-backup" onClick={copyBackup}>Zkopírovat zálohu</button>
        </div>
        {copied && <p className="ok">Záloha je ve schránce. Uložte si ji třeba do poznámek.</p>}
        {backupText && (
          <>
            <p className="muted small">Schránka není dostupná. Označte text níže a zkopírujte ho ručně.</p>
            <textarea id="backup-text" readOnly value={backupText} rows={4} onFocus={(e) => e.target.select()} />
          </>
        )}

        <h3>Obnovit ze zálohy</h3>
        <textarea
          id="import-text"
          rows={3}
          placeholder="Sem vložte zkopírovanou zálohu"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
        <div className="buttons">
          <button id="import-backup" disabled={!importText.trim()} onClick={() => load(importText)}>
            Obnovit hru
          </button>
          <label className="button-like">
            Nahrát ze souboru
            <input
              id="import-file"
              type="file"
              accept="application/json,.json,.txt"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) load(await file.text());
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {error && <p className="warning">{error}</p>}
      </section>

      <section className="card">
        <h2>Nová hra</h2>
        <p className="muted">Současná hra se smaže. Pokud o ni nechcete přijít, nejdřív si zkopírujte zálohu.</p>
        {confirming ? (
          <div className="confirm">
            <strong>Opravdu smazat současnou hru?</strong>
            <div className="buttons">
              <button className="danger" onClick={onNewGame}>Ano, začít znovu</button>
              <button onClick={() => setConfirming(false)}>Zrušit</button>
            </div>
          </div>
        ) : (
          <button className="danger" onClick={() => setConfirming(true)}>Začít novou hru</button>
        )}
      </section>
    </div>
  );
}
