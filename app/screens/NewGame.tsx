import { useState } from 'react';
import pack from '../../data/cz-zaklad/pack.json';
import { careerAllows, DIFFICULTY, newCareerGame, newGame, newScenarioGame, SCENARIOS, type DataPack, type Difficulty, type GameState, type ScenarioId } from '../../engine';
import { loadCareer, saveCareer } from '../storage';
import { money, num } from '../format';

const czPack = pack as DataPack;

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

  const start = () => {
    const name = ownerName.trim() || 'Majitel';
    if (mode === 'scenar') {
      onStart(newScenarioGame(czPack, scenario, { ownerName: name, difficulty }));
      return;
    }
    if (!clubId) return;
    if (mode === 'kariera' && career) {
      onStart(newCareerGame(czPack, career, { clubId, difficulty, ownerShare }));
      return;
    }
    onStart(newGame(czPack, { clubId, ownerName: name, difficulty, ownerShare }));
  };
  const locked = (reputation: number) => (mode === 'kariera' ? careerAllows(career ?? undefined, reputation) : undefined);

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

      {mode !== 'scenar' && <section className="card">
        <h2>Vyberte klub</h2>
        {mode === 'kariera' && <p className="muted small">Některé kluby chtějí majitele s úspěchy nebo dobrou pověstí. U zamčených klubů je napsané proč.</p>}
        {czPack.competitions.map((comp) => (
          <div key={comp.id} className="club-group">
            <h3>{comp.fullName ?? comp.name}</h3>
            <div className="club-grid">
              {czPack.clubs
                .filter((c) => c.competition === comp.id)
                .sort((a, b) => b.reputation - a.reputation)
                .map((c) => {
                  const lock = locked(c.reputation);
                  return (
                    <button key={c.id} className={`club-card ${clubId === c.id ? 'selected' : ''}${lock ? ' locked' : ''}`} disabled={!!lock} title={lock} onClick={() => setClubId(c.id)}>
                      <span className="crest" style={{ background: c.colors[0], borderColor: c.colors[1] }} />
                      <span className="club-card-text">
                        <strong>{c.name}</strong>
                        <span>Pověst {c.reputation} · {c.stadium.name}, {num(c.stadium.capacity)} míst</span>
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
