import { useState } from 'react';
import {
  activeOverdraft,
  annuity,
  applyGrant,
  forecastSeason,
  formatDate,
  grantOptions,
  injectCapital,
  INVEST_MONTHS,
  INVEST_RATE,
  investmentLoanOffer,
  lendToClub,
  licenceProblems,
  loanOffers,
  LOAN_MONTHS,
  LOAN_RATE,
  OVERDRAFT_RATE,
  overdraftLimit,
  OWNER_LOAN_RATE,
  previewVote,
  repayOwnerLoan,
  sellTvAdvance,
  setOverdraft,
  takeLoan,
  tvAdvanceOffer,
  type ActionResult,
  type GameState,
} from '../../../engine';
import { Badge, Notice } from '../../components';
import { money } from '../../format';
import { VoteInfo } from '../../VoteInfo';
import { OwnerNeedActions } from './shared';

/** Financování: peníze majitele, banka, záloha na TV, dotace, splátky přestupů a licence. */
export function FinanceFunding({ game, onChange }: { game: GameState; onChange: (g: GameState) => void }) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [amount, setAmount] = useState('');
  const apply = (r: ActionResult) => {
    if (r.state !== game) onChange(r.state);
    setMessage({ text: r.message, ok: r.ok });
  };
  const club = game.clubs[game.owner.clubId];
  const value = Number(amount.replace(',', '.')) * 1_000_000;
  const valid = value > 0 && value <= game.owner.wallet;
  const offers = loanOffers(game);
  const invest = investmentLoanOffer(game);
  const vote = previewVote(game, 'uver', offers[0] ?? invest);
  const tv = tvAdvanceOffer(game);
  const grants = grantOptions(game);
  const problems = licenceProblems(game);
  const plan = forecastSeason(game);

  return (
    <div className="stack">
      <Notice message={message?.text ?? null} ok={message?.ok} />
      <div className="grid two">
        <section className="card">
          <h2>Peníze majitele</h2>
          <dl className="kv">
            <dt>Vaše osobní peníze</dt>
            <dd>{money(game.owner.wallet)}</dd>
            <dt>Půjčka klubu od vás</dt>
            <dd>{money(game.ownerLoan?.remaining ?? 0)}</dd>
            <dt>Výhled klubu do konce sezóny</dt>
            <dd className={plan.cashMin < -activeOverdraft(game) ? 'neg' : ''}>nejméně {money(plan.cashMin)}, na konci {money(plan.cashEnd)}</dd>
          </dl>
          {(plan.ownerNeed ?? 0) > 0 && <p className="warning">Podle výhledu klub potřebuje asi {money(plan.ownerNeed!)}, aby nezůstal v minusu{activeOverdraft(game) ? ' nad kontokorent' : ''}.</p>}
          <OwnerNeedActions game={game} need={plan.ownerNeed ?? 0} onResult={apply} />
          <div className="inline-form wrap">
            <input inputMode="decimal" value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value)} aria-label="Částka v milionech" />
            <span>mil. Kč</span>
            <button disabled={!valid} onClick={() => { onChange(injectCapital(game, value)); setAmount(''); setMessage({ text: `Vložil jste ${money(value)}.`, ok: true }); }}>Vložit (dar)</button>
            <button disabled={!valid} onClick={() => { apply(lendToClub(game, value)); setAmount(''); }}>Půjčit klubu</button>
          </div>
          <p className="muted small">
            Vklad je dar: zvedne vlastní kapitál, ale zpátky ho nedostanete (leda dividendou). Půjčka se vrací s úrokem {Math.round(OWNER_LOAN_RATE * 100)} % a svaz ji při licenci bere jako vlastní zdroje.
          </p>
          {game.ownerLoan && (
            <button disabled={club.finance.balance <= 0} onClick={() => apply(repayOwnerLoan(game, Math.min(game.ownerLoan!.remaining, club.finance.balance)))}>
              Klub splatí půjčku ({money(Math.min(game.ownerLoan.remaining, Math.max(0, club.finance.balance)))})
            </button>
          )}
        </section>

        <section className="card">
          <h2>Banka</h2>
          <div className="row-between">
            <span>
              <strong>Kontokorent</strong>{' '}
              {club.policy.overdraft ? <Badge tone="good">aktivní do {money(activeOverdraft(game))}</Badge> : <span className="muted small">limit by byl {money(overdraftLimit(game))}</span>}
            </span>
            <button onClick={() => apply(setOverdraft(game, !club.policy.overdraft))}>{club.policy.overdraft ? 'Zrušit' : 'Sjednat'}</button>
          </div>
          <p className="muted small">Krátkodobá rezerva: účet může do minusu bez rizika insolvence. Úrok {Math.round(OVERDRAFT_RATE * 100)} % z čerpání, poplatek 0,5 % z limitu ročně.</p>

          {game.loans.map((l) => (
            <dl key={l.id} className="kv">
              <dt>{l.kind === 'investicni' ? 'Investiční úvěr' : 'Provozní úvěr'}: zbývá</dt>
              <dd>{money(l.remaining)}</dd>
              <dt>Splátka ({Math.round(l.rate * 1000) / 10} %, ještě {l.monthsLeft} měs.)</dt>
              <dd>{money(l.payment)}</dd>
            </dl>
          ))}
          {(offers.length > 0 || invest > 0) && <VoteInfo vote={vote} />}
          {offers.length > 0 && (
            <>
              <p className="small"><strong>Provozní úvěr</strong> na {LOAN_MONTHS / 12} roky, {Math.round(LOAN_RATE * 100)} % ročně:</p>
              <div className="buttons">
                {offers.map((a) => (
                  <button key={a} disabled={!vote.passes || !!game.owner.ousted} onClick={() => onChange(takeLoan(game, a))}>
                    {money(a)} <span className="muted small">(splátka {money(annuity(a, LOAN_RATE, LOAN_MONTHS))})</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {invest > 0 && (
            <>
              <p className="small"><strong>Investiční úvěr</strong> na rozestavěné stavby, {INVEST_MONTHS / 12} let, {INVEST_RATE * 100} % ročně:</p>
              <button disabled={!vote.passes || !!game.owner.ousted} onClick={() => onChange(takeLoan(game, invest, 'investicni'))}>
                {money(invest)} <span className="muted small">(splátka {money(annuity(invest, INVEST_RATE, INVEST_MONTHS))})</span>
              </button>
            </>
          )}
          {!invest && !game.loans.some((l) => l.kind === 'investicni') && <p className="muted small">Investiční úvěr nabídne banka, až se bude stavět.</p>}
        </section>

        <section className="card">
          <h2>Záloha na TV peníze</h2>
          {game.tvAdvance ? (
            <p>Splácí se: {money(game.tvAdvance.monthly)} měsíčně ještě {game.tvAdvance.monthsLeft}×.</p>
          ) : (
            <>
              <p className="muted small">Banka vyplatí TV peníze příštích 6 měsíců hned, o 8 % méně. Pomůže překlenout výpadek, ale pak půl roku TV peníze chybí.</p>
              <button disabled={!tv || !!game.owner.ousted} onClick={() => apply(sellTvAdvance(game))}>Prodat za {money(tv)}</button>
            </>
          )}
        </section>

        <section className="card">
          <h2>Dotace</h2>
          <ul className="plain">
            {grants.map((g) => (
              <li key={g.kind} className="row-between">
                <span className="small">
                  {g.label}: <strong>{money(g.amount)}</strong>
                  <span className="muted"> · šance {Math.round(g.chance * 100)} %{g.blocked ? ` · ${g.blocked}` : ''}</span>
                </span>
                <button disabled={!!g.blocked || g.amount <= 0} onClick={() => apply(applyGrant(game, g.kind))}>Požádat</button>
              </li>
            ))}
          </ul>
          <p className="muted small">Šance závisí na vztazích s městem, pověsti u médií a svazu. Skandál ji výrazně sníží.</p>
          {(game.grants ?? []).length > 0 && (
            <ul className="plain small muted">
              {[...(game.grants ?? [])].reverse().slice(0, 5).map((g) => (
                <li key={g.id}>{formatDate(g.decided)} · {money(g.amount)} · {g.result === 'schvaleno' ? 'schváleno' : g.result === 'zamitnuto' ? 'zamítnuto' : 'čeká na rozhodnutí'}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>Licence svazu</h2>
          <p className="small">
            Kontrola probíhá 31. 3., náprava do 31. 5. Svaz chce kladný vlastní kapitál (půjčka majitele se počítá jako vlastní zdroje) a žádné neuhrazené závazky.
          </p>
          {game.licence?.season === game.season && <p className={game.licence.status === 'ok' ? 'notice' : 'warning'}>{game.licence.note}</p>}
          {problems.length ? <p className="warning soft">Teď by licence neprošla: {problems.join(', ')}.</p> : <p className="muted small">Teď by licence prošla.</p>}
        </section>
      </div>
    </div>
  );
}
