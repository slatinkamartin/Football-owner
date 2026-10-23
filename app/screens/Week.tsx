/**
 * V2 (B1): domov „Týden“. Na jedné obrazovce: příští zápas s odpočtem (a velký zápas / los),
 * agenda týdne a rádce (V1), schránka rozhodnutí, stav klubu ve 4 číslech, štítek poháru (V3)
 * a krátké zprávy. Desktop ve třech sloupcích, mobil v pořadí podle priority.
 */
import type { ReactNode } from 'react';
import {
  allFixtures,
  clubLabel,
  daysUntil,
  formatDate,
  formatShortDate,
  lastEuroMatch,
  nextEuroMatch,
  nextOwnFixture,
  type GameState,
} from '../../engine';
import { Icon } from '../icons';
import { Crest, Dismissible } from '../ui';
import { BigMatchCard, EuroDrawCard } from './BigMatch';
import { Briefing, Stories } from './Briefing';
import { ClubStatusCard } from './ClubStatus';
import { InboxCard, type InboxItem } from './Inbox';
import { NewsCard, ScenarioCard } from './Overview';
import type { BriefingTask, MilestoneTab } from '../../engine';

export interface StepInfo {
  label: string;
  title: string;
  match: boolean;
  disabled: boolean;
  onStep: () => void;
}

export interface WeekSlots {
  agenda?: ReactNode;
  advisor?: ReactNode;
  cupBadge?: ReactNode;
  cupCard?: ReactNode;
  inboxExtra?: InboxItem[];
  /** Tipy průvodce prvními týdny (B10) u příslušných karet. */
  tips?: { agenda?: ReactNode; inbox?: ReactNode; step?: ReactNode };
}

const dayWord = (n: number) => (n === 1 ? 'den' : n >= 2 && n <= 4 ? 'dny' : 'dní');

/** Příští zápas (liga, pohár i Evropa) s odpočtem a posledním výsledkem. */
export function NextMatchCard({ game, step, onOpenMatch }: { game: GameState; step: StepInfo; onOpenMatch: (id: string) => void }) {
  const own = game.owner.clubId;
  const dom = nextOwnFixture(game);
  const euro = nextEuroMatch(game);
  const useEuro = !!euro && (!dom || euro.date < dom.fixture.date);
  const date = useEuro ? euro!.date : dom?.fixture.date;
  const days = date ? daysUntil(game, date) : undefined;
  const lastDom = allFixtures(game)
    .filter((x) => x.fixture.result && (x.fixture.homeId === own || x.fixture.awayId === own))
    .sort((a, b) => (a.fixture.date < b.fixture.date ? 1 : -1))[0];
  const lastEu = lastEuroMatch(game);
  const club = game.clubs[own];
  let home: { name: string; colors?: [string, string]; own: boolean } | undefined;
  let away: typeof home;
  let compName = '';
  if (useEuro && euro) {
    const o = { name: euro.opponent.name, own: false };
    const me = { name: club.shortName, colors: club.colors, own: true };
    [home, away] = euro.home ? [me, o] : [o, me];
    compName = euro.stage;
  } else if (dom) {
    const h = game.clubs[dom.fixture.homeId];
    const a = game.clubs[dom.fixture.awayId];
    home = { name: h.shortName, colors: h.colors, own: h.id === own };
    away = { name: a.shortName, colors: a.colors, own: a.id === own };
    compName = dom.cup ? `${dom.name}${dom.cup.rounds?.[dom.fixture.round - 1]?.name ? `, ${dom.cup.rounds[dom.fixture.round - 1].name}` : ''}` : `${dom.name}, ${dom.fixture.round}. kolo`;
  }
  const lastShown = lastEu && (!lastDom || lastEu.date > lastDom.fixture.date) ? { label: `${lastEu.home ? club.shortName : lastEu.opponent.name} – ${lastEu.home ? lastEu.opponent.name : club.shortName}`, date: lastEu.date, id: undefined as string | undefined, score: lastEu.result ? `${lastEu.home ? lastEu.result.own : lastEu.result.opp}:${lastEu.home ? lastEu.result.opp : lastEu.result.own}` : '' } : lastDom ? { label: `${clubLabel(game, lastDom.fixture.homeId)} – ${clubLabel(game, lastDom.fixture.awayId)}`, date: lastDom.fixture.date, id: lastDom.fixture.id as string | undefined, score: `${lastDom.fixture.result!.homeGoals}:${lastDom.fixture.result!.awayGoals}` } : undefined;
  return (
    <section className={`card next-match-card${step.match ? ' is-eve' : ''}`} aria-label="Příští zápas">
      <div className="card-head">
        <h2><Icon name="ball" size={18} /> Příští zápas</h2>
        {days !== undefined && (
          <span className={`countdown${days <= 1 ? ' soon' : ''}`}>
            {days <= 0 ? 'dnes' : days === 1 ? 'zítra' : <>za <strong className="num">{days}</strong> {dayWord(days)}</>}
          </span>
        )}
      </div>
      {home && away && date ? (
        <>
          <div className="nm-teams">
            <span className={`nm-team${home.own ? ' own' : ''}`}>
              {home.colors ? <Crest colors={home.colors} name={home.name} size={38} /> : <span className="nm-flag"><Icon name="cup" size={22} /></span>}
              <span>{home.name}</span>
            </span>
            <span className="nm-vs">vs</span>
            <span className={`nm-team${away.own ? ' own' : ''}`}>
              {away.colors ? <Crest colors={away.colors} name={away.name} size={38} /> : <span className="nm-flag"><Icon name="cup" size={22} /></span>}
              <span>{away.name}</span>
            </span>
          </div>
          <p className="muted small center">{formatDate(date, true)} · {compName}</p>
        </>
      ) : (
        <p className="muted">V této sezóně už klub nehraje.</p>
      )}
      <button className={`primary step-cta${step.match ? ' match-btn' : ''}`} disabled={step.disabled} title={step.title} onClick={step.onStep}>
        <Icon name={step.match ? 'play' : 'next'} size={18} /> {step.label}
      </button>
      {lastShown && (
        <p className="small nm-last">
          <span className="muted">Naposledy {formatShortDate(lastShown.date)}:</span> {lastShown.label} <strong className="num">{lastShown.score}</strong>
          {lastShown.id && <> · <button className="linkbtn" onClick={() => onOpenMatch(lastShown.id!)}>náhled</button></>}
        </p>
      )}
    </section>
  );
}

