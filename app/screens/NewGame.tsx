import { useState } from 'react';
import pack from '../../data/cz-zaklad/pack.json';
import { careerAllows, DIFFICULTY, newCareerGame, newGame, newScenarioGame, SCENARIOS, type DataPack, type Difficulty, type GameState, type ScenarioId } from '../../engine';
import { loadCareer, saveCareer } from '../storage';
import { money, num } from '../format';

const czPack = pack as DataPack;

const SHARES = [
  { share: 1, label: '100 % klubu', text: 'Rozhoduješ o všem sám a nikomu se nezodpovídáš.' },
  { share: 0.6, label: 'Většina (60 %)', text: 'Vedení ti nikdo nevezme, ale velké stavby a navýšení kapitálu musí schválit i spolumajitelé.' },
  { share: 0.35, label: 'Menšinový podíl (35 %)', text: 'Spolumajitelé hlasují o úvěrech i stavbách a nespokojení tě můžou na valné hromadě odvolat.' },
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
        <p>Kup fotbalový klub a dovedi ho z české pyramidy až do Evropy. Taktiku necháš trenérovi, ty rozhoduješ o penězích, lidech a směřování.</p>
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
                <span>Osobní kapitál {money(DIFFICULTY[d].wallet)}</span>
                <span>Příjem z jiného podnikání {money(DIFFICULTY[d].monthlyIncome)} měsíčně</span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span>Jaký podíl v klubu kupuješ</span>
          <div className="choices">
            {SHARES.map((o) => (
              <button key={o.share} className={`choice ${ownerShare === o.share ? 'selected' : ''}`} onClick={() => setOwnerShare(o.share)}>
                <strong>{o.label}</strong>
                <span>{o.text}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {mode !== 'scenar' && <section className="card">
        <h2>Vyber klub</h2>
        {czPack.competitions.map((comp) => (
          <div key={comp.id} className="club-group">
            <h3>{comp.fullName ?? comp.name}</h3>
            <div className="club-grid">
              {czPack.clubs
                .filter((c) => c.competition === comp.id)
                .sort((a, b) => b.reputation - a.reputation)
                .map((c) => (
                  <button key={c.id} className={`club-card ${clubId === c.id ? 'selected' : ''}`} disabled={!!locked(c.reputation)} title={locked(c.reputation)} onClick={() => setClubId(c.id)}>
                    <span className="crest" style={{ background: c.colors[0], borderColor: c.colors[1] }} />
                    <span className="club-card-text">
                      <strong>{c.name}</strong>
                      <span>Pověst {c.reputation} · {c.stadium.name}, {num(c.stadium.capacity)} míst</span>
                    </span>
                  </button>
                ))}
            </div>
          </div>
        ))}
      </section>}

      <div className="sticky-actions">
        <button className="primary big" disabled={mode !== 'scenar' && !clubId} onClick={start}>
          {mode === 'scenar' ? `Začít scénář: ${SCENARIOS.find((s) => s.id === scenario)!.title}` : clubId ? `Koupit ${czPack.clubs.find((c) => c.id === clubId)?.shortName} a začít` : 'Vyber klub'}
        </button>
      </div>
      {czPack.note && <p className="muted small center">{czPack.note}</p>}
    </div>
  );
}
