import {
  competitionOf,
  computeTable,
  dressingRoom,
  formatShortDate,
  pulseRows,
  seasonStories,
  weeklyBriefing,
  type BriefingTask,
  type GameState,
  type MilestoneTab,
  type Story,
  type StoryKind,
} from '../../engine';
import { Badge, Meter } from '../components';

type Nav = (tab: MilestoneTab, sub?: BriefingTask['sub']) => void;

/** Týdenní porada: úkoly na tento týden s odkazem tam, kde se řeší. */
export function Briefing({ game, onNavigate }: { game: GameState; onNavigate: Nav }) {
  // Rozhodnutí má na Přehledu vlastní kartu, v poradě se neopakují.
  const tasks = weeklyBriefing(game).filter((t) => !t.id.startsWith('e-'));
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

type StoryNav = (tab: MilestoneTab, sub?: BriefingTask['sub']) => void;

/** Proč příběh začal a podle čeho se rozhodne (podle druhu). */
const STORY_WHY: Record<StoryKind, string> = {
  krize: 'Tým prohrál tři ligové zápasy po sobě. Média a fanoušci čekají, jak se k trenérovi postavíte.',
  hodnoceni: 'Podzim skončil. Jako majitel hodnotíte trenéra podle umístění proti cíli sezóny.',
  hvezda: 'Jeden z nejlepších hráčů kádru chce do silnější ligy. Jeho morálka (a výkon) závisí na vaší reakci.',
  media: 'Pověst klubu u médií je nízká nebo výsledky zaostávají za cílem. Novináři čekají na vaši reakci.',
  kabina: 'Nálada v kabině je nízká a dvě opory se pohádaly. Spor se přenáší na celý tým.',
};

const plural3 = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n >= 2 && n <= 4 ? few : many);

/** Co se teď čeká, kdy se rozhodne a co pro to můžete udělat. */
function storyNow(game: GameState, s: Story): { when: string; todo: string; progress?: string; link?: { tab: MilestoneTab; label: string } } {
  const event = game.events.find((e) => e.storyId === s.id);
  if (s.waiting === 'rozhodnuti') {
    const def = event?.options.find((o) => o.id === event.defaultOption)?.label;
    return {
      when: event ? `rozhodněte do ${formatShortDate(event.expires)}` : 'čeká na vaše rozhodnutí',
      todo: `Vyberte jednu z možností ve schránce rozhodnutí na domově Týden.${def ? ` Když nerozhodnete, platí „${def}“.` : ''}`,
    };
  }
  const comp = competitionOf(game, game.owner.clubId);
  const row = comp ? computeTable(comp, game).find((r) => r.clubId === game.owner.clubId) : undefined;
  if (s.waiting === 'zapasy') {
    const need = Number(s.data.need ?? 3);
    const min = Number(s.data.min ?? 4);
    const played = Math.max(0, (row?.played ?? 0) - Number(s.data.played ?? 0));
    const gained = Math.max(0, (row?.points ?? 0) - Number(s.data.points ?? 0));
    const left = s.matchesLeft ?? Math.max(0, need - played);
    return {
      when: `rozhodne se za ${left} ${plural3(left, 'zápas', 'zápasy', 'zápasů')}`,
      progress: `Potřeba aspoň ${min} ${plural3(min, 'bod', 'body', 'bodů')} z ${need} zápasů: zatím ${gained} ${plural3(gained, 'bod', 'body', 'bodů')} z ${played}.`,
      todo: 'Teď rozhodují výsledky. Pomoct může posila v Přestupech nebo spokojená kabina (Kádr).',
      link: { tab: 'kadr', label: 'Kádr' },
    };
  }
  if (s.waiting === 'okno') {
    return {
      when: 'v nejbližším přestupním okně',
      todo: 'Až se otevře okno, přijde za hráče nabídka ze zahraničí. Slíbili jste odchod: když ji odmítnete, hráč i média to vezmou zle.',
      link: { tab: 'prestupy', label: 'Přestupy' },
    };
  }
  if (s.waiting === 'nabidka') {
    return {
      when: s.until ? `nabídka platí do ${formatShortDate(s.until)}` : 'čeká na vaši odpověď',
      todo: 'Nabídku na hráče najdete v Přestupech (Návrhy a nabídky). Přijetím dodržíte slib.',
      link: { tab: 'prestupy', label: 'Přestupy' },
    };
  }
  if (s.waiting === 'tydny') {
    if (s.kind === 'media') {
      const played = Math.max(0, (row?.played ?? 0) - Number(s.data.played ?? 0));
      const gained = Math.max(0, (row?.points ?? 0) - Number(s.data.points ?? 0));
      return {
        when: s.until ? `vyhodnotí se ${formatShortDate(s.until)}` : 'běží',
        progress: `Potřeba aspoň 1,3 bodu na zápas: zatím ${gained} ${plural3(gained, 'bod', 'body', 'bodů')} z ${played} ${plural3(played, 'zápasu', 'zápasů', 'zápasů')}.`,
        todo: 'Rozhodují výsledky do termínu.',
      };
    }
    const room = dressingRoom(game);
    return {
      when: s.until ? `vyhodnotí se ${formatShortDate(s.until)}` : 'běží',
      progress: `Spor skončí dobře, když bude nálada v kabině aspoň 50 (teď ${Math.round(room.morale)}).`,
      todo: 'Náladu zvednou výhry a spokojení hráči: řešte nespokojené a málo hrající hráče v Kádru.',
      link: { tab: 'kadr', label: 'Kádr' },
    };
  }
  return { when: s.until ? `vyhodnotí se ${formatShortDate(s.until)}` : 'běží', todo: '' };
}

