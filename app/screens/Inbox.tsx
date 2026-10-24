/**
 * V2 (B5): jedna schránka rozhodnutí. Všechno, co čeká na majitele – situace (events), volby
 * fanoušků (oslava, výjezd, závazek, rada), fórum, přestupy, rozpočet, přijímačky, akce na stadionu
 * a nabídky projektů – seřazené podle termínu. U každé položky je vidět výchozí volba, která platí,
 * když nerozhodnete.
 */
import { useState, type ReactNode } from 'react';
import {
  addDays,
  awayTripOption,
  budgetApproved,
  budgetDue,
  councilView,
  daysUntil,
  fansOf,
  forumThreads,
  formatShortDate,
  resolveEvent,
  sideGoalsPending,
  visionPickPending,
  type GameEvent,
  type GameState,
} from '../../engine';
import { Notice } from '../components';
import { money } from '../format';

const clubName = (game: GameState, id: string) => (game.clubs[id] ? game.clubs[id].shortName : 'Zahraniční klub');
import { PlayerLink } from '../nav';
import { Icon } from '../icons';
import { PressConferenceCard } from './Press';

export interface InboxItem {
  id: string;
  title: string;
  text?: string;
  /** Termín (ISO datum); bez termínu na konec. */
  due?: string;
  /** Co platí bez rozhodnutí. */
  fallback?: string;
  icon: string;
  /** Kam odkaz vede (navmap). */
  link?: string;
  linkLabel?: string;
  event?: GameEvent;
}

/** Sesbírá otevřená rozhodnutí ze všech systémů, seřazená podle naléhavosti. */
export function inboxItems(game: GameState, extra: InboxItem[] = []): InboxItem[] {
  const out: InboxItem[] = [];
  for (const e of game.events) {
    out.push({ id: `e-${e.id}`, title: e.title, text: e.text, due: e.expires, fallback: e.options.find((o) => o.id === e.defaultOption)?.label, icon: 'inbox', event: e });
  }
  const f = fansOf(game);
  if (f.celebration) out.push({ id: 'fans-oslava', title: `Oslava: ${f.celebration.reason}`, due: f.celebration.deadline, fallback: 'skromná oslava', icon: 'fans', link: 'klub/fanousci', linkLabel: 'Vybrat oslavu' });
  const trip = awayTripOption(game);
  if (trip) out.push({ id: 'fans-vyjezd', title: `Výjezd fanoušků: ${trip.match.label}`, due: trip.match.date, fallback: trip.options.find((o) => o.id === trip.chosen)?.label, icon: 'kotel', link: 'klub/fanousci', linkLabel: 'Nastavit výjezd' });
  if (f.commitment) out.push({ id: 'fans-zavazek', title: `Závazek z ankety: ${f.commitment.label}`, due: f.commitment.due, fallback: f.commitment.respectLabel, icon: 'fans', link: 'klub/fanousci', linkLabel: 'Rozhodnout' });
  const council = councilView(game);
  if (council) out.push({ id: 'fans-rada', title: `Fanouškovská rada: ${council.title}`, due: council.deadline, fallback: council.canPostpone ? 'odložit' : 'odmítnout', icon: 'fans', link: 'klub/fanousci', linkLabel: 'Rozhodnout' });
  const open = forumThreads(game).filter((t) => !t.closed && !t.reply);
  if (open.length) out.push({ id: 'forum', title: `Fórum: ${open.length === 1 ? 'vlákno čeká' : `${open.length} vlákna čekají`} na vaši odpověď`, text: open[0].title, icon: 'news', link: 'klub/forum', linkLabel: 'Na fórum', fallback: 'bez odpovědi' });
  if (!budgetApproved(game) && !game.owner.ousted) out.push({ id: 'rozpocet', title: 'Schválit rozpočet sezóny', due: budgetDue(game), fallback: 'návrh finančního ředitele', icon: 'penize', link: 'penize/rozpocet', linkLabel: 'K rozpočtu' });
  const neg = game.market.negotiation;
  if (neg && !['hotovo', 'neuspech'].includes(neg.stage)) out.push({ id: 'jednani', title: 'Rozjednaný přestup čeká na vaši nabídku', icon: 'prestup', link: 'trh/prestupy', linkLabel: 'Pokračovat', fallback: 'jednání vyprší' });
  for (const o of game.market.offers) {
    const p = game.players[o.playerId];
    const buyer = game.clubs[o.buyerId]?.shortName ?? clubName(game, o.buyerId);
    out.push({ id: `nab-${o.id}`, title: `${buyer} nabízí ${money(o.fee)} za ${p ? `${p.firstName} ${p.lastName}` : 'hráče'}`, due: o.expires, fallback: 'nabídka propadne', icon: 'prestup', link: 'trh/prestupy', linkLabel: 'Posoudit' });
  }
  if (game.market.proposals.length) out.push({ id: 'navrhy', title: `Návrhy posil od ředitele: ${game.market.proposals.length}`, icon: 'skauting', link: 'trh/prestupy', linkLabel: 'Projít', fallback: 'nic se nekoupí' });
  const yi = game.youthIntake;
  if (yi && yi.season === game.season && yi.deadline >= game.date && yi.chosen.length < yi.slots) out.push({ id: 'dorost', title: `Přijímačky dorostu: vybráno ${yi.chosen.length} z ${yi.slots}`, due: yi.deadline, fallback: 'vyberou trenéři mládeže', icon: 'trenink', link: 'tym/kadr', linkLabel: 'Vybrat' });
  for (const ev of game.eventOffers ?? []) {
    if (ev.accepted || ev.expires < game.date) continue;
    out.push({ id: `akce-${ev.id}`, title: `Nabídka akce na stadionu: ${ev.label}`, due: ev.expires, fallback: 'nabídka propadne', icon: 'stadium', link: 'klub/stadion', linkLabel: 'Posoudit' });
  }
  const sgp = sideGoalsPending(game);
  if (sgp) out.push({ id: 'vedlejsi-cile', title: 'Vyberte vedlejší cíle sezóny', due: sgp.pickBy, icon: 'projekt', link: 'klub/projekty', linkLabel: 'Vybrat', fallback: 'cíle vybere vedení' });
  const vpick = visionPickPending(game); // W5: vize klubu v prvních krocích
  if (vpick) out.push({ id: 'vize', title: 'Vize klubu na 3 roky', text: 'Podle vize vedení nastaví cíle, nákupy ředitele a nabídku projektů.', due: vpick.deadline, fallback: 'Vyvážená cesta', icon: 'projekt', link: 'klub/majitel', linkLabel: 'Vybrat vizi' });
  out.push(...extra);
  return out.sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));
}

