import {
  CATERING_SPEND,
  DEPARTMENT_KEYS,
  DEPARTMENT_LABEL,
  departmentEffect,
  departmentReference,
  departmentsOf,
  facilityUpkeep,
  hierarchyIssues,
  playerName,
  POSITION_SHORT,
  ROLE_LABEL,
  SECTION_LABEL,
  sectionsOf,
  sectionUsage,
  setWageSection,
  STAFF_KEY,
  squadOf,
  tierOf,
  WAGE_SECTIONS,
  type GameState,
  type StaffRole,
  type WageSection,
} from '../../../engine';
import { money } from '../../format';
import { PlayerLink } from '../../nav';

/** Náklady: platy po sekcích s ručním přeřazením, hierarchie, oddělení, provoz a vedení. */
export function FinanceCosts({ game, onChange, onBudget }: { game: GameState; onChange: (g: GameState) => void; onBudget: () => void }) {
  const club = game.clubs[game.owner.clubId];
  const tier = tierOf(game, club.id);
  const usage = sectionUsage(game);
  const sections = sectionsOf(game);
  const squad = squadOf(game, club.id).sort((a, b) => b.wage - a.wage);
  const issues = hierarchyIssues(game);
  const ref = departmentReference(club, tier);
  const depts = departmentsOf(club, tier);
  const admin = tier === 1 ? 450_000 : tier === 2 ? 110_000 : 30_000;
  const staff = (Object.keys(STAFF_KEY) as StaffRole[])
    .map((r) => ({ role: r, s: game.staff[club.staff[STAFF_KEY[r]] ?? ''] }))
    .filter((x) => x.s);

  return (
    <div className="stack">
      <section className="card">
        <div className="row-between">
          <h2>Platy hráčů po sekcích <span className="muted small">· {money(usage.reduce((a, u) => a + u.bill, 0))} z {money(usage.reduce((a, u) => a + u.cap, 0))} měsíčně</span></h2>
          <button className="linkbtn" onClick={onBudget}>Rozdělení rozpočtu ›</button>
        </div>
        {issues.map((t, i) => <p key={i} className="warning soft">{t}</p>)}
        <div className="sections-grid">
          {WAGE_SECTIONS.map((sec) => {
            const u = usage.find((x) => x.section === sec)!;
            const list = squad.filter((p) => sections.get(p.id) === sec);
            return (
              <div key={sec} className="subcard">
                <div className="row-between">
                  <strong>{SECTION_LABEL[sec]}</strong>
                  <span className={`small ${u.room < 0 ? 'neg' : 'muted'}`}>{money(u.bill)} z {money(u.cap)}</span>
                </div>
                <span className="meter wide"><span className={`meter-fill ${u.room < 0 ? 'bad' : u.bill > u.cap * 0.9 ? 'warn' : 'good'}`} style={{ width: `${Math.min(100, (u.bill / Math.max(1, u.cap)) * 100)}%` }} /></span>
                <ul className="plain small wage-list">
                  {list.map((p) => (
                    <li key={p.id} className="row-between">
                      <span>
                        <span className="muted">{POSITION_SHORT[p.position]}</span> <PlayerLink id={p.id}>{playerName(p)}</PlayerLink>{' '}
                        <span className="muted">({p.overall}, do {p.contractUntil})</span>
                      </span>
                      <span className="wage-cell">
                        {money(p.wage)}
                        <select
                          aria-label={`Sekce hráče ${playerName(p)}`}
                          value={p.wageSection ?? ''}
                          onChange={(e) => onChange(setWageSection(game, p.id, (e.target.value || undefined) as WageSection | undefined))}
                        >
                          <option value="">auto</option>
                          {WAGE_SECTIONS.map((s) => <option key={s} value={s}>{SECTION_LABEL[s]}</option>)}
                        </select>
                      </span>
                    </li>
                  ))}
                  {list.length === 0 && <li className="muted">nikdo</li>}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="muted small">Hráče řadí hra podle role v kádru. Ručně můžete například zkušeného hráče posunout z opor do rotace; ovlivní to, kolik místa v sekci zbývá.</p>
      </section>

      <div className="grid">
        <section className="card">
          <div className="row-between">
            <h2>Oddělení</h2>
            <button className="linkbtn" onClick={onBudget}>Upravit ›</button>
          </div>
          <dl className="kv">
            {DEPARTMENT_KEYS.map((k) => {
              const e = departmentEffect(club, tier, k);
              return (
                <span key={k} className="kv-row">
                  <dt>{DEPARTMENT_LABEL[k]}</dt>
                  <dd>{money(depts[k])} <span className={`small ${e > 0.05 ? 'pos' : e < -0.05 ? 'neg' : 'muted'}`}>({Math.round((depts[k] / Math.max(1, ref[k])) * 100)} %)</span></dd>
                </span>
              );
            })}
            <dt className="total-row">Celkem ročně</dt>
            <dd className="total-row">{money(DEPARTMENT_KEYS.reduce((a, k) => a + depts[k], 0))}</dd>
          </dl>
        </section>
        <section className="card">
          <h2>Provoz (měsíčně)</h2>
          <dl className="kv">
            <dt>Administrativa, cestování, energie</dt>
            <dd>{money(admin)}</dd>
            <dt>Údržba stadionu ({club.stadium.capacity.toLocaleString('cs-CZ')} míst)</dt>
            <dd>{money(club.stadium.capacity * 15)}</dd>
            <dt>Zázemí (trénink, akademie, medicína, VIP, catering {CATERING_SPEND[club.facilities.catering]} Kč/divák)</dt>
            <dd>{money(facilityUpkeep(club.facilities, tier))}</dd>
            <dt className="total-row">Celkem měsíčně</dt>
            <dd className="total-row">{money(admin + club.stadium.capacity * 15 + facilityUpkeep(club.facilities, tier))}</dd>
          </dl>
        </section>
        <section className="card">
          <h2>Vedení (měsíčně)</h2>
          <dl className="kv">
            {staff.map((x) => (
              <span key={x.role} className="kv-row">
                <dt>{ROLE_LABEL[x.role]}</dt>
                <dd>{money(x.s!.wage)}</dd>
              </span>
            ))}
            <dt className="total-row">Celkem měsíčně</dt>
            <dd className="total-row">{money(staff.reduce((a, x) => a + x.s!.wage, 0))}</dd>
          </dl>
        </section>
      </div>
    </div>
  );
}