/** Příběhy sezóny: co se děje, proč, co můžete udělat, kdy se rozhodne a jak to dopadlo. */
export function Stories({ game, onNavigate }: { game: GameState; onNavigate?: StoryNav }) {
  const stories = seasonStories(game).slice().reverse();
  if (!stories.length) return null;
  const active = stories.filter((s) => !s.done);
  const done = stories.filter((s) => s.done);
  return (
    <section className="card wide stories">
      <h2>Příběhy sezóny</h2>
      <p className="muted small">Delší situace kolem klubu, které se vyvíjejí několik týdnů. Každý příběh má začátek, vaše rozhodnutí a konec.</p>
      {active.length > 0 && (
        <ul className="plain story-list">
          {active.map((s) => {
            const now = storyNow(game, s);
            const decisions = s.log.filter((l) => l.startsWith('Rozhodnutí:'));
            return (
              <li key={s.id} className="story">
                <div className="row-between">
                  <strong>{s.title}</strong>
                  <Badge tone="warn">{now.when}</Badge>
                </div>
                <dl className="story-facts small">
                  <dt>Co se děje</dt>
                  <dd>{s.log[0]}</dd>
                  <dt>Proč</dt>
                  <dd>{STORY_WHY[s.kind]}</dd>
                  {decisions.length > 0 && (
                    <>
                      <dt>Vaše rozhodnutí</dt>
                      <dd>{decisions.map((d) => d.replace(/^Rozhodnutí:\s*/, '').replace(/\.$/, '')).join(' → ')}</dd>
                    </>
                  )}
                  {now.progress && (
                    <>
                      <dt>Jak to vypadá</dt>
                      <dd>{now.progress}</dd>
                    </>
                  )}
                  {now.todo && (
                    <>
                      <dt>Co můžete udělat</dt>
                      <dd>
                        {now.todo}
                        {now.link && onNavigate && (
                          <> <button className="linkbtn" onClick={() => onNavigate(now.link!.tab)}>{now.link.label} ›</button></>
                        )}
                      </dd>
                    </>
                  )}
                </dl>
              </li>
            );
          })}
        </ul>
      )}
      {done.length > 0 && (
        <>
          <h3 className="story-done-head">Uzavřené</h3>
          <ul className="plain story-list done">
            {done.slice(0, 6).map((s) => (
              <li key={s.id} className="story">
                <div className="row-between">
                  <strong>{s.title}</strong>
                  <Badge tone={s.outcome === 'dobre' ? 'good' : s.outcome === 'spatne' ? 'bad' : 'neutral'}>{s.outcome === 'dobre' ? 'dobrý konec' : s.outcome === 'spatne' ? 'špatný konec' : 'uzavřeno'}</Badge>
                </div>
                <p className="small"><span className="muted">Jak to dopadlo:</span> {s.log[s.log.length - 1]}</p>
                {s.log.length > 2 && (
                  <details className="small">
                    <summary className="muted">Celý průběh</summary>
                    <ol className="story-log">
                      {s.log.map((l, i) => <li key={i}>{l}</li>)}
                    </ol>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
