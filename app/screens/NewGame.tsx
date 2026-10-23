import { useEffect, useMemo, useState } from 'react';
import pack from '../../data/cz-zaklad/pack.json';
import rosterCsv from '../../data/soupisky/hraci.csv?raw';
import { careerAllows, clubPrices, sharePurchasePrice, DIFFICULTY, parseRosterCsv, rostersByClub, type RosterRow, newCareerGame, newGame, newScenarioGame, SCENARIOS, type DataPack, type Difficulty, type GameState, type ScenarioId } from '../../engine';
import { listRosterSets, loadCareer, saveCareer, type RosterSet } from '../storage';
import { RosterEditor } from './RosterEditor';
import { money, num } from '../format';

const czPack = pack as DataPack;
// Databáze skutečných soupisek (data/soupisky/hraci.csv).
const builtinRosters = parseRosterCsv(rosterCsv).rows;

const SHARES = [
  { share: 1, label: '100 % klubu', text: 'O všem rozhodujete sami a nikomu se nezodpovídáte.' },
  { share: 0.6, label: 'Většina (60 %)', text: 'Vedení vám nikdo nevezme, ale velké stavby a navýšení kapitálu musí schválit i spolumajitelé.' },
  { share: 0.35, label: 'Menšinový podíl (35 %)', text: 'Spolumajitelé hlasují o úvěrech i stavbách a nespokojení vás můžou na valné hromadě odvolat.' },
];

