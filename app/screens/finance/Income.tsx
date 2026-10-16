import { useEffect, useState } from 'react';
import {
  bonusText,
  budgetApproved,
  CATERING_SPEND,
  clubLabel,
  competitionOf,
  contracts,
  defaultSeasonTicketPrice,
  defaultTicketPrice,
  eventDamageChance,
  eventIncome,
  EUROPE_LABEL,
  expectedPosition,
  fanshopDetail,
  forecastSeason,
  formatDate,
  leagueBenchmarks,
  playerName,
  prizeMoney,
  seasonLabel,
  seasonTicketDemand,
  seasonTicketHolders,
  seasonTicketPrice,
  signSponsor,
  SLOT_LABEL,
  SLOTS,
  sponsorMonthly,
  ticketPreview,
  tierOf,
  tvMonthly,
  updatePolicy,
  type ActionResult,
  type GameState,
  type Level,
  type SalesPolicy,
  type SponsorOffer,
} from '../../../engine';
import { Badge, Notice } from '../../components';
import { money, num } from '../../format';
import { PlayerLink } from '../../nav';
import type { FinanceTab } from '../Finance';
import { Choices, LineCard, SliderField } from './shared';

const STYLE_LABEL: Record<SponsorOffer['style'], string> = { jistota: 'Jistota na 3 roky', bonus: 'Nižší částka s bonusem', kratka: 'Krátká na 1 rok' };

