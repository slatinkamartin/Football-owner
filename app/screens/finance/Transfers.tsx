import { useState } from 'react';
import {
  budgetRemaining,
  clubLabel,
  defaultTransferBudget,
  forecastSeason,
  formatDate,
  playerName,
  SALES_LABEL,
  seasonLabel,
  transferWindow,
  updatePolicy,
  type GameState,
  type SalesPolicy,
} from '../../../engine';
import { Notice } from '../../components';
import { money } from '../../format';
import { PlayerLink } from '../../nav';
import type { FinanceTab } from '../Finance';
import { Choices, Impact, LineCard, SliderField } from './shared';

/**
 * Přestupová politika: rozpočet na posily, prodejní politika, minimální rezerva a splátky.
 * Propisuje se do Příjmů (prodeje), Výdajů (nákupy) i do výhledu rozpočtu (řádek Přestupy).
 */
export function FinanceTransfers({ game, onChange, onOpen }: { game: GameState; onChange: (g: GameState) => void; onOpen: (tab: FinanceTab, line?: string) => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const set = (patch: Parameters<typeof updatePolicy>[1]) => {
    setMessage(null);
    onChange(updatePolicy(game, patch));
  };
  const club = game.clubs[game.owner.clubId];
  const plan = forecastSeason(game);
  const line = plan.lines.filter((l) => l.key === 'prestupy');
  const window = transferWindow(game.date);
  const remaining = budgetRemaining(game);
  const reserve = club.policy.cashReserve ?? 0;
  const policy = club.policy.salesPolicy ?? 'dobra';
  const payments = (game.payments ?? []).filter((p) => p.to === club.id || p.from === club.id).sort((a, b) => (a.due < b.due ? -1 : 1));
  const sellOn = Object.values(game.players).filter((p) => p.sellOn?.clubId === club.id);
  const ownSellOn = Object.values(game.players).filter((p) => p.clubId === club.id && p.sellOn);
  const opsCosts = Math.abs(plan.lines.filter((l) => l.group === 'provoz' && l.amount < 0).reduce((a, l) => a + l.amount, 0));

  return (
    <div className="stack">
      <Notice message={message} ok />
      <div className="kpis">
        <div className="kpi">
          <span className="kpi-label">Přestupní okno</span>
          <strong className="kpi-value">{window === 'leto' ? 'Letní, otevřené' : window === 'zima' ? 'Zimní, otevřené' : 'Zavřené'}</strong>
          <span className="kpi-sub">{window === 'leto' ? 'do 31. 8.' : window === 'zima' ? 'do 14. 2.' : game.date.slice(5) < '01-08' ? 'zimní od 8. 1.' : 'letní od 1. 7.'}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Lze ještě utratit</span>
          <strong className="kpi-value">{money(remaining)}</strong>
          <span className="kpi-sub">z rozpočtu {money(club.policy.transferBudget)}{reserve ? `, hlídá rezervu ${money(reserve)}` : ''}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Utraceno / vráceno z prodejů</span>
          <strong className="kpi-value">{money(game.market.spent)}</strong>
          <span className="kpi-sub">zpět do rozpočtu {money(game.market.earned)}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Nabídky na naše hráče</span>
          <strong className="kpi-value">{game.market.offers.length}</strong>
          <span className="kpi-sub">rozhodnete v záložce Přestupy nahoře</span>
        </div>
      </div>

      <LineCard id="prestupy" title={`Přestupy v sezóně ${seasonLabel(game.season)}`} lines={line} effects={['posily a síla kádru', 'splátky do dalších let', 'rozpočet a výhled peněz']}
        note="Výhled počítá s utracením zbytku rozpočtu, dokud je nebo bude otevřené okno (70 % v létě, 30 % v zimě). Prodeje se přičtou, až nastanou; polovina tržby se vrací do rozpočtu na přestupy."
      >
        <SliderField
          label="Rozpočet na odstupné za sezónu"
          value={club.policy.transferBudget}
          min={0}
          max={Math.max(defaultTransferBudget(club) * 3, club.policy.transferBudget, 1_000_000)}
          step={Math.max(100_000, Math.round(defaultTransferBudget(club) / 30 / 100_000) * 100_000)}
          format={(v) => money(v)}
          reference={`běžně ${money(defaultTransferBudget(club))}`}
          onChange={(v) => set({ transferBudget: v })}
          preview={(v) => (
            <Impact
              game={game}
              patch={{ transferBudget: v }}
              extra={[
                v > defaultTransferBudget(club) * 1.5 && 'víc peněz na posily: silnější kádr, ale peníze odejdou hned a splátky zatíží další sezóny',
                v < defaultTransferBudget(club) * 0.5 && 'málo peněz na posily: kádr se bude doplňovat hlavně volnými hráči a odchovanci',
                !window && 'okno je zavřené, peníze půjdou utratit až v příštím okně',
              ]}
            />
          )}
        />
        <SliderField
          label="Minimální rezerva na účtu"
          value={reserve}
          min={0}
          max={Math.max(5_000_000, Math.round((opsCosts * 0.3) / 1_000_000) * 1_000_000)}
          step={500_000}
          format={(v) => (v ? money(v) : 'žádná')}
          onChange={(v) => set({ cashReserve: v })}
          preview={(v) => (
            <Impact
              game={game}
              patch={{ cashReserve: v }}
              extra={[v > 0 ? `pod ${money(v)} nepůjdete kvůli přestupům vy ani ředitel` : 'bez rezervy může rozpočet na přestupy vyčerpat účet až k nule', v > 0 && 'rozpočtová porada ji drží i v návrhu příští sezóny']}
            />
          )}
        />
        <label className="check">
          <input type="checkbox" checked={club.policy.autoSquad !== false} onChange={(e) => set({ autoSquad: e.target.checked })} />
          <span>Sportovní ředitel sám prodlužuje smlouvy, doplňuje kádr na 22 hráčů a v prodejním klubu prodává hráče mimo opory</span>
        </label>
      </LineCard>

      <LineCard id="prodeje" title="Prodejní politika" lines={[]} effects={['počet a výše nabídek', 'síla kádru', 'peníze z prodejů']}>
        <Choices<SalesPolicy>
          label="Jak se klub staví k prodejům"
          value={policy}
          onChange={(v) => set({ salesPolicy: v })}
          options={[
            { id: 'drzet', label: SALES_LABEL.drzet, hint: 'méně nabídek; ředitel doporučí prodej jen nad 140 % hodnoty' },
            { id: 'dobra', label: SALES_LABEL.dobra, hint: 'běžně nabídek; doporučí prodej nad 115 % hodnoty' },
            { id: 'prodejni', label: SALES_LABEL.prodejni, hint: 'dvakrát víc nabídek; hráče mimo 6 opor ředitel sám prodá od 95 % hodnoty' },
          ]}
          detail={(v) =>
            v === 'drzet'
              ? 'nabídek asi o 60 % méně, kádr zůstane pohromadě, méně peněz z prodejů'
              : v === 'prodejni'
                ? 'víc peněz z prodejů a víc v rozpočtu na přestupy, ale slabší kádr a nespokojení fanoušci při odchodu oblíbenců'
                : 'vyvážené: prodává se, jen když se to vyplatí'
          }
        />
        <p className="muted small">Opory (6 nejlepších hráčů) ředitel nikdy neprodá sám; nabídky na ně vždy rozhodujete vy.</p>
      </LineCard>

      <section className="card">
        <h2>Splátky a podíly z dalších prodejů</h2>
        {payments.length === 0 && sellOn.length === 0 && ownSellOn.length === 0 ? (
          <p className="muted small">Žádné rozložené platby ani podíly. Při koupi i prodeji hráče v české lize lze odstupné rozložit do splátek a při prodeji si vymínit podíl z dalšího přestupu.</p>
        ) : (
          <ul className="plain small">
            {payments.map((p) => (
              <li key={p.id} className="row-between">
                <span>{formatDate(p.due)} · {p.note} ({clubLabel(game, p.to === club.id ? p.from : p.to)})</span>
                <span className={p.to === club.id ? 'pos' : 'neg'}>{p.to === club.id ? '+' : '−'}{money(p.amount)}</span>
              </li>
            ))}
            {sellOn.map((p) => (
              <li key={p.id}>
                Náš podíl {Math.round(p.sellOn!.pct * 100)} % z dalšího prodeje: <PlayerLink id={p.id}>{playerName(p)}</PlayerLink> ({clubLabel(game, p.clubId)})
              </li>
            ))}
            {ownSellOn.map((p) => (
              <li key={p.id}>
                Při prodeji <PlayerLink id={p.id}>{playerName(p)}</PlayerLink> dostane {clubLabel(game, p.sellOn!.clubId)} {Math.round(p.sellOn!.pct * 100)} %
              </li>
            ))}
          </ul>
        )}
        <p className="muted small">Splátky jsou ve výhledu peněz i v závazcích na další sezóny (Rozpočet).</p>
        <button className="linkbtn" onClick={() => onOpen('rozpocet')}>Rozpočet ›</button>
      </section>
    </div>
  );
}
