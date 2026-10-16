import { useState } from 'react';
import { DIFFICULTY, formatDate, settingsOf, updateSettings, type GameSettings, type GameState } from '../../engine';
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
      <GameSettingsCard game={game} onChange={onLoad} />
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

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string; hint: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="segmented">
        {options.map((o) => (
          <button key={o.id} className={value === o.id ? 'active' : ''} title={o.hint} onClick={() => onChange(o.id)}>{o.label}</button>
        ))}
      </div>
      <span className="muted small">{options.find((o) => o.id === value)?.hint}</span>
    </div>
  );
}

/** Nastavení hry: tempo dramat, přísnost svazu, náhoda a kdy se má zastavit „hrát do…“. */
function GameSettingsCard({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const s = settingsOf(game);
  const set = (patch: Partial<GameSettings>) => onChange(updateSettings(game, patch).state);
  const stop = (patch: Partial<GameSettings['stops']>) => set({ stops: { ...s.stops, ...patch } });
  return (
    <section className="card">
      <h2>Nastavení hry</h2>
      <Seg label="Kolik se toho děje" value={s.drama} onChange={(drama) => set({ drama })} options={[
        { id: 'klid', label: 'Klid', hint: 'Méně situací k rozhodnutí a nejvýš jeden příběh najednou.' },
        { id: 'bezne', label: 'Běžně', hint: 'Situace zhruba jednou za dva týdny, nejvýš dva příběhy najednou.' },
        { id: 'drama', label: 'Drama', hint: 'Víc situací i příběhů, až tři najednou.' },
      ]} />
      <Seg label="Přísnost svazu" value={s.strictness} onChange={(strictness) => set({ strictness })} options={[
        { id: 'mirna', label: 'Mírná', hint: 'Pokuty o 40 % nižší.' },
        { id: 'bezna', label: 'Běžná', hint: 'Pokuty podle velikosti klubu a vztahu se svazem.' },
        { id: 'prisna', label: 'Přísná', hint: 'Pokuty o 40 % vyšší.' },
      ]} />
      <Seg label="Náhoda v zápasech" value={s.randomness} onChange={(randomness) => set({ randomness })} options={[
        { id: 'nizka', label: 'Malá', hint: 'Silnější tým vyhrává častěji, méně překvapení.' },
        { id: 'bezna', label: 'Běžná', hint: 'Jako ve skutečné lize.' },
        { id: 'vysoka', label: 'Velká', hint: 'Víc překvapení, i slabší tým má šanci.' },
      ]} />
      <h3>„Hrát do…“ se zastaví při</h3>
      <label className="check"><input type="checkbox" checked={s.stops.decision} onChange={(e) => stop({ decision: e.target.checked })} /><span>nové situaci k rozhodnutí</span></label>
      <label className="check"><input type="checkbox" checked={s.stops.offer} onChange={(e) => stop({ offer: e.target.checked })} /><span>výhodné nabídce na hráče (ředitel doporučuje přijmout)</span>
        {s.stops.offer && (
          <select value={s.stops.offerMin} onChange={(e) => stop({ offerMin: Number(e.target.value) })} aria-label="Minimální nabídka">
            {[0, 5_000_000, 20_000_000, 50_000_000, 100_000_000].map((v) => <option key={v} value={v}>{v ? `od ${v / 1e6} mil. Kč` : 'jakékoli'}</option>)}
          </select>
        )}
      </label>
      <label className="check"><input type="checkbox" checked={s.stops.injury} onChange={(e) => stop({ injury: e.target.checked })} /><span>zranění opory na víc než dva týdny</span></label>
      <label className="check"><input type="checkbox" checked={s.stops.milestone} onChange={(e) => stop({ milestone: e.target.checked })} /><span>milníku sezóny (start ligy, konec okna, licence…)</span></label>
    </section>
  );
}
