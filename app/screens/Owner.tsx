import { BusinessCard, CityCard, HallOfFame, UltrasCard } from './OwnerExtras';
import { useState } from 'react';
import {
  BAN_SEVERITY,
  toScore,
  buyShares,
  callExtraordinaryAgm,
  campaignAvailableFrom,
  campaignCost,
  clubValuation,
  extraordinaryAgmAvailableFrom,
  formatDate,
  increaseCapital,
  KIND_LABEL,
  KIND_WANTS,
  mediaCampaign,
  othersShare,
  previewVote,
  riskLevel,
  sellStake,
  shareholderConfidence,
  sharePrice,
  type ActionResult,
  type GameState,
  type Shareholder,
} from '../../engine';
import { Badge, Meter, Notice } from '../components';
import { money } from '../format';
import { VoteInfo } from '../VoteInfo';

type Props = { game: GameState; onChange: (g: GameState) => void };

const pct = (v: number) => `${Math.round(v * 100)} %`;
const width = (v: number) => `${v * 100}%`;
const SHARE_COLORS = ['var(--accent)', '#6b8ccf', '#c9a227', '#9a6fc4', '#cf6b6b', '#5aa5a5'];

export function Owner({ game, onChange }: Props) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const apply = (r: ActionResult) => {
    if (r.state !== game) onChange(r.state);
    setMessage({ text: r.message, ok: r.ok });
    setPending(null);
  };
  const club = game.clubs[game.owner.clubId];
  const valuation = clubValuation(game);
  const conf = shareholderConfidence(game);
  const partners = game.shareholders.length > 0;
  const ousted = game.owner.ousted;

  return (
    <div className="stack">
      <Notice message={message?.text ?? null} ok={message?.ok} />

      {ousted && <ComebackCard game={game} onResult={apply} />}

      <div className="grid two">
        <BusinessCard game={game} onResult={apply} />
        <HallOfFame game={game} />
        <CityCard game={game} onResult={apply} />
        <UltrasCard game={game} />
      </div>

      <div className="grid">
        <section className="card">
          <h2>Vlastnictví</h2>
          <div className="share-bar" aria-label="Rozdělení akcií">
            <span style={{ width: width(game.owner.share), background: SHARE_COLORS[0] }} title={`Vy ${pct(game.owner.share)}`} />
            {game.shareholders.map((s, i) => (
              <span key={s.id} style={{ width: width(s.share), background: SHARE_COLORS[(i + 1) % SHARE_COLORS.length] }} title={`${s.name} ${pct(s.share)}`} />
            ))}
          </div>
          <dl className="kv">
            <dt>Váš podíl</dt>
            <dd>{pct(game.owner.share)}</dd>
            <dt>Odhadní hodnota klubu</dt>
            <dd>{money(valuation)}</dd>
            <dt>Hodnota vašeho podílu</dt>
            <dd>{money(valuation * game.owner.share)}</dd>
            <dt>Vaše osobní peníze</dt>
            <dd>{money(game.owner.wallet)}</dd>
          </dl>
          <p className="muted small">
            Hodnota = 60 % tržní ceny kádru + stavby + stadion + značka + hotovost − dluhy.
            {partners && othersShare(game) > 0.5 && ' Spolumajitelé mají většinu: když budou nespokojení, valná hromada vás může odvolat.'}
          </p>
        </section>

        <section className="card">
          <h2>Pověst majitele</h2>
          <dl className="kv meters">
            <dt>Fanoušci</dt>
            <dd><Meter value={club.fanMood} /> {Math.round(club.fanMood)}</dd>
            <dt>Média</dt>
            <dd><Meter value={game.owner.media} /> {Math.round(game.owner.media)}</dd>
            <dt>Fotbalový svaz</dt>
            <dd><Meter value={game.owner.league} /> {Math.round(game.owner.league)}</dd>
            {partners && (
              <>
                <dt>Spolumajitelé</dt>
                <dd><Meter value={conf} /> {Math.round(conf)}</dd>
              </>
            )}
          </dl>
          <ul className="plain small muted">
            <li>Média: sponzoři platí {Math.round((0.95 + game.owner.media / 1000) * 100)} % běžné částky, spolumajitelé čtou noviny.</li>
            <li>Svaz: pokuty jsou {Math.round((1.5 - game.owner.league / 100) * 100)} % běžné výše.</li>
          </ul>
          <CampaignButton game={game} onResult={apply} />
        </section>

        <GreyCard game={game} />
      </div>

      {partners && (
        <section className="card">
          <div className="row-between">
            <h2>Spolumajitelé</h2>
            <span className="muted small">Valná hromada každý rok koncem června</span>
          </div>
          <div className="grid four">
            {game.shareholders.map((s) => (
              <ShareholderCard key={s.id} game={game} s={s} pending={pending} setPending={setPending} onResult={apply} />
            ))}
          </div>
          <p className="muted small">Spokojenost nad 50 znamená souhlas při hlasování. Úvěry a stavby nad 20 mil. Kč potřebují nadpoloviční většinu, stavby nad 50 mil. Kč a navýšení kapitálu dvě třetiny.</p>
        </section>
      )}

      <div className="grid two">
        <CapitalCard game={game} onResult={apply} />
        <SellCard game={game} valuation={valuation} onResult={apply} />
      </div>

      {game.agm.length > 0 && (
        <section className="card">
          <h2>Valné hromady</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th className="num">Dividenda</th>
                  <th className="num">Důvěra</th>
                  <th>Výsledek</th>
                </tr>
              </thead>
              <tbody>
                {[...game.agm].reverse().map((a) => (
                  <tr key={a.date}>
                    <td>{formatDate(a.date)}</td>
                    <td className="num">{money(a.dividend)}</td>
                    <td className="num">{partners || a.confidence < 100 ? a.confidence : '–'}</td>
                    <td>{a.ousted ? <Badge tone="bad">odvolán</Badge> : <Badge tone="good">potvrzen</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function ShareholderCard({ game, s, pending, setPending, onResult }: {
  game: GameState; s: Shareholder; pending: string | null; setPending: (v: string | null) => void; onResult: (r: ActionResult) => void;
}) {
  const parts = [...new Set([0.05, s.share].filter((x) => x <= s.share + 1e-9))];
  return (
    <div className="subcard">
      <div className="row-between">
        <strong>{s.name}</strong>
        <span className="rating">{pct(s.share)}</span>
      </div>
      <p className="small muted">{KIND_LABEL[s.kind]} · chce {KIND_WANTS[s.kind]}</p>
      <p className="small"><span className="meter-cell"><Meter value={s.satisfaction} /> spokojenost {Math.round(s.satisfaction)}</span></p>
      <div className="buttons">
        {parts.map((part) => {
          const price = sharePrice(game, s, part);
          const key = `${s.id}-${part}`;
          const label = part === s.share ? `Koupit vše (${pct(part)})` : `Koupit ${pct(part)}`;
          if (price === null) return <span key={key} className="muted small">Akcie teď neprodává.</span>;
          if (pending === key) {
            return (
              <span key={key} className="buttons">
                <button className="primary" onClick={() => onResult(buyShares(game, s.id, part))}>Zaplatit {money(price)}</button>
                <button onClick={() => setPending(null)}>Zpět</button>
              </span>
            );
          }
          return (
            <button key={key} disabled={price > game.owner.wallet} onClick={() => setPending(key)}>
              {label} · {money(price)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CapitalCard({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const club = game.clubs[game.owner.clubId];
  const options = [10_000_000, 25_000_000, 50_000_000].filter((v) => v <= game.owner.wallet);
  const [amount, setAmount] = useState(options[0] ?? 0);
  const vote = previewVote(game, 'navyseni', amount);
  if (!game.shareholders.length) {
    return (
      <section className="card">
        <h2>Peníze do klubu</h2>
        <p className="muted">Jako jediný vlastník vkládáte peníze do klubu ve Financích. Ze zisku si na konci sezóny můžete vyplatit dividendu.</p>
      </section>
    );
  }
  return (
    <section className="card">
      <h2>Navýšení kapitálu</h2>
      <p className="muted small">Vložíte peníze do klubu a dostanete za ně nové akcie za odhadní cenu. Ostatním se podíl zředí, proto to musí schválit dvě třetiny.</p>
      <div className="segmented">
        {options.map((v) => (
          <button key={v} className={amount === v ? 'active' : ''} onClick={() => setAmount(v)}>{money(v)}</button>
        ))}
      </div>
      {amount > 0 && (
        <>
          <VoteInfo vote={vote} />
          <button className="primary" disabled={!!game.owner.ousted || !vote.passes} onClick={() => onResult(increaseCapital(game, amount))}>
            Vložit {money(amount)} do {club.shortName}
          </button>
        </>
      )}
      {options.length === 0 && <p className="muted">Na navýšení nemáte dost osobních peněz.</p>}
    </section>
  );
}

function SellCard({ game, valuation, onResult }: { game: GameState; valuation: number; onResult: (r: ActionResult) => void }) {
  const [pending, setPending] = useState<number | null>(null);
  const parts = [0.1, 0.25, game.owner.share].filter((p, i, a) => p <= game.owner.share + 1e-9 && a.indexOf(p) === i);
  return (
    <section className="card">
      <h2>Prodej podílu</h2>
      <p className="muted small">Kupec zaplatí 90 % odhadní ceny. Prodejem všeho hra končí a odcházíte s osobními penězi.</p>
      <div className="buttons">
        {parts.map((p) => {
          const price = Math.round((valuation * p * 0.9) / 100_000) * 100_000;
          const all = p === game.owner.share;
          return pending === p ? (
            <span key={p} className="confirm">
              <strong>{all ? 'Prodat celý podíl a skončit?' : `Prodat ${pct(p)}?`} {money(price)}</strong>
              <span className="buttons">
                <button className="danger" onClick={() => { setPending(null); onResult(sellStake(game, p)); }}>Prodat</button>
                <button onClick={() => setPending(null)}>Zpět</button>
              </span>
            </span>
          ) : (
            <button key={p} className={all ? 'danger' : ''} onClick={() => setPending(p)}>
              {all ? 'Prodat vše' : pct(p)} · {money(price)}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CampaignButton({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const wait = campaignAvailableFrom(game);
  const cost = campaignCost(game);
  return (
    <div className="action-row">
      <button disabled={!!wait || cost > game.owner.wallet} onClick={() => onResult(mediaCampaign(game))}>
        Mediální kampaň · {money(cost)}
      </button>
      <span className="muted small">{wait ? `znovu od ${formatDate(wait)}` : 'z osobních peněz: média, fanoušci, patrioti a město'}</span>
    </div>
  );
}

function GreyCard({ game }: { game: GameState }) {
  const risk = riskLevel(game);
  const g = game.grey;
  const severity = g.actions.filter((a) => a.discovered).reduce((s, a) => s + a.severity, 0);
  const scandal = g.scandalUntil && g.scandalUntil > game.date;
  return (
    <section className="card">
      <div className="row-between">
        <h2>Na hraně etiky</h2>
        <Badge tone={risk.tone}>Riziko {risk.label} ({Math.round(game.grey.exposure)} ze 100)</Badge>
      </div>
      <p className="muted small">
        Rozhodnutí v šedé zóně (daňové triky, zakázky pro vlastní firmu, neoficiální jednání s hráči…) přinesou peníze nebo výhodu, ale zvyšují riziko mediální kauzy.
        Riziko časem klesá. Při odhalení přijde pokuta, vratky, propad pověsti a nespokojení akcionáři; při závažnosti 100 ze 100 zákaz činnosti.
      </p>
      {scandal && <p className="warning">Probíhá kauza: sponzoři krátí plnění do {formatDate(g.scandalUntil!)}.</p>}
      {g.taxSchemeUntil && g.taxSchemeUntil > game.date && <p className="small">Platy přes obrazová práva běží do {formatDate(g.taxSchemeUntil)}.</p>}
      {g.actions.length > 0 ? (
        <>
          <ul className="plain small">
            {[...g.actions].reverse().slice(0, 6).map((a, i) => (
              <li key={i} className="row-between">
                <span>{formatDate(a.date)} · {a.label}</span>
                {a.discovered ? <Badge tone="bad">odhaleno</Badge> : <Badge>skryto</Badge>}
              </li>
            ))}
          </ul>
          <p className="muted small">Závažnost odhalených kauz: {toScore(severity, 0, BAN_SEVERITY)} ze 100.</p>
        </>
      ) : (
        <p className="muted small">Zatím máte čistý štít.</p>
      )}
    </section>
  );
}

function ComebackCard({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const o = game.owner.ousted!;
  const wait = extraordinaryAgmAvailableFrom(game);
  const yes = game.owner.share + game.shareholders.filter((s) => s.satisfaction >= 50).reduce((a, s) => a + s.share, 0);
  return (
    <section className="card highlight">
      <h2>{o.banUntil ? 'Zákaz činnosti' : 'Jste mimo vedení klubu'}</h2>
      <p>
        {o.banUntil
          ? `Svaz vám zakázal činnost ve fotbale do ${formatDate(o.banUntil)}. Klub mezitím řídí představenstvo, vy zůstáváte akcionářem.`
          : `Od ${formatDate(o.since)} klub řídí představenstvo. Situace řeší za vás a přestupy jen nutné. Vy jste pasivní akcionář s podílem ${pct(game.owner.share)}.`}
      </p>
      {!o.banUntil && (
        <>
          <h3>Cesty zpět</h3>
          <ul className="plain">
            <li>Dokupte akcie nad 50 % (tabulka spolumajitelů níže).</li>
            <li>Mediální kampaní zlepšete náladu patriotů a města.</li>
            <li>Když se představenstvu nedaří, akcionáři vás sami pozvou zpět.</li>
          </ul>
          <div className="action-row">
            <button className="primary" disabled={!!wait} onClick={() => onResult(callExtraordinaryAgm(game))}>Svolat mimořádnou valnou hromadu</button>
            <span className="muted small">{wait ? `možné od ${formatDate(wait)}` : `teď by pro hlasovalo asi ${pct(yes)} (potřeba víc než 50 %)`}</span>
          </div>
        </>
      )}
    </section>
  );
}
