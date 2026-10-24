import { useState } from 'react';
import { DIFFICULTY, formatDate, scenarioDef, scenarioStatus, settingsOf, updateSettings, type GameSettings, type GameState, type SeasonReport } from '../../engine';
import { SeasonReportView } from './Report';
import { SeasonCard } from './SeasonCard'; // V3
import { AchievementsCard } from './Achievements'; // W3
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
  /** Záloha čekající na potvrzení obnovy (přepíše současnou hru). */
  const [pendingLoad, setPendingLoad] = useState<GameState | null>(null);

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

  const downloadBackup = async () => {
    const blob = new Blob([serializeGame(game)], { type: 'application/json' });
    const club = game.clubs[game.owner.clubId]?.shortName ?? 'hra';
    const filename = `majitel-${club}-${game.date}.json`.toLowerCase().replace(/[^a-z0-9.\-]+/g, '-');
    // V publikované stránce (claude.ai) se soubor ukládá přes prohlížeč stránky, jinak běžným odkazem.
    const host = (window as unknown as { claude?: { use?: (n: string) => Promise<{ save: (r: { filename: string; data: Blob }) => Promise<unknown> } | null> } }).claude;
    if (host?.use) {
      const downloads = await host.use('downloads').catch(() => null);
      if (downloads) {
        await downloads.save({ filename, data: blob }).catch(() => undefined);
        return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Načtení zálohy se nejdřív zkontroluje a pak potvrdí (současná hra se přepíše).
  const load = (text: string) => {
    try {
      setPendingLoad(parseGame(text));
      setError(null);
    } catch (err) {
      setPendingLoad(null);
      setError(err instanceof Error ? err.message : 'Zálohu se nepodařilo načíst.');
    }
  };
  const confirmLoad = () => {
    if (!pendingLoad) return;
    onLoad(pendingLoad);
    setPendingLoad(null);
    setImportText('');
  };

  return (
    <div className="grid two">
      <HowToPlayCard />
      <GameSettingsCard game={game} onChange={onLoad} />
      <ChapterCard game={game} />
      <AchievementsCard game={game} />
      <section className="card">
        <h2>Uložená hra</h2>
        <dl className="kv">
          <dt>Majitel</dt><dd>{game.owner.name}</dd>
          <dt>Startovní podmínky</dt><dd>{DIFFICULTY[game.owner.difficulty].label}</dd>
          <dt>Datum ve hře</dt><dd>{formatDate(game.date)}</dd>
        </dl>
        <p className="muted small">
          Hra se ukládá automaticky po každém tahu do tohoto prohlížeče. Pro přenos na jiné zařízení si stáhněte zálohu jako soubor (nebo ji zkopírujte jako text).
        </p>
        <div className="buttons">
          <button id="download-backup" className="primary" onClick={() => void downloadBackup()}>Stáhnout zálohu</button>
          <button id="copy-backup" onClick={copyBackup}>Zkopírovat jako text</button>
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
          onChange={(e) => { setImportText(e.target.value); setPendingLoad(null); }}
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
        {pendingLoad && (
          <div className="confirm">
            <strong>Obnovit hru ze zálohy?</strong>
            <span className="small">
              Záloha: {pendingLoad.owner.name}, {pendingLoad.clubs[pendingLoad.owner.clubId]?.name ?? 'klub'}, {formatDate(pendingLoad.date)}. Současná hra se přepíše.
            </span>
            <div className="buttons">
              <button className="primary" onClick={confirmLoad}>Ano, obnovit</button>
              <button onClick={() => setPendingLoad(null)}>Zrušit</button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Nová hra</h2>
        <p className="muted">Současná hra se smaže. Pokud o ni nechcete přijít, nejdřív si stáhněte zálohu.</p>
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

/** Nastavení hry: tempo dramat, přísnost svazu, náhoda a kdy se má zastavit posun hry. */
function GameSettingsCard({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const s = settingsOf(game);
  const set = (patch: Partial<GameSettings>) => onChange(updateSettings(game, patch).state);
  const stop = (patch: Partial<GameSettings['stops']>) => set({ stops: { ...s.stops, ...patch } });
  return (
    <section className="card settings-card">
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
      <h3>Tlačítko posunu se zastaví při</h3>
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
      {/* W3: okno před zápasem jen u klíčových zápasů, pokud hráč nechce jinak */}
      <label className="check"><input type="checkbox" checked={!!s.stops.everyMatch} onChange={(e) => stop({ everyMatch: e.target.checked })} /><span>před každým zápasem (jinak jen před klíčovými: derby, Evropa, čelo, záchrana, pohár od čtvrtfinále, baráž, rozhodující zápasy nadstavby; běžné zápasy odehraje trenér po svém)</span></label>
    </section>
  );
}

/** Krátký návod: jak se hra hraje. */
function HowToPlayCard() {
  return (
    <section className="card how-to">
      <h2>Jak hrát</h2>
      <ol className="small">
        <li><strong>Jste majitel, ne trenér.</strong> Sestavu a taktiku řeší trenér, hráče shání sportovní ředitel. Vy rozhodujete o penězích, lidech a směru klubu.</li>
        <li><strong>Posouvejte čas</strong> tlačítkem posunu (v horní liště, na mobilu vpravo dole): hra jde k dalšímu milníku, nebo o týden. Zastaví se, když je potřeba vaše rozhodnutí (nastavíte níže).</li>
        <li><strong>Týden</strong> ukáže, co je právě důležité: priority měsíce, schránku rozhodnutí, stav klubu, zprávy a nejbližší zápas.</li>
        <li><strong>Tým › Vedení</strong>: stanovte cíl sezóny, najměte a odvolávejte trenéra a ředitele.</li>
        <li><strong>Peníze</strong>: schvalte rozpočet, hlídejte výhled peněz a vyberte vedlejší cíle sezóny.</li>
        <li><strong>Klub › Stadion</strong>: stavby, velké investice a programy klubu zvedají příjmy i úroveň hráčů.</li>
      </ol>
      <p className="muted small">Klubu nesmějí dojít peníze: když hrozí, můžete vložit vlastní peníze nebo si půjčit. Na konci sezóny dostanete výroční zprávu.</p>
    </section>
  );
}

/** Scénář, kariéra a archiv výročních zpráv. */
function ChapterCard({ game }: { game: GameState }) {
  const [open, setOpen] = useState<SeasonReport | null>(null);
  const sc = game.scenario;
  const st = sc && !sc.result ? scenarioStatus(game) : undefined;
  return (
    <section className="card">
      <h2>Kapitola hry</h2>
      {sc ? (
        <p className="small">
          <strong>Scénář: {scenarioDef(sc.id).title}</strong> ({scenarioDef(sc.id).seasons} sezóny od {sc.startSeason}/{String(sc.startSeason + 1).slice(2)}).{' '}
          {sc.result ? sc.result.text : st?.text}
        </p>
      ) : (
        <p className="small">Volná hra bez časového cíle.</p>
      )}
      {game.career && (
        <p className="small">Kariéra: {game.career.clubs.map((c) => `${c.name} (${c.seasons})`).join(', ')}.</p>
      )}
      <h3>Výroční zprávy</h3>
      {(game.seasonReports ?? []).length === 0 ? (
        <p className="muted small">První výroční zpráva přijde na konci sezóny.</p>
      ) : (
        <ul className="plain small">
          {game.seasonReports!.map((r) => (
            <li key={r.season} className="row-between">
              <span>{r.season}/{String(r.season + 1).slice(2)}: {r.position}. místo, {r.goalMet ? 'cíl splněn' : 'cíl nesplněn'}{r.grade ? `, vysvědčení ${r.grade}` : ''}</span>
              <button className="linkbtn" onClick={() => setOpen(r)}>Otevřít</button>
            </li>
          ))}
        </ul>
      )}
      <SeasonCard game={game} compact /> {/* V3: karta sezóny ke sdílení */}
      {open && (
        <SeasonReportView report={open} onClose={() => setOpen(null)}>
          <SeasonCard game={game} season={open.season} compact />
        </SeasonReportView>
      )}
    </section>
  );
}
