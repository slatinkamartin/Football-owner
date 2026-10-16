import { useState } from 'react';
import {
  bonusText,
  clubLabel,
  contracts,
  defaultTicketPrice,
  EUROPE_LABEL,
  formatDate,
  playerName,
  seasonLabel,
  seasonTicketHolders,
  signSponsor,
  SLOT_LABEL,
  SLOTS,
  sponsorMonthly,
  tierOf,
  tvMonthly,
  type ActionResult,
  type GameState,
  type SponsorOffer,
} from '../../../engine';
import { Badge, Notice } from '../../components';
import { money, num } from '../../format';
import { PlayerLink } from '../../nav';

const STYLE_LABEL: Record<SponsorOffer['style'], string> = { jistota: 'Jistota na 3 roky', bonus: 'Nižší částka s bonusem', kratka: 'Krátká na 1 rok' };

/** Příjmy: sponzorská místa a nabídky, vstupné, TV a Evropa, pohledávky z prodejů hráčů. */
export function FinanceIncome({ game, onChange, onBudget }: { game: GameState; onChange: (g: GameState) => void; onBudget: () => void }) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const apply = (r: ActionResult) => {
    if (r.state !== game) onChange(r.state);
    setMessage({ text: r.message, ok: r.ok });
  };
  const club = game.clubs[game.owner.clubId];
  const tier = tierOf(game, club.id);
  const sp = sponsorMonthly(game);
  const signed = contracts(game);
  const offers = game.sponsorOffers ?? [];
  const homeGames = Object.values(game.competitions)
    .flatMap((c) => c.fixtures)
    .filter((f) => f.homeId === club.id && f.result);
  const avgAttendance = homeGames.length ? homeGames.reduce((a, f) => a + f.result!.attendance, 0) / homeGames.length : 0;
  const europe = game.europe?.season === game.season ? game.europe.entries.find((e) => e.clubId === club.id) : undefined;
  const receivables = (game.payments ?? []).filter((p) => p.to === club.id).sort((a, b) => (a.due < b.due ? -1 : 1));
  const sellOn = Object.values(game.players).filter((p) => p.sellOn?.clubId === club.id);

  return (
    <div className="stack">
      <Notice message={message?.text ?? null} ok={message?.ok} />
      <section className="card">
        <div className="row-between">
          <h2>Sponzorská místa</h2>
          <span className="muted small">smlouvy {money(sp.contracts * 12)} ročně · drobní sponzoři a reklama {money(sp.small * 12)}</span>
        </div>
        <p className="muted small">
          Každé místo má svou cenu podle velikosti a pověsti klubu. Na volná místa chodí nabídky na 1–3 roky. Pevná smlouva chrání před propadem, krátká dovolí po úspěšné sezóně vyjednat víc.
          Obchodní ředitel přinese víc a lepších nabídek, marketing zvedá cenu.
        </p>
        <div className="slots">
          {SLOTS.map((slot) => {
            const c = signed.find((x) => x.slot === slot);
            const list = offers.filter((o) => o.slot === slot);
            return (
              <div key={slot} className={`subcard ${c ? '' : 'empty'}`}>
                <div className="row-between">
                  <strong>{SLOT_LABEL[slot]}</strong>
                  {c ? <Badge tone="good">do {seasonLabel(c.untilSeason)}</Badge> : <Badge tone="warn">volné</Badge>}
                </div>
                {c ? (
                  <>
                    <p className="small">{c.name}: {money(c.annual)} ročně</p>
                    {c.bonus && <p className="small muted">{bonusText(c)}</p>}
                  </>
                ) : list.length ? (
                  <ul className="plain offers">
                    {list.map((o) => (
                      <li key={o.id}>
                        <div className="row-between">
                          <span className="small"><strong>{o.name}</strong> · {STYLE_LABEL[o.style]}</span>
                          <button onClick={() => apply(signSponsor(game, o.id))}>Podepsat</button>
                        </div>
                        <span className="small">{money(o.annual)} ročně{o.bonus ? `, ${bonusText(o)}` : ''}</span>
                        <span className="muted small"> · platí do {formatDate(o.expires)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="small muted">Nové nabídky přijdou začátkem měsíce.</p>
                )}
                {slot === 'stadion' && !c && <p className="small muted">Prodej názvu stadionu fanoušky naštve (−6).</p>}
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid">
        <section className="card">
          <h2>Vstupné</h2>
          <dl className="kv">
            <dt>Vstupenka</dt>
            <dd>{club.policy.ticketPrice} Kč <span className="muted small">(běžně {defaultTicketPrice(tier)})</span></dd>
            <dt>Permanentky</dt>
            <dd>{num(seasonTicketHolders(game))} ks</dd>
            <dt>Průměrná návštěva</dt>
            <dd>{avgAttendance ? `${num(avgAttendance)} (${Math.round((avgAttendance / club.stadium.capacity) * 100)} %)` : '–'}</dd>
            <dt>Vstupné v sezóně</dt>
            <dd>{money(club.finance.season.vstupne)}</dd>
          </dl>
          <button className="linkbtn" onClick={onBudget}>Upravit ceny v rozpočtu ›</button>
        </section>
        <section className="card">
          <h2>TV, odměny a Evropa</h2>
          <dl className="kv">
            <dt>TV práva</dt>
            <dd>{money(tvMonthly(tier))} měsíčně</dd>
            {game.tvAdvance && (
              <>
                <dt>Záloha na TV</dt>
                <dd className="neg">−{money(game.tvAdvance.monthly)} ještě {game.tvAdvance.monthsLeft}×</dd>
              </>
            )}
            <dt>Evropské poháry</dt>
            <dd>{europe ? (game.europe!.resolved ? (europe.result === 'predkola' ? EUROPE_LABEL.predkola : EUROPE_LABEL[europe.result]) : `předkola ${EUROPE_LABEL[europe.entry]}`) : 'nehrajeme'}</dd>
            {europe && (
              <>
                <dt>{game.europe!.resolved ? 'Příjmy z Evropy' : 'Odhad příjmů'}</dt>
                <dd>{money(europe.revenue)}</dd>
              </>
            )}
          </dl>
        </section>
        <section className="card">
          <h2>Pohledávky z prodejů</h2>
          {receivables.length === 0 && sellOn.length === 0 ? (
            <p className="muted small">Žádné splátky ani podíly z dalších prodejů. Při prodeji hráče do české ligy si můžete vymínit podíl z jeho dalšího přestupu.</p>
          ) : (
            <ul className="plain small">
              {receivables.map((p) => (
                <li key={p.id} className="row-between"><span>{formatDate(p.due)} · {p.note} ({clubLabel(game, p.from)})</span><span className="pos">{money(p.amount)}</span></li>
              ))}
              {sellOn.map((p) => (
                <li key={p.id} className="row-between">
                  <span>Podíl {Math.round(p.sellOn!.pct * 100)} % z dalšího prodeje: <PlayerLink id={p.id}>{playerName(p)}</PlayerLink> ({clubLabel(game, p.clubId)})</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