/** Příjmy: každý řádek rozpočtu má svou kartu s ovládáním, dopadem ve hře a srovnáním s ligou. */
export function FinanceIncome({ game, onChange, onOpen, focus }: { game: GameState; onChange: (g: GameState) => void; onOpen: (tab: FinanceTab, line?: string) => void; focus?: string }) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const apply = (r: ActionResult) => {
    if (r.state !== game) onChange(r.state);
    setMessage({ text: r.message, ok: r.ok });
  };
  const set = (patch: Parameters<typeof updatePolicy>[1]) => {
    setMessage(null);
    onChange(updatePolicy(game, patch));
  };
  useEffect(() => {
    if (focus) document.getElementById(`line-${focus}`)?.scrollIntoView({ block: 'start' });
  }, [focus]);

  const club = game.clubs[game.owner.clubId];
  const tier = tierOf(game, club.id);
  const comp = competitionOf(game, club.id);
  const plan = forecastSeason(game);
  const bench = leagueBenchmarks(game, plan);
  const line = (...keys: string[]) => plan.lines.filter((l) => keys.includes(l.key));
  const income = plan.lines.filter((l) => l.group === 'provoz' && l.amount > 0);
  const total = income.reduce((a, l) => a + l.amount, 0);
  const sold = game.budget?.season === game.season && game.budget.seasonTickets !== undefined;
  const signed = contracts(game);
  const offers = game.sponsorOffers ?? [];
  const sp = sponsorMonthly(game);
  const shop = fanshopDetail(game);
  const europe = game.europe?.season === game.season ? game.europe.entries.find((e) => e.clubId === club.id) : undefined;
  const receivables = (game.payments ?? []).filter((p) => p.to === club.id).sort((a, b) => (a.due < b.due ? -1 : 1));
  const sellOn = Object.values(game.players).filter((p) => p.sellOn?.clubId === club.id);
  const homeGames = (comp?.fixtures ?? []).filter((f) => f.homeId === club.id && f.result);
  const avgAttendance = homeGames.length ? homeGames.reduce((a, f) => a + f.result!.attendance, 0) / homeGames.length : 0;
  const position = comp ? expectedPosition(game, club.id) : 8;
  const events = club.policy.stadiumEvents ?? 0;

  return (
    <div className="stack">
      <Notice message={message?.text ?? null} ok={message?.ok} />
      <section className="card line-index">
        <div className="row-between">
          <h2>Příjmy sezóny {seasonLabel(game.season)}</h2>
          <strong className="pos">{money(total)}</strong>
        </div>
        <p className="muted small">{budgetApproved(game) ? 'Výhled = co už přišlo + odhad zbytku sezóny.' : 'Plán podle nastavení.'} Změny se hned propíší do rozpočtu; schvalují se v záložce Rozpočet.</p>
        <ul className="plain index-list">
          {income.map((l) => (
            <li key={l.key}>
              <button className="linkbtn" onClick={() => document.getElementById(`line-${cardOf(l.key)}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>{l.label}</button>
              <span className="num">{money(l.amount)}</span>
            </li>
          ))}
        </ul>
      </section>

      <LineCard id="vstupne" title="Vstupné a permanentky" lines={line('vstupne')} bench={bench.vstupne} effects={['návštěva', 'nálada fanoušků', 'domácí prostředí v zápase']}>
        <SliderField
          label="Vstupenka"
          value={club.policy.ticketPrice}
          min={Math.round(defaultTicketPrice(tier) * 0.4)}
          max={defaultTicketPrice(tier) * 2.5}
          step={10}
          format={(v) => `${num(v)} Kč`}
          reference={`běžně ${defaultTicketPrice(tier)} Kč`}
          onChange={(v) => set({ ticketPrice: v })}
          preview={(v) => {
            const t = ticketPreview(game, v);
            return (
              <p className="preview small">
                Návštěva asi <strong>{num(t.attendance)}</strong> ({Math.round(t.fill * 100)} % stadionu), vstupné asi <strong>{money(t.perMatch)}</strong> za zápas.
                {v > defaultTicketPrice(tier) * 1.1 && ' Dražší než o 10 % nad běžnou cenou: nálada fanoušků každý měsíc klesá.'}
              </p>
            );
          }}
        />
        <SliderField
          label="Permanentka"
          value={seasonTicketPrice(game)}
          min={Math.round((defaultSeasonTicketPrice(tier) * 0.4) / 50) * 50}
          max={defaultSeasonTicketPrice(tier) * 2.5}
          step={50}
          format={(v) => `${num(v)} Kč`}
          reference={`běžně ${num(defaultSeasonTicketPrice(tier))} Kč`}
          disabled={sold}
          onChange={(v) => set({ seasonTicketPrice: v })}
          preview={(v) => (
            <p className="preview small">
              {sold
                ? `Prodáno ${num(seasonTicketHolders(game))} permanentek za ${money(game.budget?.seasonTicketRevenue ?? 0)}. Další prodej až příští sezónu.`
                : <>Prodá se asi <strong>{num(seasonTicketDemand(game, v))}</strong> permanentek za <strong>{money(seasonTicketDemand(game, v) * v)}</strong>. Peníze přijdou při schválení rozpočtu, držitelé pak chodí jistě.</>}
            </p>
          )}
        />
        {avgAttendance > 0 && <p className="muted small">Průměrná návštěva zatím {num(avgAttendance)} ({Math.round((avgAttendance / club.stadium.capacity) * 100)} % stadionu).</p>}
      </LineCard>

      <LineCard id="stadion" title="Catering a VIP" lines={line('stadion')} bench={bench.stadion} effects={['útrata diváků', 'nálada fanoušků']}
        note={`Útrata ${CATERING_SPEND[club.facilities.catering]} Kč na diváka a ${club.facilities.vip} VIP lóží. Obojí rozšíříte stavbami v záložce Stadion.`}
      >
        <Choices<Level>
          label="Ceny v cateringu a VIP"
          value={club.policy.cateringPrice ?? 'bezna'}
          onChange={(v) => set({ cateringPrice: v })}
          options={[
            { id: 'nizka', label: 'Lidové', hint: 'útrata −20 %, fanoušci spokojenější' },
            { id: 'bezna', label: 'Běžné', hint: 'bez dopadu na náladu' },
            { id: 'vysoka', label: 'Prémiové', hint: 'útrata +20 %, fanoušci reptají' },
          ]}
        />
      </LineCard>

      <LineCard id="fanshop" title="Fanshop a dresy" lines={line('fanshop')} effects={['nálada fanoušků', 'roste s pověstí a úspěchem']}>
        <Choices<Level>
          label="Ceny ve fanshopu"
          value={club.policy.merchPrice ?? 'bezna'}
          onChange={(v) => set({ merchPrice: v })}
          options={[
            { id: 'nizka', label: 'Dostupné', hint: 'tržby −18 %, fanoušci spokojenější' },
            { id: 'bezna', label: 'Běžné', hint: 'bez dopadu na náladu' },
            { id: 'vysoka', label: 'Drahé', hint: 'tržby +12 %, fanoušci reptají' },
          ]}
        />
        <label className="check">
          <input type="checkbox" checked={!!club.policy.newKit} onChange={(e) => set({ newKit: e.target.checked })} />
          <span>Nová kolekce dresů pro tuto sezónu: tržby +30 %, náklady na kolekci, fanoušci +3 při uvedení (2. 7.)</span>
        </label>
        <p className="preview small">Měsíčně tržby {money(shop.gross)}{shop.kitCost ? `, kolekce −${money(shop.kitCost)}` : ''}, čistě <strong>{money(shop.net)}</strong>.</p>
      </LineCard>

      <LineCard id="akce" title="Akce na stadionu" lines={line('akce')} effects={['stav trávníku', 'zranění doma', 'návštěva']}>
        <SliderField
          label="Koncerty, kempy a pronájmy za sezónu"
          value={events}
          min={0}
          max={12}
          step={1}
          format={(v) => `${v}×`}
          onChange={(v) => set({ stadiumEvents: v })}
          preview={(v) => (
            <p className="preview small">
              {v ? <>Asi <strong>{money(v * eventIncome(club, tier))}</strong> za sezónu ({money(eventIncome(club, tier))} za akci). Každá akce poškodí trávník s pravděpodobností {Math.round(eventDamageChance(club) * 100)} % (podle údržby ve Výdajích).</> : 'Stadion slouží jen fotbalu.'}
            </p>
          )}
        />
      </LineCard>

      <LineCard id="komercni" title="Sponzoři a reklama" lines={line('komercni')} bench={bench.komercni} effects={['název stadionu', 'bonusy za úspěch']}
        note="Každé místo má svou cenu podle velikosti a pověsti klubu. Pevná smlouva chrání před propadem, krátká dovolí po úspěšné sezóně vyjednat víc. Obchodní ředitel přinese víc nabídek, marketing (Výdaje) zvedá cenu."
      >
        <p className="small">Smlouvy {money(sp.contracts * 12)} ročně, drobní sponzoři a reklama {money(sp.small * 12)}.</p>
        <div className="slots">
          {SLOTS.map((slot) => {
            const c = signed.find((x) => x.slot === slot);
            const list = offers.filter((o) => o.slot === slot);
            return (
              <div key={slot} className={`subcard ${c ? '' : 'empty'}`}>
                <div className="row-between">
                  <strong>{SLOT_LABEL[slot]}</strong>
                  {c ? (c.untilSeason === game.season ? <Badge tone="warn">končí letos</Badge> : <Badge tone="good">do {seasonLabel(c.untilSeason)}</Badge>) : <Badge tone="warn">volné</Badge>}
                </div>
                {c && (
                  <>
                    <p className="small">{c.name}: {money(c.annual)} ročně</p>
                    {c.bonus && <p className="small muted">{bonusText(c)}</p>}
                    {c.untilSeason === game.season && !list.length && <p className="small muted">Nabídky na prodloužení chodí od března.</p>}
                  </>
                )}
                {list.length > 0 ? (
                  <ul className="plain offers">
                    {list.map((o) => (
                      <li key={o.id}>
                        <div className="row-between">
                          <span className="small"><strong>{o.name}</strong> · {STYLE_LABEL[o.style]}</span>
                          <button onClick={() => apply(signSponsor(game, o.id))}>{c?.name === o.name ? 'Prodloužit' : 'Podepsat'}</button>
                        </div>
                        <span className="small">{money(o.annual)} ročně{o.bonus ? `, ${bonusText(o)}` : ''}</span>
                        <span className="muted small"> · platí do {formatDate(o.expires)}</span>
                      </li>
                    ))}
                  </ul>
                ) : !c ? (
                  <p className="small muted">Nové nabídky přijdou začátkem měsíce.</p>
                ) : null}
                {slot === 'stadion' && !c && <p className="small muted">Prodej názvu stadionu fanoušky naštve (−6).</p>}
              </div>
            );
          })}
        </div>
      </LineCard>

      <div className="grid line-grid">
        <LineCard id="tv" title="TV práva a odměna za umístění" lines={line('tv')} effects={['nastavuje se výsledky a cílem sezóny']}>
          <dl className="kv">
            <dt>TV práva</dt>
            <dd>{money(tvMonthly(tier))} měsíčně</dd>
            <dt>Odměna za umístění (odhad pro {position}. místo)</dt>
            <dd>{money(comp ? prizeMoney(tier, position, comp.clubIds.length) : 0)}</dd>
            {game.tvAdvance && (
              <>
                <dt>Záloha na TV (Financování)</dt>
                <dd className="neg">−{money(game.tvAdvance.monthly)} ještě {game.tvAdvance.monthsLeft}×</dd>
              </>
            )}
          </dl>
        </LineCard>
        <LineCard id="evropa" title="Evropa a domácí pohár" lines={line('evropa', 'pohar')} effects={['pověst', 'sponzorské bonusy']}>
          <dl className="kv">
            <dt>Evropské poháry</dt>
            <dd>{europe ? (game.europe!.resolved ? (europe.result === 'predkola' ? EUROPE_LABEL.predkola : EUROPE_LABEL[europe.result]) : `předkola ${EUROPE_LABEL[europe.entry]}`) : 'nehrajeme'}</dd>
            {europe && (
              <>
                <dt>{game.europe!.resolved ? 'Příjmy z Evropy' : 'Odhad příjmů'}</dt>
                <dd>{money(europe.revenue)}</dd>
              </>
            )}
            <dt>Domácí pohár</dt>
            <dd>{game.cups.pohar?.alive.includes(club.id) ? 've hře' : game.cups.pohar ? 'vypadli jsme' : 'začne v srpnu'}</dd>
          </dl>
          <p className="muted small">Výhled počítá s polovičními šancemi na postup v každém kole poháru.</p>
        </LineCard>
      </div>

      <LineCard id="prodeje" title="Prodeje hráčů" lines={[]} effects={['nabídky na hráče', 'síla kádru', 'rozpočet na přestupy']}
        note="Prodeje se do výhledu přičtou, až nastanou (řádek Přestupy v Rozpočtu). Polovina tržby se vrací do rozpočtu na přestupy."
      >
        <Choices<SalesPolicy>
          label="Prodejní politika (pro sportovního ředitele i kupce)"
          value={club.policy.salesPolicy ?? 'dobra'}
          onChange={(v) => set({ salesPolicy: v })}
          options={[
            { id: 'drzet', label: 'Držet kádr', hint: 'méně nabídek, ředitel doporučí prodej jen za hodně peněz' },
            { id: 'dobra', label: 'Za dobrou cenu', hint: 'běžný počet nabídek, prodej nad hodnotou' },
            { id: 'prodejni', label: 'Prodejní klub', hint: 'dvakrát víc nabídek, ředitel sám prodá hráče mimo opory' },
          ]}
        />
        <dl className="kv">
          <dt>Nabídky na stole</dt>
          <dd>{game.market.offers.length} (Přestupy)</dd>
          <dt>Z prodejů zpět do rozpočtu na přestupy</dt>
          <dd>{money(game.market.earned)}</dd>
        </dl>
        {(receivables.length > 0 || sellOn.length > 0) && (
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
      </LineCard>

      <LineCard id="ostatni" title="Dotace a mimořádné příjmy" lines={line('ostatni')} effects={['vztah s městem', 'komunitní rozpočet zvyšuje šanci']}
        note={<>O dotace se žádá ve Financování. <button className="linkbtn" onClick={() => onOpen('financovani')}>Financování ›</button></>}
      />
    </div>
  );
}

/** Ke které kartě patří řádek plánu. */
function cardOf(key: string): string {
  return key === 'pohar' ? 'evropa' : key;
}
