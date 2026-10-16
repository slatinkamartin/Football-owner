import { useState } from 'react';
import {
  ADVICE_LABEL,
  adviceAvailableFrom,
  candidates,
  competitionOf,
  directorOf,
  coachOf,
  expectedPosition,
  fireStaff,
  formatDate,
  giveAdvice,
  goalLabel,
  GOALS,
  hireStaff,
  isInterested,
  EXTRA_ROLES,
  ROLE_LABEL,
  ROLE_PURPOSE,
  roleEffect,
  STAFF_KEY,
  scoutingError,
  setSeasonGoal,
  severance,
  staffAge,
  STYLE_LABEL,
  type ActionResult,
  type Advice,
  type GameState,
  type Staff,
  type StaffRole,
} from '../../engine';
import { Badge, Meter, Notice } from '../components';
import { money } from '../format';
import { DataTable } from '../table';

type Props = { game: GameState; onChange: (g: GameState) => void };

export function People({ game, onChange }: Props) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const apply = (r: ActionResult) => {
    if (r.state !== game) onChange(r.state);
    setMessage({ text: r.message, ok: r.ok });
  };
  const club = game.clubs[game.owner.clubId];
  const comp = competitionOf(game, club.id);
  const [role, setRole] = useState<StaffRole>('trener');
  const pick = (r: StaffRole) => {
    setRole(r);
    document.getElementById('kandidati')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="stack">
      <Notice message={message?.text ?? null} ok={message?.ok} />
      <div className="grid two">
        <section className="card">
          <h2>Cíl sezóny</h2>
          <p className="muted">
            Podle síly kádru a trenéra odpovídá klub zhruba {expectedPosition(game, club.id)}. místu. Cíl ovlivňuje důvěru trenéra a
            ředitele: plnění ji zvyšuje, neúspěch snižuje.
          </p>
          <div className="choices">
            {GOALS.map((g) => (
              <button
                key={g}
                className={`choice ${game.owner.seasonGoal === g ? 'selected' : ''}`}
                onClick={() => apply(setSeasonGoal(game, g))}
              >
                <strong>{goalLabel(g, comp)}</strong>
              </button>
            ))}
          </div>
        </section>

        <AdviceCard game={game} onResult={apply} />
      </div>

      <div className="grid two">
        <StaffCard game={game} role="trener" person={coachOf(game, club.id)} onResult={apply} />
        <StaffCard game={game} role="reditel" person={directorOf(game, club.id)} onResult={apply} />
      </div>

      <section className="card">
        <h2>Další ředitelé</h2>
        <p className="muted small">Nepovinné pozice. Stojí plat, ale každá přinese vlastní výhodu. Najímáte je ze seznamu kandidátů níže.</p>
        <div className="grid four">
          {EXTRA_ROLES.map((r) => (
            <ExtraStaff key={r} game={game} role={r} onResult={apply} onPick={() => pick(r)} />
          ))}
        </div>
      </section>

      <Candidates game={game} role={role} setRole={setRole} onResult={apply} />
    </div>
  );
}

