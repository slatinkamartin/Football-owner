import { achievementCount, achievementDef, achievementsOf, formatDate, longEffectsMonthly, longEffectsOf, TIER_LABEL, type GameState } from '../../engine';
import { money } from '../format';

/** Dlouhodobé efekty velkých rozhodnutí (záložka Majitel). */
export function LongEffectsCard({ game }: { game: GameState }) {
  const { active, ended } = longEffectsOf(game);
  const monthly = longEffectsMonthly(game);
  return (
    <section className="card">
      <div className="row-between">
        <h2>Dlouhodobé závazky</h2>
        {active.length > 0 && monthly !== 0 && <span className={`small ${monthly < 0 ? 'neg' : 'pos'}`}>{monthly > 0 ? '+' : '−'}{money(Math.abs(monthly))} měsíčně</span>}
      </div>
      {active.length === 0 ? (
        <p className="muted small">Zatím žádné. Jednou dvakrát za sezónu přijde velké rozhodnutí (prodej stadionu, partnerství, fanouškovský podíl…), jehož důsledky trvají roky. Přijatá rozhodnutí se zobrazí tady.</p>
      ) : (
        <ul className="plain long-effects">
          {active.map((e) => (
            <li key={e.id}>
              <div className="row-between">
                <strong>{e.label}</strong>
                <span className="small muted">do {formatDate(e.until)}</span>
              </div>
              <div className="small">{e.detail}</div>
              <div className="small muted">
                {e.monthly ? `${e.monthly > 0 ? '+' : '−'}${money(Math.abs(e.monthly))} měsíčně${e.months ? ' (jen jaro)' : ''}` : ''}
                {e.saleLevy ? `${e.monthly ? ' · ' : ''}${Math.round(e.saleLevy * 100)} % z prodejů hráčů` : ''}
                {e.fanMood ? `${e.monthly || e.saleLevy ? ' · ' : ''}fanoušci ${e.fanMood > 0 ? '+' : '−'}${Math.abs(e.fanMood).toLocaleString('cs-CZ')} měsíčně` : ''}
                {e.total ? ` · zatím celkem ${e.total > 0 ? '+' : '−'}${money(Math.abs(e.total))}` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
      {ended.length > 0 && <p className="muted small">Skončilo: {ended.map((e) => e.label).join(', ')}.</p>}
    </section>
  );
}

/** Souhrn odznaků na záložce Majitel (celá mřížka je v záložce Hra). */
export function AchievementsSummaryCard({ game }: { game: GameState }) {
  const count = achievementCount(game);
  const recent = Object.entries(achievementsOf(game).unlocked)
    .sort((a, b) => (a[1].date < b[1].date ? 1 : -1))
    .slice(0, 4);
  return (
    <section className="card">
      <div className="row-between">
        <h2>Odznaky</h2>
        <span className="small"><strong>{count.unlocked}</strong> z {count.total}{count.gold ? ` · zlatých ${count.gold}` : ''}</span>
      </div>
      {recent.length === 0 ? (
        <p className="muted small">Zatím žádný. Přehled všech odznaků najdete v záložce Hra.</p>
      ) : (
        <ul className="plain small">
          {recent.map(([id, r]) => {
            const def = achievementDef(id);
            return def ? (
              <li key={id} className="row-between">
                <span>{def.icon} {def.title}{def.tiers.length > 1 ? ` (${TIER_LABEL[r.tier]})` : ''}</span>
                <span className="muted">{formatDate(r.date)}</span>
              </li>
            ) : null;
          })}
        </ul>
      )}
      <p className="muted small">Všechny odznaky a co je k nim potřeba: záložka Hra › Úspěchy.</p>
    </section>
  );
}

/** Karty W3 na záložce Majitel. */
export function OwnerW3Cards({ game }: { game: GameState }) {
  return (
    <>
      <LongEffectsCard game={game} />
      <AchievementsSummaryCard game={game} />
    </>
  );
}
