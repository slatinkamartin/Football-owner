import { useState } from 'react';
import {
  closeYouthIntake,
  delegationOf,
  formatDate,
  hireWithInterview,
  interviewFit,
  POSITION_SHORT,
  playerAge,
  playerName,
  toggleYouth,
  updateDelegation,
  youthView,
  type ActionResult,
  type DelegationLevel,
  type GameState,
  type InterviewAnswers,
  type Staff,
} from '../../engine';
import { Badge } from '../components';
import { money } from '../format';

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value?: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="segmented wrap">
        {options.map((o) => <button key={o.id} className={value === o.id ? 'active' : ''} onClick={() => onChange(o.id)}>{o.label}</button>)}
      </div>
    </div>
  );
}

/** Pohovor před najmutím trenéra nebo sportovního ředitele. Ostatní ředitelé se najímají rovnou. */
export function Interview({ game, staff, onResult, onClose }: { game: GameState; staff: Staff; onResult: (r: ActionResult) => void; onClose: () => void }) {
  const [a, setA] = useState<InterviewAnswers>({});
  const coach = staff.role === 'trener';
  const done = coach ? !!a.youth && !!a.budget : !!a.budget && !!a.autonomy;
  const fit = interviewFit(game, staff.id, a);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="card dialog interview" role="dialog" aria-modal="true" aria-label="Pohovor" onClick={(e) => e.stopPropagation()}>
        <h2>Pohovor: {staff.firstName} {staff.lastName}</h2>
        <p className="muted small">Odpovědi rozhodnou o výchozí důvěře. Co slíbíte, to se zapíše a hra hlídá, jestli to dodržíte.</p>
        {coach && (
          <Choice label="Kolik prostoru dostanou mladí?" value={a.youth} onChange={(youth) => setA({ ...a, youth })} options={[{ id: 'mladi', label: 'hodně, stavíme na mladých' }, { id: 'vyvazene', label: 'vyváženě' }, { id: 'vysledky', label: 'výsledky mají přednost' }]} />
        )}
        <Choice label="Jak to bude s rozpočtem na posily?" value={a.budget} onChange={(budget) => setA({ ...a, budget })} options={[{ id: 'navysit', label: 'navýším o 20 % (slib)' }, { id: 'udrzet', label: 'udržím (slib)' }, { id: 'setrit', label: 'budeme šetřit' }]} />
        {!coach && (
          <Choice label="Kolik smí rozhodovat sám?" value={a.autonomy} onChange={(autonomy) => setA({ ...a, autonomy })} options={[{ id: 'plna', label: 'nákupy i prodeje' }, { id: 'stredni', label: 'smlouvy a doplnění kádru' }, { id: 'mala', label: 'jen s mým souhlasem' }]} />
        )}
        {fit.notes.length > 0 && (
          <ul className="plain small">
            {fit.notes.map((n) => <li key={n}>• {n}</li>)}
          </ul>
        )}
        <p className="small">Výchozí důvěra: <strong>{fit.trust}</strong> (běžně 60). Plat {money(staff.wage)} měsíčně, smlouva na 2 roky.</p>
        <div className="buttons">
          <button className="primary" disabled={!done} onClick={() => { onResult(hireWithInterview(game, staff.id, 2, a)); onClose(); }}>Najmout</button>
          <button onClick={onClose}>Zpět</button>
        </div>
      </div>
    </div>
  );
}