export function Week({
  game,
  onChange,
  onNavigate,
  onOpenMatch,
  step,
  slots,
  weekKey,
}: {
  game: GameState;
  onChange: (g: GameState) => void;
  onNavigate: (target: string) => void;
  onOpenMatch: (id: string) => void;
  step: StepInfo;
  slots: WeekSlots;
  weekKey: string;
}) {
  const legacyNav = (tab: MilestoneTab | 'majitel', sub?: BriefingTask['sub']) => onNavigate(sub ? `${tab === 'finance' ? 'penize' : tab}/${sub}` : tab);
  return (
    <div className="week">
      <div className="week-grid">
        <div className="week-col week-col-a">
          <div className="w-slot w-draw"><EuroDrawCard game={game} onChange={onChange} /></div>
          <div className="w-slot w-big"><BigMatchCard game={game} onChange={onChange} /></div>
          <div className="w-slot w-tip-step">{slots.tips?.step}</div>
          <div className="w-slot w-next"><NextMatchCard game={game} step={step} onOpenMatch={onOpenMatch} /></div>
          <div className="w-slot w-tip-agenda">{slots.tips?.agenda}</div>
          <div className="w-slot w-agenda">{slots.agenda}</div>
        </div>
        <div className="week-col week-col-b">
          <div className="w-slot w-tip-inbox">{slots.tips?.inbox}</div>
          <div className="w-slot w-inbox"><InboxCard game={game} onChange={onChange} onNavigate={onNavigate} extra={slots.inboxExtra} /></div>
          <div className="w-slot w-advisor">
            <Dismissible id="radce" resetKey={weekKey}>
              {slots.advisor ?? <Briefing game={game} onNavigate={legacyNav} />}
            </Dismissible>
          </div>
        </div>
        <div className="week-col week-col-c">
          <div className="w-slot w-cup week-cup">{slots.cupBadge}</div>
          <div className="w-slot w-status"><ClubStatusCard game={game} onNavigate={onNavigate} /></div>
          <div className="w-slot w-cupcard">{slots.cupCard}</div>
          <div className="w-slot w-news">
            <Dismissible id="zpravy" resetKey={weekKey}>
              <NewsCard game={game} onOpenMatch={onOpenMatch} initial={4} title="Zprávy týdne" className="card" />
            </Dismissible>
          </div>
        </div>
      </div>
      <div className="week-more">
        {slots.advisor && <Briefing game={game} onNavigate={legacyNav} />}
        <ScenarioCard game={game} />
        <Stories game={game} onNavigate={legacyNav} />
      </div>
    </div>
  );
}