function AdviceCard({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const coach = coachOf(game, game.owner.clubId);
  const waitUntil = adviceAvailableFrom(game);
  return (
    <section className="card">
      <h2>Rada trenérovi</h2>
      <p className="muted">
        Sestavu a taktiku určuje trenér. Můžete mu ale naznačit směr. Ješitný trenér radu nemusí přijmout a vztah se zhorší.
      </p>
      {!coach && <p className="warning">Klub nemá hlavního trenéra. Tým vede asistent a hraje slaběji.</p>}
      {waitUntil && <p className="muted small">Další radu můžete dát od {formatDate(waitUntil)}.</p>}
      <div className="buttons">
        {(Object.keys(ADVICE_LABEL) as Advice[]).map((a) => (
          <button key={a} disabled={!coach || !!waitUntil} onClick={() => onResult(giveAdvice(game, a))}>
            {ADVICE_LABEL[a]}
          </button>
        ))}
      </div>
    </section>
  );
}

function ExtraStaff({ game, role, onResult, onPick }: { game: GameState; role: StaffRole; onResult: (r: ActionResult) => void; onPick: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const id = game.clubs[game.owner.clubId].staff[STAFF_KEY[role]];
  const person = id ? game.staff[id] : undefined;
  return (
    <div className={`subcard ${person ? '' : 'empty'}`}>
      <div className="row-between">
        <strong>{ROLE_LABEL[role]}</strong>
        {person ? <span className="rating">{person.ability}</span> : <Badge tone="warn">neobsazeno</Badge>}
      </div>
      {person ? (
        <>
          <p className="small">{person.firstName} {person.lastName} <span className="muted">· {money(person.wage)} měsíčně · do {person.contractUntil}</span></p>
          <p className="small muted">{roleEffect(role, person.ability)}</p>
          {confirming ? (
            <div className="buttons">
              <button className="danger" onClick={() => { setConfirming(false); onResult(fireStaff(game, role)); }}>Odvolat ({money(severance(game, person))})</button>
              <button onClick={() => setConfirming(false)}>Zrušit</button>
            </div>
          ) : (
            <button className="linkbtn" onClick={() => setConfirming(true)}>Odvolat</button>
          )}
        </>
      ) : (
        <>
          <p className="small muted">{ROLE_PURPOSE[role]}</p>
          <button onClick={onPick}>Vybrat kandidáta</button>
        </>
      )}
    </div>
  );
}

function StaffCard({
  game,
  role,
  person,
  onResult,
}: {
  game: GameState;
  role: 'trener' | 'reditel';
  person?: Staff;
  onResult: (r: ActionResult) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const trust = game.owner.trust[role];
  if (!person) {
    return (
      <section className="card">
        <h2>{ROLE_LABEL[role]}</h2>
        <p className="warning">
          Pozice je neobsazená.{' '}
          {role === 'trener'
            ? 'Tým vede asistent a hraje slaběji.'
            : 'Přestupy vyjednáváte sám, hůř a bez návrhů. Skauting je nepřesný.'}
        </p>
        <p className="muted">Vyberte si z kandidátů níže.</p>
      </section>
    );
  }
  const cost = severance(game, person);
  return (
    <section className="card">
      <div className="row-between">
        <h2>{ROLE_LABEL[role]}</h2>
        <Badge tone={trust >= 60 ? 'good' : trust >= 35 ? 'warn' : 'bad'}>Důvěra {Math.round(trust)}</Badge>
      </div>
      <p className="person-name">
        {person.firstName} {person.lastName} <span className="muted">· {staffAge(person, game.season)} let</span>
      </p>
      <dl className="kv meters">
        <dt>{role === 'trener' ? 'Trenérské schopnosti' : 'Skauting a vyjednávání'}</dt>
        <dd><Meter value={person.ability} /> {person.ability}</dd>
        <dt>Ambice</dt>
        <dd><Meter value={person.ambition} max={20} tone="good" /> {person.ambition}</dd>
        <dt>Ego</dt>
        <dd><Meter value={person.ego} max={20} tone="warn" /> {person.ego}</dd>
        <dt>Loajalita</dt>
        <dd><Meter value={person.loyalty} max={20} tone="good" /> {person.loyalty}</dd>
        <dt>Důvěra ve vás</dt>
        <dd><Meter value={trust} /> {Math.round(trust)}</dd>
      </dl>
      <dl className="kv">
        {role === 'trener' ? (
          <>
            <dt>Styl hry</dt>
            <dd>{STYLE_LABEL[person.style]}</dd>
            <dt>Mladí hráči</dt>
            <dd>{person.youthFocus ? 'dává jim šanci' : 'spoléhá na zkušené'}</dd>
          </>
        ) : (
          <>
            <dt>Přesnost skautů</dt>
            <dd>±{scoutingError(game).toFixed(0)} bodů hodnocení</dd>
          </>
        )}
        <dt>Plat</dt>
        <dd>{money(person.wage)} měsíčně</dd>
        <dt>Smlouva do</dt>
        <dd>30. 6. {person.contractUntil}</dd>
      </dl>
      {trust < 25 && <p className="warning">Vztah je na bodu mrazu. Hrozí rezignace na konci sezóny.</p>}
      {confirming ? (
        <div className="confirm">
          <strong>Odvolat? Odstupné {money(cost)}.</strong>
          <div className="buttons">
            <button className="danger" onClick={() => { setConfirming(false); onResult(fireStaff(game, role)); }}>
              Ano, odvolat
            </button>
            <button onClick={() => setConfirming(false)}>Zrušit</button>
          </div>
        </div>
      ) : (
        <button className="danger" onClick={() => setConfirming(true)}>Odvolat</button>
      )}
    </section>
  );
}

function Candidates({ game, role, setRole, onResult }: { game: GameState; role: StaffRole; setRole: (r: StaffRole) => void; onResult: (r: ActionResult) => void }) {
  const [pending, setPending] = useState<string | null>(null);
  const club = game.clubs[game.owner.clubId];
  const currentId = club.staff[STAFF_KEY[role]];
  const current = currentId ? game.staff[currentId] : undefined;
  const list = candidates(game, role);

  return (
    <section className="card" id="kandidati">
      <div className="row-between">
        <h2>Volní kandidáti</h2>
        <div className="segmented wrap">
          {(Object.keys(STAFF_KEY) as StaffRole[]).map((r) => (
            <button key={r} className={role === r ? 'active' : ''} onClick={() => { setRole(r); setPending(null); }}>
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>
      <p className="muted small">Nový člověk podepíše smlouvu na 2 roky, při nástupu dostane jeden měsíční plat jako bonus.</p>
      <DataTable
        id={`kandidati-${role}`}
        rows={list}
        rowKey={(s) => s.id}
        initialSort={{ key: 'ability', dir: 'desc' }}
        columns={[
          { key: 'name', label: 'Jméno', value: (s) => s.lastName, render: (s) => `${s.firstName} ${s.lastName}` },
          { key: 'age', label: 'Věk', num: true, value: (s) => staffAge(s, game.season) },
          { key: 'ability', label: 'Schopnosti', num: true, value: (s) => s.ability, render: (s) => <span className="rating">{s.ability}</span> },
          ...(role === 'trener'
            ? [{ key: 'style', label: 'Styl', hideSm: true, value: (s: Staff) => STYLE_LABEL[s.style] + (s.youthFocus ? ', mladí' : '') }]
            : role === 'reditel'
              ? []
              : [{ key: 'effect', label: 'Přínos', hideSm: true, value: (s: Staff) => s.ability, render: (s: Staff) => <span className="small muted">{roleEffect(role, s.ability)}</span> }]),
          { key: 'ego', label: 'Ego', num: true, hideSm: true, value: (s) => s.ego },
          { key: 'loyalty', label: 'Loajalita', num: true, hideSm: true, value: (s) => s.loyalty },
          { key: 'wage', label: 'Plat', num: true, value: (s) => s.wage, render: (s) => money(s.wage) },
          {
            key: 'act',
            label: '',
            value: (s) => (isInterested(s, club) ? 1 : 0),
            render: (s) =>
              !isInterested(s, club) ? (
                <span className="muted small">nemá zájem</span>
              ) : pending === s.id ? (
                <span className="buttons end">
                  <button className="primary" onClick={() => { setPending(null); onResult(hireStaff(game, s.id, 2)); }}>Potvrdit</button>
                  <button onClick={() => setPending(null)}>Zpět</button>
                </span>
              ) : (
                <button onClick={() => setPending(s.id)}>Najmout</button>
              ),
          },
        ]}
      />
      {pending && current && (
        <p className="muted small">
          {ROLE_LABEL[role]} {current.firstName} {current.lastName} odejde, odstupné {money(severance(game, current))}.
        </p>
      )}
    </section>
  );
}