/** Pravomoci ředitelů a přehled slibů. */
export function Delegation({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const club = game.clubs[game.owner.clubId];
  const d = delegationOf(club);
  const promises = (game.promises ?? []).slice().reverse().slice(0, 6);
  const levels: { id: DelegationLevel; label: string; hint: string }[] = [
    { id: 'nizka', label: 'malé', hint: 'Jen nouzové doplnění kádru. Vše ostatní rozhodujete vy. Ředitel se cítí kontrolovaný (důvěra pomalu klesá).' },
    { id: 'stredni', label: 'střední', hint: 'Prodlužuje smlouvy a doplňuje kádr volnými hráči, nakupovat a prodávat nesmí.' },
    { id: 'vysoka', label: 'plné', hint: 'Navíc sám kupuje posily (doma i v regionech se skautskou sítí) a v prodejním klubu prodává. Důvěra pomalu roste.' },
  ];
  return (
    <section className="card">
      <h2>Pravomoci ředitelů</h2>
      <div className="field">
        <span>Sportovní ředitel</span>
        <div className="segmented">
          {levels.map((l) => <button key={l.id} className={d.director === l.id ? 'active' : ''} onClick={() => onResult(updateDelegation(game, { director: l.id }))}>{l.label}</button>)}
        </div>
        <span className="muted small">{levels.find((l) => l.id === d.director)?.hint}</span>
      </div>
      <label className="check">
        <input type="checkbox" disabled={!club.staff.commercialId} checked={d.commercial} onChange={(e) => onResult(updateDelegation(game, { commercial: e.target.checked }))} />
        <span>Obchodní ředitel sám podepisuje nejlepší nabídky na volná sponzorská místa{!club.staff.commercialId && ' (klub ho nemá)'}</span>
      </label>
      <label className="check">
        <input type="checkbox" disabled={!club.staff.financeId} checked={d.finance} onChange={(e) => onResult(updateDelegation(game, { finance: e.target.checked }))} />
        <span>Finanční ředitel sám schvaluje návrh rozpočtu na začátku sezóny{!club.staff.financeId && ' (klub ho nemá)'}</span>
      </label>
      {promises.length > 0 && (
        <>
          <h3>Vaše sliby</h3>
          <ul className="plain small">
            {promises.map((p) => (
              <li key={p.id} className="row-between">
                <span>{p.kind === 'posila' ? `Posila pro trenéra (${p.position ? POSITION_SHORT[p.position] : ''}, aspoň ${p.bar})` : `Rozpočet na přestupy aspoň ${money(p.value ?? 0)}`} · do {formatDate(p.until)}</span>
                <Badge tone={p.done === 'splneno' ? 'good' : p.done === 'poruseno' ? 'bad' : 'warn'}>{p.done === 'splneno' ? 'splněno' : p.done === 'poruseno' ? 'porušeno' : 'platí'}</Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Letní přijímačky dorostu: výběr, kdo dostane smlouvu. */
export function YouthIntake({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const it = game.youthIntake;
  if (!it) return null;
  return (
    <section className="card highlight">
      <div className="row-between">
        <h2>Přijímačky dorostu</h2>
        <Badge tone="warn">vybráno {it.chosen.length} / {it.slots} · do {formatDate(it.deadline)}</Badge>
      </div>
      <p className="muted small">Potenciál je odhad akademie: přesnější s lepší akademií, mládežnickým oddělením a šéfem akademie. Kdo smlouvu nedostane, odejde jinam a třeba se z něj stane hvězda u soupeře. Když nevyberete, rozhodne šéf akademie.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Hráč</th><th>Poz.</th><th className="num">Věk</th><th className="num">Teď</th><th className="num">Potenciál (odhad)</th><th /></tr>
          </thead>
          <tbody>
            {it.candidates.map((p) => {
              const v = youthView(game, p);
              const on = it.chosen.includes(p.id);
              return (
                <tr key={p.id} className={on ? 'own-row' : ''}>
                  <td>{playerName(p)}</td>
                  <td>{POSITION_SHORT[p.position]}</td>
                  <td className="num">{playerAge(p, game.season)}</td>
                  <td className="num">{p.overall}</td>
                  <td className="num">{v.potLo}–{v.potHi}</td>
                  <td className="num"><button className={on ? 'primary' : ''} onClick={() => onResult(toggleYouth(game, p.id))}>{on ? 'Vybrán' : 'Vybrat'}</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="buttons">
        <button className="primary" onClick={() => onResult(closeYouthIntake(game))}>{it.chosen.length ? 'Podepsat vybrané' : 'Nechat vybrat šéfa akademie'}</button>
      </div>
    </section>
  );
}
