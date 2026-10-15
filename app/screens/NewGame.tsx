import { useState } from 'react';
import pack from '../../data/cz-zaklad/pack.json';
import { DIFFICULTY, newGame, type DataPack, type Difficulty, type GameState } from '../../engine';
import { money, num } from '../format';

const czPack = pack as DataPack;

export function NewGame({ onStart }: { onStart: (game: GameState) => void }) {
  const [ownerName, setOwnerName] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('stredni');
  const [clubId, setClubId] = useState<string | null>(null);

  const start = () => {
    if (!clubId) return;
    onStart(newGame(czPack, { clubId, ownerName: ownerName.trim() || 'Majitel', difficulty }));
  };

  return (
    <div className="app newgame">
      <header className="hero">
        <h1>Majitel</h1>
        <p>Kup fotbalový klub a dovedi ho z české pyramidy až do Evropy. Taktiku necháš trenérovi, ty rozhoduješ o penězích, lidech a směřování.</p>
      </header>

      <section className="card">
        <h2>Majitel</h2>
        <label className="field">
          <span>Jméno</span>
          <input value={ownerName} placeholder="Jak se jmenujete?" onChange={(e) => setOwnerName(e.target.value)} />
        </label>
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
      </section>

      <section className="card">
        <h2>Vyber klub</h2>
        <p className="muted">V této verzi kupuješ 100 % klubu. Spolumajitelé přijdou v další fázi.</p>
        {czPack.competitions.map((comp) => (
          <div key={comp.id} className="club-group">
            <h3>{comp.fullName ?? comp.name}</h3>
            <div className="club-grid">
              {czPack.clubs
                .filter((c) => c.competition === comp.id)
                .sort((a, b) => b.reputation - a.reputation)
                .map((c) => (
                  <button key={c.id} className={`club-card ${clubId === c.id ? 'selected' : ''}`} onClick={() => setClubId(c.id)}>
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
      </section>

      <div className="sticky-actions">
        <button className="primary big" disabled={!clubId} onClick={start}>
          {clubId ? `Koupit ${czPack.clubs.find((c) => c.id === clubId)?.shortName} a začít` : 'Vyber klub'}
        </button>
      </div>
      {czPack.note && <p className="muted small center">{czPack.note}</p>}
    </div>
  );
}
