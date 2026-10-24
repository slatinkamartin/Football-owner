/**
 * W5: Strategická rozhodnutí majitele (Klub › Majitel): co platí, postup plnění vize, kdy přijde další rozhodnutí.
 * Samotná rozhodnutí chodí do schránky rozhodnutí jako běžné situace s výchozí volbou.
 */
import {
  buyBackStadiumName,
  cancelWageRule,
  chooseVision,
  formatShortDate,
  visionChoices,
  visionPickPending,
  ownerDecisionsThisSeason,
  stadiumNameDeal,
  stopCommunity,
  strategyOverview,
  visionOf,
  visionProgress,
  VISION_LABEL,
  type ActionResult,
  type GameState,
} from '../../engine';
import { Badge, Meter } from '../components';
import { money } from '../format';

export function OwnerDecisionsCard({ game, onResult }: { game: GameState; onResult: (r: ActionResult) => void }) {
  const lines = strategyOverview(game);
  const vision = visionOf(game);
  const vp = visionProgress(game);
  const deal = stadiumNameDeal(game);
  const count = ownerDecisionsThisSeason(game);
  const od = game.ownerDecisions;
  const goals = od?.goals;
  const pending = game.events.filter((e) => e.template.startsWith('majitel-'));
  const locked = !!game.owner.ousted;
  return (
    <section className="card w5-strategy" aria-labelledby="w5-strategy-title">
      <div className="row-between w5-head">
        <h2 id="w5-strategy-title">Strategická rozhodnutí</h2>
        <Badge tone={count.count >= count.limit ? 'warn' : 'neutral'}>
          {count.count} / {count.limit} v sezóně
        </Badge>
      </div>
      <p className="muted small">Velká rozhodnutí o směru klubu. Přicházejí do schránky rozhodnutí nejvýš jednou týdně; když nerozhodnete, platí výchozí volba.</p>
      {pending.length > 0 && (
        <p className="notice small">
          Čeká na vás: {pending.map((e) => e.title).join(', ')} (schránka na záložce Týden).
        </p>
      )}

      {visionPickPending(game) && (
        <div className="w5-pick">
          <strong>Vize klubu na 3 roky</strong>
          <p className="small muted">Zvolte do {formatShortDate(visionPickPending(game)!.deadline)}, jinak platí vyvážená cesta. Další volba za 3 roky nebo po výměně trenéra.</p>
          <div className="w5-choices">
            {visionChoices(game).map((c) => (
              <button key={c.id} className="choice" disabled={locked} onClick={() => onResult(chooseVision(game, c.id))}>
                <strong>{c.label}</strong>
                <span className="small muted">{c.hint}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {vision && vp && (
        <div className="w5-vision">
          <div className="row-between">
            <strong>Vize: {VISION_LABEL[vision.kind]}</strong>
            <span className="muted small num">do 30. 6. {vision.until.slice(0, 4)}</span>
          </div>
          <Meter value={vp.progress} />
          <p className="small num">Plnění {vp.progress} % · ovlivňuje hodnocení majitele, nabídku projektů a nákupy ředitele</p>
          <ul className="plain small">
            {vp.lines.map((l) => (
              <li key={l.text}>
                <span aria-hidden="true">{l.ok ? '✔' : '○'}</span> {l.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {goals && !goals.result && (
        <div className="w5-goals small">
          <strong>Cíle z bilanční schůzky ({goals.season}/{String(goals.season + 1).slice(2)})</strong>
          <ul className="plain">
            <li>Umístění do {goals.position}. místa</li>
            <li>Aspoň {goals.youth} hráči do 21 let s 10+ zápasy</li>
            <li>Provozní výsledek bez ztráty</li>
          </ul>
        </div>
      )}

      <dl className="w5-list">
        {lines.map((l) => (
          <div key={l.id} className="w5-row">
            <dt>{l.title}</dt>
            <dd>
              <strong>{l.value}</strong>
              {l.detail && <span className="muted small w5-detail">{l.detail}</span>}
              <span className="small w5-next">Další: {l.next}</span>
              {l.id === 'platy' && od?.wageRule && (
                <button className="small" disabled={locked} onClick={() => onResult(cancelWageRule(game))}>
                  Zrušit pravidlo
                </button>
              )}
              {l.id === 'nazev' && deal?.original && (
                <button className="small" disabled={locked} onClick={() => onResult(buyBackStadiumName(game))}>
                  Odkoupit název zpět ({money(deal.buyBack)})
                </button>
              )}
              {l.id === 'komunita' && od?.community && !od.community.ended && (
                <button className="small" disabled={locked} onClick={() => onResult(stopCommunity(game))}>
                  Ukončit komunitní program
                </button>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
