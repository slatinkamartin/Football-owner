/**
 * V2: téma rozhraní. Světlý/tmavý režim (podle systému nebo ručně) a barvy klubu jako CSS proměnné
 * s hlídaným kontrastem (WCAG): akcentová barva musí mít proti kartě aspoň 4,5:1, text na akcentu
 * se volí bílý nebo tmavý podle toho, co je čitelnější.
 */

export type ThemePref = 'auto' | 'light' | 'dark';
const KEY = 'majitel:tema';

export function loadThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveThemePref(p: ThemePref): void {
  try {
    if (p === 'auto') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, p);
  } catch {
    /* soukromé okno: volba platí jen do zavření */
  }
}

export function systemDark(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}

export function isDark(p: ThemePref): boolean {
  return p === 'dark' || (p === 'auto' && systemDark());
}

/** Nastaví data-theme na <html>: „auto“ atribut nemá a řídí se média dotazem v CSS. */
export function applyThemePref(p: ThemePref): void {
  const el = document.documentElement;
  if (p === 'auto') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', p);
}

type RGB = [number, number, number];

export function parseColor(c: string): RGB | undefined {
  const s = c.trim().toLowerCase();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((x) => x + x).join('') : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = s.match(/^rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const named: Record<string, RGB> = { white: [255, 255, 255], black: [0, 0, 0], red: [204, 0, 0], blue: [0, 60, 170], green: [0, 128, 0], yellow: [255, 215, 0], navy: [0, 0, 128], gold: [212, 175, 55] };
  return named[s];
}

const hex = (c: RGB) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

function lum([r, g, b]: RGB): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: RGB, b: RGB): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function saturation([r, g, b]: RGB): number {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
}

/** Posune barvu k cíli (černé/bílé), dokud nemá proti pozadí požadovaný kontrast. */
function ensureContrast(c: RGB, bg: RGB, min: number, toward: RGB): RGB {
  let out = c;
  for (let i = 0; i <= 20 && contrast(out, bg) < min; i++) out = mix(c, toward, i / 20);
  return out;
}

export interface ClubPalette {
  accent: string;
  accentSoft: string;
  onAccent: string;
  club: string;
  club2: string;
  onClub: string;
}

const LIGHT_CARD: RGB = [255, 255, 255];
const DARK_CARD: RGB = [28, 34, 31];
const DARK_BG: RGB = [17, 21, 19];
const LIGHT_BG: RGB = [244, 246, 244];
const FALLBACK: RGB = [26, 127, 75];

/**
 * Paleta z barev klubu. Akcent je ta z barev, která je výraznější (ne bílá, ne skoro černá),
 * upravená na čitelný kontrast proti kartě v daném režimu.
 */
export function clubPalette(colors: [string, string] | undefined, dark: boolean): ClubPalette {
  const cs = (colors ?? []).map(parseColor).filter((x): x is RGB => !!x);
  const club = cs[0] ?? FALLBACK;
  const club2 = cs[1] ?? [255, 255, 255];
  const score = (c: RGB) => saturation(c) * 2 + (lum(c) > 0.85 ? -3 : lum(c) > 0.45 ? -1.2 : 0) + (lum(c) < 0.015 ? -1 : 0);
  let base = [...cs].sort((a, b) => score(b) - score(a))[0] ?? FALLBACK;
  if (saturation(base) < 0.12 && lum(base) > 0.6) base = FALLBACK; // bílo-šedý klub: zůstane zelená
  const card = dark ? DARK_CARD : LIGHT_CARD;
  const accent = ensureContrast(base, card, 4.5, dark ? [255, 255, 255] : [0, 0, 0]);
  const white: RGB = [255, 255, 255];
  const ink: RGB = [17, 21, 19];
  const onAccent = contrast(white, accent) >= contrast(ink, accent) ? '#ffffff' : '#111513';
  const onClub = contrast(white, club) >= contrast(ink, club) ? '#ffffff' : '#111513';
  const soft = mix(accent, dark ? DARK_BG : LIGHT_BG, dark ? 0.78 : 0.86);
  return { accent: hex(accent), accentSoft: hex(soft), onAccent, club: hex(club), club2: hex(club2), onClub };
}

/** Zapíše barvy klubu do CSS proměnných na <html>. */
export function applyClubColors(colors: [string, string] | undefined, dark: boolean): void {
  const p = clubPalette(colors, dark);
  const s = document.documentElement.style;
  s.setProperty('--accent', p.accent);
  s.setProperty('--accent-soft', p.accentSoft);
  s.setProperty('--on-accent', p.onAccent);
  s.setProperty('--club', p.club);
  s.setProperty('--club-2', p.club2);
  s.setProperty('--on-club', p.onClub);
}

export function clearClubColors(): void {
  const s = document.documentElement.style;
  for (const k of ['--accent', '--accent-soft', '--on-accent', '--club', '--club-2', '--on-club']) s.removeProperty(k);
}
