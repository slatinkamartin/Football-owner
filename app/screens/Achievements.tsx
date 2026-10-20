import { useEffect, useRef, useState } from 'react';
import { ACHIEVEMENTS, achievementCount, achievementDef, achievementsOf, formatDate, TIER_LABEL, tierThresholdText, type AchievementDef, type GameState, type SeasonReport } from '../../engine';

const TIER_CLASS = { 1: 'bronze', 2: 'silver', 3: 'gold' } as const;

function tierHint(def: AchievementDef): string {
  if (def.tiers.length < 2) return def.desc;
  return `${def.desc} ${def.tiers.map((_, i) => `${TIER_LABEL[(i + 1) as 1 | 2 | 3]}: ${tierThresholdText(def, i)}`).join(' · ')}`;
}

/** Karta Úspěchy (záložka Hra): mřížka odznaků, zamčené šedě s popisem. */
export function AchievementsCard({ game }: { game: GameState }) {
  const [filter, setFilter] = useState<'vse' | 'ziskane'>('vse');
  const a = achievementsOf(game);
  const count = achievementCount(game);
  const list = filter === 'vse' ? ACHIEVEMENTS : ACHIEVEMENTS.filter((d) => a.unlocked[d.id]);
  return (
    <section className="card wide">
      <div className="row-between">
        <h2>Úspěchy</h2>
        <span className="small">
          <strong>{count.unlocked}</strong> z {count.total} odznaků{count.gold ? ` · zlatých ${count.gold}` : ''}
        </span>
      </div>
      <p className="muted small">Odznaky se kontrolují každý týden a na konci sezóny. Zůstávají vám i v další kariéře u jiného klubu.</p>
      <div className="ach-filter" role="group" aria-label="Filtr odznaků">
        <button className={filter === 'vse' ? 'active' : ''} onClick={() => setFilter('vse')}>Všechny</button>
        <button className={filter === 'ziskane' ? 'active' : ''} onClick={() => setFilter('ziskane')}>Získané ({count.unlocked})</button>
      </div>
      <ul className="ach-grid">
        {list.map((def) => {
          const rec = a.unlocked[def.id];
          const tier = rec?.tier ?? 0;
          const multi = def.tiers.length > 1;
          return (
            <li key={def.id} className={`ach ${rec ? `ach-${multi ? TIER_CLASS[tier as 1 | 2 | 3] : 'gold'}` : 'ach-locked'}`} title={tierHint(def)}>
              <span className="ach-icon" aria-hidden="true">{def.icon}</span>
              <span className="ach-body">
                <strong>{def.title}</strong>
                {rec && multi && <span className="ach-tier">{TIER_LABEL[rec.tier]}</span>}
                <span className="ach-desc">{def.desc}</span>
                {multi && (
                  <span className="ach-steps" aria-label="Stupně">
                    {def.tiers.map((_, i) => (
                      <span key={i} className={`ach-step ${i < tier ? `on ${TIER_CLASS[(i + 1) as 1 | 2 | 3]}` : ''}`}>{tierThresholdText(def, i)}</span>
                    ))}
                  </span>
                )}
                {rec && <span className="ach-when">{formatDate(rec.date)} · {rec.clubName}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Krátké upozornění při získání odznaku (bez okna, samo zmizí). */
export function AchievementToast({ game }: { game: GameState }) {
  const seen = useRef<Record<string, number> | null>(null);
  const gameKey = useRef<string | null>(null);
  const lastDate = useRef<string | null>(null);
  const [shown, setShown] = useState<{ key: string; text: string }[]>([]);
  const unlocked = game.achievements?.unlocked;
  useEffect(() => {
    const now: Record<string, number> = {};
    for (const [id, r] of Object.entries(unlocked ?? {})) now[id] = r.tier;
    const before = seen.current;
    const key = `${game.seed}-${game.owner.clubId}`;
    const sameGame = gameKey.current === key && game.date >= (lastDate.current ?? '');
    seen.current = now;
    gameKey.current = key;
    lastDate.current = game.date;
    // Při prvním vykreslení a po nahrání jiné hry (nebo zálohy) se nic neukazuje.
    if (!before || !sameGame) return;
    const fresh = Object.entries(now).filter(([id, t]) => (before[id] ?? 0) < t);
    if (!fresh.length) return;
    const items = fresh.slice(0, 3).map(([id, t]) => {
      const def = achievementDef(id);
      return { key: `${id}-${t}-${Date.now()}`, text: def ? `${def.icon} ${def.title}${def.tiers.length > 1 ? ` (${TIER_LABEL[t as 1 | 2 | 3]})` : ''}` : id };
    });
    if (fresh.length > 3) items.push({ key: `more-${Date.now()}`, text: `a další ${fresh.length - 3}` });
    setShown((s) => [...s, ...items].slice(-4));
  }, [unlocked]);
  useEffect(() => {
    if (!shown.length) return;
    const timer = window.setTimeout(() => setShown([]), 7000);
    return () => window.clearTimeout(timer);
  }, [shown]);
  if (!shown.length) return null;
  return (
    <div className="ach-toast" role="status" aria-live="polite">
      <span className="ach-toast-head">Nový odznak</span>
      {shown.map((x) => (
        <span key={x.key}>{x.text}</span>
      ))}
      <button className="linkbtn" onClick={() => setShown([])} aria-label="Zavřít upozornění">Zavřít</button>
    </div>
  );
}

/** Výroční zpráva: výzvy sezóny a odznaky. */
export function ReportW3Section({ report }: { report: SeasonReport }) {
  if (!report.challenges?.length && !report.achievements?.length) return null;
  return (
    <>
      {report.challenges && report.challenges.length > 0 && (
        <>
          <h3>Výzvy sezóny</h3>
          <ul className="plain small">{report.challenges.map((m, i) => <li key={i}>{/: splněno/.test(m) ? '✅' : '▫️'} {m}</li>)}</ul>
        </>
      )}
      {report.achievements && report.achievements.length > 0 && (
        <>
          <h3>Nové odznaky</h3>
          <p className="small">{report.achievements.join(' · ')}</p>
        </>
      )}
    </>
  );
}
