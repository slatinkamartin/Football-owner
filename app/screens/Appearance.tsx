/**
 * V2 (B12, B10): vzhled a nápověda v Hře – světlý/tmavý režim (nebo podle systému) a průvodce prvními týdny.
 */
import type { GameState } from '../../engine';
import { Icon } from '../icons';
import type { ThemePref } from '../theme';
import { guideEnabled, setGuideEnabled } from './Guide';

const OPTIONS: { id: ThemePref; label: string; icon: string }[] = [
  { id: 'auto', label: 'Podle systému', icon: 'auto' },
  { id: 'light', label: 'Světlý', icon: 'sun' },
  { id: 'dark', label: 'Tmavý', icon: 'moon' },
];

export function AppearanceCard({ game, theme, onTheme, onGuide }: { game: GameState; theme: ThemePref; onTheme: (t: ThemePref) => void; onGuide: () => void }) {
  const guide = guideEnabled(game);
  return (
    <section className="card appearance-card">
      <h2>Vzhled a nápověda</h2>
      <p className="muted small">Barvy rozhraní se řídí barvami vašeho klubu. Režim zobrazení:</p>
      <div className="segmented theme-switch" role="radiogroup" aria-label="Režim zobrazení">
        {OPTIONS.map((o) => (
          <button key={o.id} role="radio" aria-checked={theme === o.id} className={theme === o.id ? 'active' : ''} onClick={() => onTheme(o.id)}>
            <Icon name={o.icon} size={16} /> {o.label}
          </button>
        ))}
      </div>
      <h3>Průvodce prvními týdny</h3>
      <p className="muted small">Krátké tipy k agendě, schránce rozhodnutí a posunu hry. Zobrazují se první tři týdny hry.</p>
      <button onClick={() => { setGuideEnabled(game, !guide); onGuide(); }}>{guide ? 'Vypnout nápovědy' : 'Zapnout nápovědy znovu'}</button>
    </section>
  );
}
