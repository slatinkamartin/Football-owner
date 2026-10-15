import { marketValue, playerAge, POSITION_LABEL, squadOf, teamStrength, type GameState, type Position } from '../../engine';
import { money } from '../format';

const ORDER: Position[] = ['GK', 'DF', 'MF', 'FW'];

export function Squad({ game }: { game: GameState }) {
  const squad = squadOf(game, game.owner.clubId).sort(
    (a, b) => ORDER.indexOf(a.position) - ORDER.indexOf(b.position) || b.overall - a.overall,
  );
  const wages = squad.reduce((s, p) => s + p.wage, 0);
  const value = squad.reduce((s, p) => s + marketValue(p, game.season), 0);

  return (
    <div className="stack">
      <section className="card">
        <h2>Kádr</h2>
        <p className="muted">
          Sestavu a taktiku určuje trenér. Kádr spravuje sportovní ředitel, majitel mu schvaluje rozpočet (v sekci Finance).
        </p>
        <dl className="kv inline">
          <dt>Hráčů</dt><dd>{squad.length}</dd>
          <dt>Síla základní sestavy</dt><dd>{teamStrength(squad).toFixed(1)}</dd>
          <dt>Platy měsíčně</dt><dd>{money(wages)}</dd>
          <dt>Hodnota kádru</dt><dd>{money(value)}</dd>
        </dl>
      </section>

      <section className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hráč</th><th>Pozice</th><th className="num">Věk</th>
                <th className="num">Hodnocení</th><th className="num">Potenciál</th>
                <th className="num hide-sm">Plat/měs.</th><th className="num hide-sm">Smlouva</th>
                <th className="num">Záp.</th><th className="num">Góly</th><th className="num hide-sm">Hodnota</th>
              </tr>
            </thead>
            <tbody>
              {squad.map((p) => (
                <tr key={p.id}>
                  <td>{p.firstName} {p.lastName}</td>
                  <td className="muted">{POSITION_LABEL[p.position]}</td>
                  <td className="num">{playerAge(p, game.season)}</td>
                  <td className="num"><span className="rating">{p.overall}</span></td>
                  <td className="num muted">{p.potential}</td>
                  <td className="num hide-sm">{money(p.wage)}</td>
                  <td className="num hide-sm">{p.contractUntil}</td>
                  <td className="num">{p.apps}</td>
                  <td className="num">{p.goals}</td>
                  <td className="num hide-sm">{money(marketValue(p, game.season))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