function dueLabel(game: GameState, due: string): { text: string; tone: string } {
  const d = daysUntil(game, due);
  if (d <= 0) return { text: 'dnes', tone: 'bad' };
  if (d === 1) return { text: 'zítra', tone: 'bad' };
  if (d <= 3) return { text: `za ${d} dny`, tone: 'warn' };
  return { text: formatShortDate(due), tone: 'neutral' };
}

export function InboxCard({ game, onChange, onNavigate, extra, limit = 4 }: { game: GameState; onChange: (g: GameState) => void; onNavigate: (target: string) => void; extra?: InboxItem[]; limit?: number }) {
  const [message, setMessage] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const items = inboxItems(game, extra);
  const shown = all ? items : items.slice(0, limit);
  const weekEnd = addDays(game.date, 7);
  const urgent = items.filter((i) => i.due && i.due <= weekEnd).length;
  return (
    <section className="card inbox-card" aria-label="Schránka rozhodnutí">
      <div className="card-head">
        <h2><Icon name="inbox" size={18} /> Schránka rozhodnutí</h2>
        {items.length > 0 && <span className={`badge ${urgent ? 'badge-warn' : 'badge-neutral'}`}>{items.length}{urgent ? ` · ${urgent} tento týden` : ''}</span>}
      </div>
      <Notice message={message} />
      {items.length === 0 ? (
        <p className="muted inbox-empty"><Icon name="check" size={16} /> Nic nečeká. Vedení pracuje na prioritách měsíce, můžete hrát dál.</p>
      ) : (
        <ul className="plain inbox-list">
          {shown.map((it) => {
            const due = it.due ? dueLabel(game, it.due) : undefined;
            const isOpen = openId === it.id || (!openId && it === shown[0] && !!it.event);
            let body: ReactNode = null;
            if (it.event && isOpen) {
              const e = it.event;
              body = e.template === 'tiskovka-zapas' && game.press?.current?.eventId === e.id ? (
                <ul className="plain inbox-press"><PressConferenceCard game={game} event={e} onChange={onChange} onMessage={setMessage} /></ul>
              ) : (
                <>
                  <p className="muted small inbox-text">{e.text}</p>
                  {e.playerId && game.players[e.playerId] && <p className="small"><PlayerLink id={e.playerId}>Karta hráče</PlayerLink></p>}
                  <div className="inbox-options">
                    {e.options.map((o) => (
                      <button
                        key={o.id}
                        className={o.id === e.defaultOption ? 'opt-default' : ''}
                        title={o.hint}
                        onClick={() => {
                          const r = resolveEvent(game, e.id, o.id);
                          onChange(r.state);
                          setMessage(r.message);
                          setOpenId(null);
                        }}
                      >
                        <strong>{o.label}</strong>
                        <span className="small">{o.hint}</span>
                        {o.id === e.defaultOption && <span className="opt-tag">výchozí</span>}
                      </button>
                    ))}
                  </div>
                </>
              );
            }
            return (
              <li key={it.id} className={`inbox-item${isOpen ? ' open' : ''}`}>
                <div className="inbox-row">
                  <span className="inbox-icon"><Icon name={it.icon} size={16} /></span>
                  <div className="inbox-main">
                    {it.event ? (
                      <button className="linklike inbox-title" aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? '__none' : it.id)}>{it.title}</button>
                    ) : (
                      <strong className="inbox-title">{it.title}</strong>
                    )}
                    {it.text && !it.event && <span className="muted small inbox-sub">{it.text}</span>}
                    <span className="inbox-meta">
                      {due && <span className={`due due-${due.tone}`}><Icon name="clock" size={13} /> {due.text}</span>}
                      {it.fallback && <span className="muted inbox-fallback">Bez volby: {it.fallback}</span>}
                      {it.link && <button className="inbox-go" onClick={() => onNavigate(it.link!)}>{it.linkLabel ?? 'Otevřít'} ›</button>}
                    </span>
                  </div>
                </div>
                {body}
              </li>
            );
          })}
        </ul>
      )}
      {items.length > limit && (
        <button className="linkbtn" onClick={() => setAll(!all)}>{all ? 'Méně' : `Všechna rozhodnutí (${items.length})`} ›</button>
      )}
    </section>
  );
}
