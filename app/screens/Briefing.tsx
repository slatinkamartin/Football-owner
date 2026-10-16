import {
  formatShortDate,
  pulseRows,
  seasonStories,
  weeklyBriefing,
  type BriefingTask,
  type GameState,
  type MilestoneTab,
} from '../../engine';
import { Badge, Meter } from '../components';

type Nav = (tab: MilestoneTab, sub?: BriefingTask['sub']) => void;

/** Týdenní porada: úkoly na tento týden s odkazem tam, kde se řeší. */
export function Briefing({ game, onNavigate }: { game: GameState; onNavigate: Nav }) {
  const tasks = weeklyBriefing(game);
  return (
    <section className="card wide briefing">
      <h2>Týdenní porada</h2>
      {tasks.length === 0 ? (
        <p className="muted">Nic nehoří. Klub běží, můžete hrát dál.</p>
      ) : (
        <ul className="plain briefing-list">
          {tasks.map((t) => (
            <li key={t.id} className={`u${t.urgency}`}>
              <span className="briefing-dot" aria-hidden />
              <span className="briefing-text">
                <strong>{t.text}</strong>
                {t.detail && <span className="muted small"> {t.detail}</span>}
              </span>
              <button onClick={() => onNavigate(t.tab, t.sub)}>{t.action} ›</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Panel tlaku: fanoušci, média, kabina a vedení s trendem a důvody změn. */
export function PulsePanel({ game }: { game: GameState }) {
  return (
    <section className="card wide">
      <h2>Nálady kolem klubu</h2>
      <div className="pulse-grid">
        {pulseRows(game).map((r) => (
          <div key={r.key} className="pulse">
            <div className="row-between">
              <strong>{r.label}</strong>
              <span className={`pulse-trend ${r.trend > 0 ? 'pos' : r.trend < 0 ? 'neg' : 'muted'}`} title="Změna za poslední 4 týdny">
                {r.trend > 0 ? `▲ ${r.trend}` : r.trend < 0 ? `▼ ${-r.trend}` : '→ 0'}
              </span>
            </div>
            <div className="pulse-value">
              <Meter value={r.value} /> <strong>{r.value}</strong>
            </div>
            {r.causes.length > 0 ? (
              <ul className="plain small pulse-causes">
                {r.causes.map((c, i) => (
                  <li key={i}>
                    <span className={c.delta > 0 ? 'pos' : 'neg'}>{c.delta > 0 ? '+' : '−'}{Math.abs(Math.round(c.delta))}</span> <span className="muted">{formatShortDate(c.date)}</span> {c.reason}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">Zatím beze změn.</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Příběhy sezóny: rozjeté dějové linky a jak dopadly ty uzavřené. */
export function Stories({ game }: { game: GameState }) {
  const stories = seasonStories(game).slice().reverse();
  if (!stories.length) return null;
  return (
    <section className="card wide">
      <h2>Příběhy sezóny</h2>
      <ul className="cards-list">
        {stories.slice(0, 6).map((s) => (
          <li key={s.id}>
            <div className="row-between">
              <strong>{s.title}</strong>
              {s.done ? (
                <Badge tone={s.outcome === 'dobre' ? 'good' : s.outcome === 'spatne' ? 'bad' : 'neutral'}>{s.outcome === 'dobre' ? 'dobrý konec' : s.outcome === 'spatne' ? 'špatný konec' : 'uzavřeno'}</Badge>
              ) : (
                <Badge tone="warn">
                  {s.waiting === 'rozhodnuti'
                    ? 'čeká na vaše rozhodnutí'
                    : s.waiting === 'zapasy'
                      ? `rozhodne se za ${s.matchesLeft ?? 3} zápasy`
                      : s.waiting === 'okno'
                        ? 'čeká na přestupní okno'
                        : s.until
                          ? `vyhodnotí se ${formatShortDate(s.until)}`
                          : 'běží'}
                </Badge>
              )}
            </div>
            <ol className="story-log small">
              {s.log.map((l, i) => <li key={i}>{l}</li>)}
            </ol>
          </li>
        ))}
      </ul>
    </section>
  );
}
