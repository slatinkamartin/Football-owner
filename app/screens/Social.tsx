import { formatShortDate, rivalryOf, rivalryStory, setSocialTone, socialSummary, TONE_LABEL, type ActionResult, type GameState, type SocialTone } from '../../engine';
import { Badge, Meter } from '../components';
import { money, num } from '../format';
import { PostView } from './PostMatch';

const TONES: SocialTone[] = ['sympaticky', 'profesionalni', 'kontroverzni'];

/** W2: karta Sociální sítě na záložce Majitel. */
export function SocialCard({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const s = socialSummary(game);
  return (
    <section className="card social-card">
      <div className="row-between">
        <h2>Sociální sítě</h2>
        {s.hashtag && <Badge tone="good">trenduje {s.hashtag}</Badge>}
      </div>
      <div className="social-stats">
        <div>
          <span className="pc-num">{num(s.followers)}</span>
          <span className="muted small">sledujících{s.change !== 0 && <> ({s.change > 0 ? '+' : ''}{num(s.change)} za měsíc)</>}</span>
        </div>
        <div>
          <span className="pc-num">{s.reach} %</span>
          <span className="muted small">dosah příspěvků</span>
        </div>
        <div>
          <span className="pc-num">{money(s.income)}</span>
          <span className="muted small">měsíčně z e-shopu a partnerů</span>
        </div>
      </div>
      <dl className="kv meters">
        <dt>Dosah</dt>
        <dd><Meter value={s.reach} max={60} /> {s.reach} %</dd>
        <dt>Vliv na sponzory</dt>
        <dd>{s.sponsorEffect > 0 ? <span className="pos">vztahy +1 měsíčně</span> : s.sponsorEffect < 0 ? <span className="neg">vztahy −1 měsíčně</span> : 'neutrální'}</dd>
        <dt>Správce sítí</dt>
        <dd>{s.manager !== undefined ? <>ano, schopnosti {s.manager}</> : <span className="muted">nemáte (Vedení › Další ředitelé)</span>}</dd>
      </dl>
      <h3>Tón komunikace</h3>
      <div className="segmented wrap" role="group" aria-label="Tón komunikace">
        {TONES.map((t) => (
          <button key={t} className={s.tone === t ? 'active' : ''} aria-pressed={s.tone === t} onClick={() => onResult(setSocialTone(game, t))}>
            {TONE_LABEL[t].label}
          </button>
        ))}
      </div>
      <p className="muted small">{TONE_LABEL[s.tone].hint}</p>
      <h3>Poslední příspěvky</h3>
      {s.posts.length === 0 ? (
        <p className="muted small">Zatím nic. Příspěvky přibudou po velkých zápasech, přestupech a trofejích (se správcem sítí i průběžně).</p>
      ) : (
        <div className="social-feed">
          {s.posts.map((p) => (
            <PostView key={p.id} post={p} compact />
          ))}
        </div>
      )}
      <p className="muted small">Komentáře píšou vymyšlení fanoušci.</p>
    </section>
  );
}

/** W2: paměť rivality na kartě klubu (bilance, poslední výsledky, legendární momenty). */
export function RivalryPanel({ game, clubId }: { game: GameState; clubId: string }) {
  const mem = rivalryOf(game, clubId);
  const story = rivalryStory(game, clubId);
  if (!mem?.games.length && !story) return null;
  return (
    <section className="rivalry-panel">
      <h3 className="h3-tight">Vzájemné zápasy vaší éry</h3>
      {story && <p className="rivalry-story">{story}</p>}
      {mem && mem.games.length > 0 && (
        <>
          <p className="small">
            Bilance: <strong className="pos">{mem.w} V</strong> · <strong>{mem.d} R</strong> · <strong className="neg">{mem.l} P</strong>
          </p>
          <div className="rivalry-games">
            {mem.games.map((g) => (
              <span key={g.date} className={`score ${g.gf > g.ga ? 'win' : g.gf < g.ga ? 'loss' : 'draw'}`} title={`${formatShortDate(g.date)} · ${g.home ? 'doma' : 'venku'} · ${g.comp}`}>
                {g.gf}:{g.ga}
              </span>
            ))}
          </div>
          {mem.legends.length > 0 && (
            <ul className="plain small rivalry-legends">
              {mem.legends.map((l) => (
                <li key={l.date + l.text}>{l.good ? '★' : '✖'} {l.text}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
