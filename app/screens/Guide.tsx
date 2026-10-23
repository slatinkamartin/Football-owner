/**
 * V2 (B10): průvodce prvními týdny. Jen v nové hře (zapne se při startu), tři krátké tipy
 * (agenda, schránka, posun hry) u příslušných karet. Tip zmizí po přečtení, sám po třech
 * týdnech hry, a celý průvodce jde vypnout (i v Hře › Vzhled a nápověda).
 */
import { useState } from 'react';
import type { GameState } from '../../engine';
import { Icon } from '../icons';

export type GuideTipId = 'agenda' | 'inbox' | 'step';

const TIPS: { id: GuideTipId; title: string; text: string }[] = [
  { id: 'agenda', title: 'Agenda týdne', text: 'Každý týden máte několik akcí: porada s trenérem, oběd se sponzorem, cesta za hráčem… Vyberte, čemu se tento týden věnujete. Nevyužité akce v neděli propadnou.' },
  { id: 'inbox', title: 'Schránka rozhodnutí', text: 'Všechno, co čeká na vaše slovo, je tady seřazené podle termínu. Když nerozhodnete, platí výchozí volba – nic se nezasekne.' },
  { id: 'step', title: 'Posun hry', text: 'Tlačítkem posunu jdete na další zápas, milník nebo o týden dál. V předvečer zápasu otevře přípravu a přenos.' },
];

interface GuideState {
  start: string;
  seen: GuideTipId[];
  off?: boolean;
}

const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

const key = (game: GameState) => `majitel:pruvodce:${game.seed}`;

function load(game: GameState): GuideState | undefined {
  try {
    const raw = localStorage.getItem(key(game));
    return raw ? (JSON.parse(raw) as GuideState) : undefined;
  } catch {
    return undefined;
  }
}

function save(game: GameState, s: GuideState): void {
  try {
    localStorage.setItem(key(game), JSON.stringify(s));
  } catch {
    /* bez úložiště průvodce platí jen do zavření */
  }
}

/** Zapne průvodce pro právě začatou hru. */
export function startGuide(game: GameState): void {
  save(game, { start: game.date, seen: [] });
}

export function guideAvailable(game: GameState): boolean {
  return !!load(game);
}

export function guideEnabled(game: GameState): boolean {
  const s = load(game);
  return !!s && !s.off;
}

export function setGuideEnabled(game: GameState, on: boolean): void {
  const s = load(game) ?? { start: game.date, seen: [] };
  save(game, on ? { start: game.date, seen: [], off: false } : { ...s, off: true });
}

export function useGuide(game: GameState): { tip?: (typeof TIPS)[number]; index: number; total: number; next: () => void; off: () => void } {
  const [, force] = useState(0);
  const s = load(game);
  const total = TIPS.length;
  if (!s || s.off || daysBetween(s.start, game.date) > 21) return { index: 0, total, next: () => {}, off: () => {} };
  const left = TIPS.filter((t) => !s.seen.includes(t.id));
  const tip = left[0];
  return {
    tip,
    index: total - left.length + 1,
    total,
    next: () => {
      if (!tip) return;
      save(game, { ...s, seen: [...s.seen, tip.id] });
      force((n) => n + 1);
    },
    off: () => {
      save(game, { ...s, off: true });
      force((n) => n + 1);
    },
  };
}

export function GuideTip({ guide, id }: { guide: ReturnType<typeof useGuide>; id: GuideTipId }) {
  if (guide.tip?.id !== id) return null;
  return (
    <aside className={`guide-tip guide-${id}`} role="note" aria-label={`Nápověda: ${guide.tip.title}`}>
      <span className="guide-icon"><Icon name="help" size={18} /></span>
      <div>
        <strong>{guide.tip.title}</strong> <span className="muted small">tip {guide.index} z {guide.total}</span>
        <p className="small">{guide.tip.text}</p>
        <div className="buttons">
          <button className="primary" onClick={guide.next}>{guide.index < guide.total ? 'Rozumím, další tip' : 'Rozumím'}</button>
          <button className="linkbtn" onClick={guide.off}>Vypnout nápovědy</button>
        </div>
      </div>
    </aside>
  );
}