export function NewGame({ onStart, outdatedSave }: { onStart: (game: GameState) => void; outdatedSave?: boolean }) {
  const [ownerName, setOwnerName] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('stredni');
  const [clubId, setClubId] = useState<string | null>(null);
  const [ownerShare, setOwnerShare] = useState(1);
  const [career, setCareer] = useState(() => loadCareer());
  const [mode, setMode] = useState<'volna' | 'scenar' | 'kariera'>(career ? 'kariera' : 'volna');
  const [scenario, setScenario] = useState<ScenarioId>('zachrana');
  const [customRosters, setCustomRosters] = useState<{ rows: RosterRow[]; errors: string[]; name: string } | null>(null);
  // Zdroj hráčů: databáze hry, nahraný soubor, uložená soupiska z konfigurátoru (id), nebo vymyšlení hráči.
  const [source, setSource] = useState<string>(builtinRosters.length ? 'db' : 'none');
  const [sets, setSets] = useState<RosterSet[]>([]);
  const [editing, setEditing] = useState<{ base: RosterRow[]; baseName: string; existing?: RosterSet } | null>(null);
  useEffect(() => {
    void listRosterSets().then(setSets);
  }, []);
  const chosenSet = sets.find((s) => s.id === source);
  const rosters = source === 'db' ? builtinRosters : source === 'file' ? customRosters?.rows : chosenSet?.rows;
  // V4: kupní ceny klubů (hodnota klubu), v kariéře se platí z osobních peněz podle podílu.
  const prices = useMemo(() => (mode === 'scenar' ? {} : clubPrices(czPack, difficulty, rosters?.length ? rosters : undefined)), [mode, difficulty, rosters]);
  const shareCost = (id: string) => sharePurchasePrice(prices[id] ?? 0, ownerShare);
  const describe = (rows: RosterRow[]) => `${rows.length} hráčů z ${rostersByClub(rows).size} klubů`;

  const start = () => {
    const name = ownerName.trim() || 'Majitel';
    if (mode === 'scenar') {
      onStart(newScenarioGame(czPack, scenario, { ownerName: name, difficulty, rosters: rosters?.length ? rosters : undefined }));
      return;
    }
    if (!clubId) return;
    if (mode === 'kariera' && career) {
      onStart(newCareerGame(czPack, career, { clubId, difficulty, ownerShare, rosters: rosters?.length ? rosters : undefined, price: prices[clubId] }));
      return;
    }
    onStart(newGame(czPack, { clubId, ownerName: name, difficulty, ownerShare, rosters: rosters?.length ? rosters : undefined }));
  };
  if (editing) {
    return (
      <RosterEditor
        base={editing.base}
        baseName={editing.baseName}
        existing={editing.existing}
        onClose={(savedId) => {
          setEditing(null);
          void listRosterSets().then((list) => {
            setSets(list);
            if (savedId) setSource(savedId);
            else if (!list.some((s) => s.id === source) && source !== 'db' && source !== 'file' && source !== 'none') setSource('db');
          });
          window.scrollTo(0, 0);
        }}
      />
    );
  }
  const locked = (id: string, reputation: number) => {
    if (mode !== 'kariera') return undefined;
    const why = careerAllows(career ?? undefined, reputation);
    if (why) return why;
    const cost = shareCost(id);
    return career && cost > career.wallet ? `Na ${Math.round(ownerShare * 100)} % klubu potřebujete ${money(cost)}, máte ${money(career.wallet)}.` : undefined;
  };

  return (
    <div className="app newgame">
      <header className="hero">
        <h1>Majitel</h1>
        <p>Kupte fotbalový klub a doveďte ho z české pyramidy až do Evropy. Taktiku necháte trenérovi, vy rozhodujete o penězích, lidech a směřování.</p>
      </header>

      {outdatedSave && (
        <p className="warning">
          Hra dostala trenéry, ředitele a přestupy. Uloženou hru ze starší verze nejde načíst, začněte prosím novou.
        </p>
      )}

      <section className="card">
        <h2>Jak chcete hrát</h2>
        <div className="segmented">
          <button className={mode === 'volna' ? 'active' : ''} onClick={() => setMode('volna')}>Volná hra</button>
          <button className={mode === 'scenar' ? 'active' : ''} onClick={() => setMode('scenar')}>Scénář s cílem</button>
          {career && <button className={mode === 'kariera' ? 'active' : ''} onClick={() => setMode('kariera')}>Pokračovat v kariéře</button>}
        </div>
        {mode === 'kariera' && career && (
          <div className="career-box">
            <p><strong>{career.name}</strong>: osobní peníze {money(career.wallet)}, pověst u médií {Math.round(career.media)}, odkaz {career.trophies.reduce((a, t) => a + t.points, 0)} bodů.</p>
            <ul className="plain small">{career.clubs.map((c, i) => <li key={i}>• {c.name} ({c.seasons}): {c.result}</li>)}</ul>
            <button className="linkbtn" onClick={() => { saveCareer(null); setCareer(null); setMode('volna'); }}>Zahodit kariéru a začít znovu</button>
          </div>
        )}
        {mode === 'scenar' && (
          <div className="choices">
            {SCENARIOS.map((s) => (
              <button key={s.id} className={`choice ${scenario === s.id ? 'selected' : ''}`} onClick={() => setScenario(s.id)}>
                <strong>{s.title}</strong>
                <span>{s.description}</span>
                <span>Klub: {czPack.clubs.find((c) => c.id === s.clubId)?.name} · {s.seasons} {s.seasons < 5 ? 'sezóny' : 'sezón'}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Majitel</h2>
        {mode !== 'kariera' && <label className="field">
          <span>Jméno</span>
          <input value={ownerName} placeholder="Jak se jmenujete?" onChange={(e) => setOwnerName(e.target.value)} />
        </label>}
        <div className="field">
          <span>Startovní podmínky</span>
          <div className="choices">
            {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
              <button key={d} className={`choice ${difficulty === d ? 'selected' : ''}`} onClick={() => setDifficulty(d)}>
                <strong>{DIFFICULTY[d].label}</strong>
                {mode === 'kariera' && career ? (
                  <span>Osobní kapitál {money(career.wallet)} (přenesený z kariéry)</span>
                ) : (
                  <span>Osobní kapitál {money(DIFFICULTY[d].wallet)}</span>
                )}
                <span>Příjem z jiného podnikání {money(DIFFICULTY[d].monthlyIncome)} měsíčně</span>
              </button>
            ))}
          </div>
        </div>
        {mode !== 'scenar' && <div className="field">
          <span>Jaký podíl v klubu kupujete</span>
          <div className="choices">
            {SHARES.map((o) => (
              <button key={o.share} className={`choice ${ownerShare === o.share ? 'selected' : ''}`} onClick={() => setOwnerShare(o.share)}>
                <strong>{o.label}</strong>
                <span>{o.text}</span>
              </button>
            ))}
          </div>
        </div>}
        {mode === 'kariera' && career && (
          <p className="muted small">Do nového klubu si přinášíte osobní peníze {money(career.wallet)}, pověst u médií {Math.round(career.media)} a u svazu {Math.round(career.league)}. Startovní podmínky dál určují příjem z jiného podnikání, peníze klubu a náročnost hry.</p>
        )}
      </section>

      <section className="card">
        <h2>Hráči</h2>
        <div className="choices">
          <button className={`choice ${source === 'db' ? 'selected' : ''}`} disabled={!builtinRosters.length} onClick={() => setSource('db')}>
            <strong>Skutečné soupisky (databáze hry)</strong>
            <span>{builtinRosters.length ? `${describe(builtinRosters)}, stav k 19. 10. 2026. Ostatní kluby dostanou vymyšlené hráče.` : 'Databáze soupisek je prázdná.'}</span>
          </button>
          {sets.map((s) => (
            <div key={s.id} className={`choice roster-choice ${source === s.id ? 'selected' : ''}`} role="button" tabIndex={0} onClick={() => setSource(s.id)} onKeyDown={(e) => e.key === 'Enter' && setSource(s.id)}>
              <strong>{s.name}</strong>
              <span>Vlastní soupiska: {describe(s.rows)}, upraveno {new Date(s.updated).toLocaleDateString('cs-CZ')}.</span>
              <button className="linkbtn" onClick={(e) => { e.stopPropagation(); setEditing({ base: s.rows, baseName: s.name, existing: s }); }}>Upravit ›</button>
            </div>
          ))}
          {customRosters && customRosters.rows.length > 0 && (
            <button className={`choice ${source === 'file' ? 'selected' : ''}`} onClick={() => setSource('file')}>
              <strong>Nahraný soubor {customRosters.name}</strong>
              <span>{describe(customRosters.rows)}.</span>
            </button>
          )}
          <button className={`choice ${source === 'none' ? 'selected' : ''}`} onClick={() => setSource('none')}>
            <strong>Vymyšlení hráči</strong>
            <span>Všechny kluby dostanou náhodně vygenerované hráče podle své úrovně.</span>
          </button>
        </div>
        <div className="buttons roster-buttons">
          <button
            className="primary"
            onClick={() => {
              const base = source === 'file' && customRosters ? customRosters.rows : chosenSet ? chosenSet.rows : builtinRosters;
              const baseName = source === 'file' && customRosters ? customRosters.name : chosenSet ? chosenSet.name : 'databáze hry';
              setEditing({ base, baseName, existing: chosenSet });
            }}
          >
            {chosenSet ? 'Upravit vybranou soupisku' : 'Konfigurátor soupisek'}
          </button>
          {chosenSet && <button onClick={() => setEditing({ base: builtinRosters, baseName: 'databáze hry' })}>Nová soupiska z databáze</button>}
        </div>
        <label className="button-like small-btn">
          Nahrát vlastní soupisky (CSV)
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const parsed = parseRosterCsv(await file.text());
              const unknown = [...new Set(parsed.rows.map((r) => r.club))].filter((id) => !czPack.clubs.some((c) => c.id === id));
              setCustomRosters({ rows: parsed.rows.filter((r) => !unknown.includes(r.club)), errors: [...parsed.errors, ...unknown.map((id) => `Neznámý klub „${id}“ (řádky přeskočeny).`)], name: file.name });
              if (parsed.rows.length) setSource('file');
              e.target.value = '';
            }}
          />
        </label>
        {customRosters && customRosters.errors.length > 0 && (
          <div className="warning small">
            <strong>Některé řádky souboru se nenačetly:</strong>
            <ul className="plain">{customRosters.errors.slice(0, 8).map((x, i) => <li key={i}>{x}</li>)}</ul>
            {customRosters.errors.length > 8 && <span>… a další ({customRosters.errors.length - 8}).</span>}
          </div>
        )}
        <p className="muted small">Formát souboru je popsaný v data/soupisky/README.md (jeden řádek = hráč: klub; jméno; příjmení; rok narození; pozice BR/OBR/ZAL/UT; …).</p>
      </section>

      {mode !== 'scenar' && <section className="card">
        <h2>Vyberte klub</h2>
        {mode === 'kariera' && <p className="muted small">Klub kupujete z osobních peněz: zaplatíte hodnotu klubu podle podílu. Některé kluby chtějí majitele s úspěchy nebo dobrou pověstí. U zamčených klubů je napsané proč.</p>}
        {mode === 'volna' && <p className="muted small">Hodnota klubu je jen pro představu: ve volné hře klub dostanete se startovním kapitálem podle obtížnosti.</p>}
        {czPack.competitions.map((comp) => (
          <div key={comp.id} className="club-group">
            <h3>{comp.fullName ?? comp.name}</h3>
            <div className="club-grid">
              {czPack.clubs
                .filter((c) => c.competition === comp.id)
                .sort((a, b) => b.reputation - a.reputation)
                .map((c) => {
                  const lock = locked(c.id, c.reputation);
                  return (
                    <button key={c.id} className={`club-card ${clubId === c.id ? 'selected' : ''}${lock ? ' locked' : ''}`} disabled={!!lock} title={lock} onClick={() => setClubId(c.id)}>
                      <span className="crest" style={{ background: c.colors[0], borderColor: c.colors[1] }} />
                      <span className="club-card-text">
                        <strong>{c.name}</strong>
                        <span>Pověst {c.reputation} · {c.stadium.name}, {num(c.stadium.capacity)} míst</span>
                        {prices[c.id] !== undefined && (
                          <span className="club-price">
                            Hodnota klubu {money(prices[c.id])}
                            {mode === 'kariera' ? ` · váš podíl stojí ${money(shareCost(c.id))}` : ''}
                          </span>
                        )}
                        {lock && <span className="club-lock">Zamčeno: {lock}</span>}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </section>}

      <div className="sticky-actions">
        <button className="primary big" disabled={mode !== 'scenar' && !clubId} onClick={start}>
          {mode === 'scenar' ? `Začít scénář: ${SCENARIOS.find((s) => s.id === scenario)!.title}` : clubId ? `Koupit ${czPack.clubs.find((c) => c.id === clubId)?.shortName} a začít` : 'Vyberte klub'}
        </button>
      </div>
      {czPack.note && <p className="muted small center">{czPack.note}</p>}
    </div>
  );
}
