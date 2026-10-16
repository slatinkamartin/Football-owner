import { useMemo } from 'react';
import { ffpStatus, financialRating, GIVER_LABEL, scenarioSummary, sideGoalProgress, type GameState } from '../../../engine';
import { Badge, Meter } from '../../components';
import { money } from '../../format';

/** Vedlejší cíle sezóny (Přehled). */
export function SideGoalsCard({ game }: { game: GameState }) {
  const sg = game.sideGoals;
  if (!sg || sg.season !== game.season) return null;
  return (
    <section className="card">
      <h2>Vedlejší cíle sezóny</h2>
      <ul className="plain side-goals">
        {sg.goals.map((g) => {
          const p = sideGoalProgress(game, g);
          return (
            <li key={g.kind}>
              <div className="row-between">
                <span><strong>{GIVER_LABEL[g.giver]}:</strong> {g.label}</span>
                {g.done ? <Badge tone={g.done === 'splneno' ? 'good' : 'bad'}>{g.done === 'splneno' ? 'splněno' : 'nesplněno'}</Badge> : null}
              </div>
              <div className="row-between small">
                <Meter value={Math.min(1, Math.max(0, p.ratio)) * 100} />
                <span className="muted">{p.text}{g.reward ? ` · odměna ${money(g.reward)}` : ''}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="muted small">Vyhodnotí se na konci sezóny. Sponzor přidá bonus a zlepší vztah (lepší nabídky), město přispěje na mládež, akcionáři ocení zisk.</p>
    </section>
  );
}

const GRADE_TONE = { A: 'good', B: 'good', C: 'neutral', D: 'warn', E: 'bad', F: 'bad' } as const;

/** Finanční vysvědčení a fair play svazu. */
export function RatingCard({ game }: { game: GameState }) {
  const now = financialRating(game);
  const ffp = ffpStatus(game);
  return (
    <section className="card">
      <div className="row-between">
        <h2>Finanční vysvědčení</h2>
        <span className="grade-pill">{now.grade}</span>
      </div>
      <p className="small">
        Odhad ke konci sezóny: <Badge tone={GRADE_TONE[now.grade]}>{now.grade}</Badge>
        {game.rating && <> · loni {game.rating.grade}</>}
      </p>
      <p className="muted small">{now.reasons.join(', ')}. Rating určuje úrok bank (A o 1,5 bodu levněji, E o 2,5 dráž, s F banka provozní úvěr nedá) a spokojenost akcionářů.</p>
      <h3>Finanční fair play svazu</h3>
      <dl className="kv">
        <dt>Výsledek za 3 sezóny (s výhledem)</dt>
        <dd className={ffp.total < 0 ? 'neg' : ''}>{money(ffp.total)}</dd>
        <dt>Započtené vklady majitele (polovina)</dt>
        <dd>{money(ffp.deposits)}</dd>
        <dt>Limit ztráty</dt>
        <dd>{money(ffp.limit)}</dd>
      </dl>
      <p className="small">
        {!ffp.applies ? <Badge>v této soutěži neplatí</Badge> : ffp.ok ? <Badge tone="good">v limitu</Badge> : <Badge tone="bad">nad limitem</Badge>}
        {ffp.strikes > 0 && <> · napomenutí {ffp.strikes}</>}
        {ffp.restricted && <> · <span className="neg">letos nejvýš 2 hráči za odstupné</span></>}
      </p>
      <p className="muted small">Investice do staveb a mládeže se nepočítají. Při překročení: napomenutí, pak omezení přestupů, pak pokuta.</p>
    </section>
  );
}

/** Scénáře „co když“: srovnání výhledu sezóny. */
export function ScenariosCard({ game }: { game: GameState }) {
  const { base, scenarios } = useMemo(() => scenarioSummary(game), [game]);
  const rows = [{ label: 'Současný výhled', note: '', plan: base }, ...scenarios.map((s) => ({ label: s.label, note: s.blocked ?? s.note, plan: s.plan }))];
  return (
    <section className="card wide">
      <h2>Co když…</h2>
      <p className="muted small">Jak by se změnil výhled sezóny. Nic se tím nemění, jde jen o srovnání.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Situace</th><th className="num">Provozní výsledek</th><th className="num">Peníze na konci</th><th className="num hide-sm">Nejnižší zůstatek</th><th className="num">Potřeba od majitele</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="wrap"><strong>{r.label}</strong>{r.note && <div className="muted small">{r.note}</div>}</td>
                {r.plan ? (
                  <>
                    <td className={`num ${r.plan.result < 0 ? 'neg' : ''}`}>{money(r.plan.result)}{r.plan !== base && <span className="diff muted">{r.plan.result - base.result >= 0 ? '+' : ''}{money(r.plan.result - base.result)}</span>}</td>
                    <td className={`num ${r.plan.cashEnd < 0 ? 'neg' : ''}`}>{money(r.plan.cashEnd)}{r.plan !== base && <span className="diff muted">{r.plan.cashEnd - base.cashEnd >= 0 ? '+' : ''}{money(r.plan.cashEnd - base.cashEnd)}</span>}</td>
                    <td className={`num hide-sm ${r.plan.cashMin < 0 ? 'neg' : ''}`}>{money(r.plan.cashMin)}</td>
                    <td className={`num ${r.plan.ownerNeed ? 'neg' : ''}`}>{r.plan.ownerNeed ? money(r.plan.ownerNeed) : '–'}</td>
                  </>
                ) : (
                  <td colSpan={4} className="muted small">nelze</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
