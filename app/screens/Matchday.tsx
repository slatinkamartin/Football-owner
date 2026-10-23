/**
 * V2 (B9): den zápasu přes celou obrazovku. Obal kolem existujícího přenosu (LiveMatch / EuroLive):
 * pod přenosem je ilustrace stadionu (SVG) v barvách domácího klubu, s tribunami, kotlem
 * a světly. Přenos sám (výsledková tabule, kotel, komentář, rozhodnutí) zůstává beze změny,
 * styl ho jen roztáhne na celou obrazovku.
 */
import { useState, type ReactNode } from 'react';
import { nextEuroMatch, nextOwnFixture, type GameState } from '../../engine';

export function MatchdayStage({ game, children, kind }: { game: GameState; children: ReactNode; kind?: string }) {
  // Stadion v barvách domácího klubu (u evropského zápasu venku neutrální modrá).
  const own = game.clubs[game.owner.clubId];
  const next = nextOwnFixture(game);
  const euro = kind === 'evropa' ? nextEuroMatch(game) : undefined;
  const now: [string, string] = euro ? (euro.home ? own.colors : ['#2b4aa8', '#e9eef5']) : next ? game.clubs[next.fixture.homeId].colors : own.colors;
  const [homeColors] = useState(now); // barvy se během přenosu nemění
  const [c1, c2] = homeColors;
  // Diváci v kotli: deterministické tečky (bez náhody při každém vykreslení).
  const dots: { x: number; y: number; c: string }[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let row = 0; row < 7; row++) {
    for (let i = 0; i < 46; i++) {
      const x = 8 + i * 21.5 + (row % 2) * 10 + rnd() * 4;
      const y = 112 + row * 13 + rnd() * 3;
      const r = rnd();
      dots.push({ x, y, c: r < 0.5 ? c1 : r < 0.8 ? c2 : '#d9dfe8' });
    }
  }
  return (
    <div className={`matchday-stage${kind ? ` md-${kind}` : ''}`}>
      <svg className="md-backdrop" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="md-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0b1220" />
            <stop offset="1" stopColor="#1b2a3c" />
          </linearGradient>
          <linearGradient id="md-grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2f8f4e" />
            <stop offset="1" stopColor="#1f6b37" />
          </linearGradient>
          <radialGradient id="md-light" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#fffbe6" stopOpacity="0.9" />
            <stop offset="1" stopColor="#fffbe6" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="1000" height="600" fill="url(#md-sky)" />
        {[120, 880].map((x) => (
          <g key={x}>
            <circle cx={x} cy="40" r="90" fill="url(#md-light)" className="md-flood" />
            <rect x={x - 22} y="28" width="44" height="18" rx="3" fill="#e9eef5" />
          </g>
        ))}
        {/* tribuny */}
        <path d="M0 100 L1000 100 L1000 210 L0 210 Z" fill="#1d2633" />
        <path d="M0 100 L1000 100 L1000 108 L0 108 Z" fill={c1} />
        <g className="md-crowd">
          {dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r="4.2" fill={d.c} />
          ))}
        </g>
        {/* transparent kotle */}
        <rect x="70" y="186" width="260" height="20" fill={c1} />
        <rect x="330" y="186" width="120" height="20" fill={c2} />
        <rect x="560" y="186" width="380" height="20" fill={c1} opacity="0.85" />
        {/* hřiště */}
        <path d="M-60 600 L120 230 L880 230 L1060 600 Z" fill="url(#md-grass)" />
        <g fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="2.5">
          <path d="M-20 590 L135 245 L865 245 L1020 590 Z" />
          <path d="M500 245 L500 590" />
          <ellipse cx="500" cy="380" rx="120" ry="48" />
          <path d="M330 245 L320 290 L680 290 L670 245" />
        </g>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <path key={i} d={`M${120 + i * 126} 230 L${-60 + i * 186} 600 L${30 + i * 186} 600 L${183 + i * 126} 230 Z`} fill="rgba(255,255,255,.035)" />
        ))}
      </svg>
      <div className="md-vignette" aria-hidden="true" />
      {children}
    </div>
  );
}
