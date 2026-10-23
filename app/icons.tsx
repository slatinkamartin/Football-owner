/**
 * V2: sada ikon jako inline SVG (žádná knihovna). Všechny ikony mají mřížku 24×24, tah 1,8
 * a barvu z `currentColor`, takže přebírají barvu textu (světlý i tmavý režim).
 */
import type { ReactNode } from 'react';

const P: Record<string, ReactNode> = {
  // hlavní záložky
  tyden: (<><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="M8 14h3v3H8z" /></>),
  tym: (<><path d="M8 4l-4.5 2.5L5 11l2-.8V20h10v-9.8l2 .8 1.5-4.5L16 4c-.6 1.6-2.1 2.6-4 2.6S8.6 5.6 8 4z" /></>),
  trh: (<><path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" /></>),
  klub: (<><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6z" /><path d="M9 11.5l2 2 4-4" /></>),
  penize: (<><ellipse cx="12" cy="6.5" rx="7" ry="3" /><path d="M5 6.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5M5 11.5v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></>),
  liga: (<><path d="M7 4h10v4.5a5 5 0 01-10 0z" /><path d="M7 6H4v1.5A3 3 0 007 10.5M17 6h3v1.5a3 3 0 01-3 3M12 13.5V17M8.5 20.5h7M9.5 17h5v3.5h-5z" /></>),
  hra: (<><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></>),
  // agenda a postavy
  trener: (<><circle cx="12" cy="7.5" r="3.5" /><path d="M5 20c.6-3.8 3.4-6 7-6s6.4 2.2 7 6" /><path d="M16.5 4.5l3-1.5" /></>),
  trenink: (<><circle cx="12" cy="16" r="4.5" /><path d="M12 11.5l-2.6 1.9 1 3h3.2l1-3zM5 4l3 3M19 4l-3 3M12 3v3" /></>),
  sponzor: (<><path d="M3 12l4-4 5 3 5-3 4 4-4 4H7z" /><path d="M10 13.5l2 1.5 2-1.5" /></>),
  skauting: (<><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5.5 5.5" /></>),
  radnice: (<><path d="M3 20.5h18M5 20.5V10M19 20.5V10M9 20.5V10M15 20.5V10M3 10h18L12 3.5z" /></>),
  kotel: (<><path d="M4 10l16-5v14L4 14z" /><path d="M7 14.5V19h3.5v-3.5" /></>),
  media: (<><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21M8.5 21h7" /></>),
  prestup: (<><path d="M7 7h10l-3-3M17 17H7l3 3" /><circle cx="12" cy="12" r="1.5" /></>),
  postava: (<><circle cx="9" cy="8" r="3.2" /><path d="M3 19.5c.5-3.3 2.9-5.2 6-5.2s5.5 1.9 6 5.2" /><path d="M16 4.8a3.2 3.2 0 010 6.4M18 14.6c1.7.7 2.8 2.4 3 4.9" /></>),
  projekt: (<><path d="M5 21V4M5 4h11l-2 3.5 2 3.5H5" /></>),
  // ovládání a stavy
  inbox: (<><path d="M3.5 13l2.5-8h12l2.5 8v6.5h-17z" /><path d="M3.5 13h5l1.5 2.5h4L15.5 13h5" /></>),
  advisor: (<><path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z" /></>),
  pulse: (<><path d="M3 12h4l2.5-6 5 12 2.5-6h4" /></>),
  news: (<><rect x="3.5" y="4.5" width="14" height="15" rx="2" /><path d="M17.5 8.5h3V18a1.5 1.5 0 01-3 0M7 8.5h7M7 12h7M7 15.5h4" /></>),
  ball: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5l3.6 2.6-1.4 4.2H9.8l-1.4-4.2zM12 3.5v4M15.6 10.1l4.3-1.4M14.2 14.3l2.6 3.6M9.8 14.3l-2.6 3.6M8.4 10.1l-4.3-1.4" /></>),
  play: (<><path d="M7 4.5v15l12-7.5z" /></>),
  next: (<><path d="M5 5l8 7-8 7M14 5l5 7-5 7" /></>),
  close: (<><path d="M6 6l12 12M18 6L6 18" /></>),
  chevron: (<><path d="M9 5l7 7-7 7" /></>),
  down: (<><path d="M5 9l7 7 7-7" /></>),
  up: (<><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" /></>),
  dn: (<><path d="M12 5v14M5.5 12.5L12 19l6.5-6.5" /></>),
  flat: (<><path d="M5 12h14M13 6l6 6-6 6" /></>),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></>),
  moon: (<><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" /></>),
  auto: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5v17A8.5 8.5 0 0012 3.5z" fill="currentColor" stroke="none" /></>),
  help: (<><circle cx="12" cy="12" r="8.5" /><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.3M12 17h.01" /></>),
  clock: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></>),
  fans: (<><circle cx="7" cy="9" r="2.5" /><circle cx="17" cy="9" r="2.5" /><circle cx="12" cy="7" r="2.8" /><path d="M2.5 18c.4-2.5 2.2-4 4.5-4M21.5 18c-.4-2.5-2.2-4-4.5-4M6.5 19.5c.5-3 2.7-5 5.5-5s5 2 5.5 5" /></>),
  handshake: (<><path d="M2.5 11l4-4.5 3.5 2 2-1.5 3.5 1 4 3.5M2.5 11l6 6.5c.7.7 1.8.7 2.5 0M21.5 10.5l-6 7c-.7.7-1.8.7-2.5 0M9.5 14l2 2M12 12l2.5 2.5" /></>),
  star: (<><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" /></>),
  cup: (<><path d="M7.5 4h9v5a4.5 4.5 0 01-9 0zM12 13.5v3.5M8.5 20h7M10 17h4v3h-4z" /></>),
  stadium: (<><ellipse cx="12" cy="9" rx="9" ry="3.5" /><path d="M3 9v6c0 1.9 4 3.5 9 3.5s9-1.6 9-3.5V9" /><ellipse cx="12" cy="9.5" rx="4.5" ry="1.5" /></>),
  check: (<><path d="M5 12.5l4.5 4.5L19 7" /></>),
  menu: (<><path d="M4 7h16M4 12h16M4 17h16" /></>),
};

export type IconName = keyof typeof P | string;

/** Ikona z inline SVG. Neznámé jméno vykreslí tečku (nikdy nespadne). */
export function Icon({ name, size = 20, className, title }: { name: IconName; size?: number; className?: string; title?: string }) {
  const body = P[name] ?? <circle cx="12" cy="12" r="3" />;
  return (
    <svg
      className={`icon${className ? ` ${className}` : ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      {body}
    </svg>
  );
}

export const ICON_NAMES = Object.keys(P);
