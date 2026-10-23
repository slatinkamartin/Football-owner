import { useMemo, useState } from 'react';
import { seasonCardData, type GameState, type SeasonCardData } from '../../engine';

/** D1: karta sezóny ke sdílení – obrázek (SVG → PNG přes canvas), stažení jako záloha v Hra. */

const W = 1080;
const H = 1350;

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function clip(t: string, n: number): string {
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** Je barva světlá? (kvůli kontrastu textu na pruhu v barvách klubu) */
function light(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160;
}

export function seasonCardSvg(d: SeasonCardData): string {
  const [c1, c2] = d.colors;
  const ink = light(c1) ? '#111' : '#fff';
  const rows: [string, string][] = [
    ['Liga', d.position ? `${d.position}. místo${d.points !== undefined ? ` · ${d.points} bodů` : ''}` : 'sezóna začíná'],
    ['Soutěž', d.competition],
    ['Pohár', d.cup],
    ...(d.europe ? ([['Evropa', d.europe]] as [string, string][]) : []),
    ...(d.bestPlayer ? ([['Hráč sezóny', d.bestPlayer]] as [string, string][]) : []),
    ...(d.topScorer ? ([['Nejlepší střelec', d.topScorer]] as [string, string][]) : []),
    ...(d.record ? ([['Rekord', d.record.replace(/^Nejvyšší výhra: /, 'nejvyšší výhra ')]] as [string, string][]) : []),
    ...(d.goalText ? ([['Cíl', `${d.goalText} – ${d.goalMet ? 'splněn' : 'nesplněn'}`]] as [string, string][]) : []),
  ];
  const lines = rows
    .map(([k, v], i) => {
      const y = 470 + i * 96;
      return `<text x="90" y="${y}" font-size="30" fill="#8a948e" font-weight="600" letter-spacing="2">${esc(k.toUpperCase())}</text><text x="90" y="${y + 44}" font-size="40" fill="#17201b" font-weight="700">${esc(clip(v, 44))}</text>`;
    })
    .join('');
  const trophies = d.trophies.slice(0, 3).map((t, i) => `<text x="90" y="${1190 + i * 44}" font-size="30" fill="#1a7f4b" font-weight="600">★ ${esc(clip(t, 58))}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif">
<rect width="${W}" height="${H}" fill="#f4f6f4"/>
<rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="36" fill="#ffffff"/>
<path d="M40 76a36 36 0 0 1 36-36h${W - 152}a36 36 0 0 1 36 36v284H40Z" fill="${esc(c1)}"/>
<rect x="40" y="340" width="${W - 80}" height="20" fill="${esc(c2)}"/>
<circle cx="${W - 170}" cy="190" r="86" fill="${esc(c2)}" stroke="${ink}" stroke-opacity="0.35" stroke-width="6"/>
<text x="${W - 170}" y="214" font-size="68" text-anchor="middle" font-weight="800" fill="${esc(c1)}">${esc(d.shortName.slice(0, 2).toUpperCase())}</text>
<text x="90" y="130" font-size="34" fill="${ink}" fill-opacity="0.8" font-weight="600" letter-spacing="3">SEZÓNA ${esc(d.label)}${d.done ? '' : ' · PRŮBĚŽNĚ'}</text>
<text x="90" y="215" font-size="64" fill="${ink}" font-weight="800">${esc(clip(d.shortName, 18))}</text>
<text x="90" y="275" font-size="32" fill="${ink}" fill-opacity="0.85">${esc(clip(d.clubName, 40))}</text>
${d.ownerGrade ? `<text x="90" y="320" font-size="28" fill="${ink}" fill-opacity="0.85">Hodnocení majitele: ${esc(d.ownerGrade)}</text>` : ''}
${lines}
${trophies}
<text x="${W - 90}" y="${H - 80}" font-size="24" text-anchor="end" fill="#8a948e">Majitel · fotbalová hra</text>
</svg>`;
}

async function svgToPng(svg: string): Promise<Blob | null> {
  try {
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('obrázek'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
  } catch {
    return null;
  }
}

/** Uloží soubor: v publikované stránce přes claude.use('downloads'), jinak běžným odkazem (jako záloha v Hra). */
async function saveFile(filename: string, blob: Blob): Promise<void> {
  const host = (window as unknown as { claude?: { use?: (n: string) => Promise<{ save: (r: { filename: string; data: Blob }) => Promise<unknown> } | null> } }).claude;
  if (host?.use) {
    const downloads = await host.use('downloads').catch(() => null);
    if (downloads) {
      await downloads.save({ filename, data: blob }).catch(() => undefined);
      return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Náhled karty sezóny a tlačítko stáhnout (ve výroční zprávě a v Hra). */
export function SeasonCard({ game, season, compact }: { game: GameState; season?: number; compact?: boolean }) {
  const data = useMemo(() => seasonCardData(game, season), [game, season]);
  const svg = useMemo(() => seasonCardSvg(data), [data]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(!compact);
  const download = async () => {
    setBusy(true);
    const base = `karta-sezony-${data.shortName}-${data.label}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.-]+/g, '-');
    const png = await svgToPng(svg);
    await saveFile(png ? `${base}.png` : `${base}.svg`, png ?? new Blob([svg], { type: 'image/svg+xml' }));
    setBusy(false);
  };
  return (
    <div className="season-card">
      <div className="row-between">
        <h3>Karta sezóny {data.label}</h3>
        <div className="season-card-actions">
          {compact && (
            <button className="small" onClick={() => setOpen(!open)}>
              {open ? 'Skrýt' : 'Náhled'}
            </button>
          )}
          <button className="primary small" onClick={download} disabled={busy}>
            {busy ? 'Připravuji…' : 'Stáhnout obrázek'}
          </button>
        </div>
      </div>
      {open && <img className="season-card-img" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={`Karta sezóny ${data.label}: ${data.shortName}`} />}
      <p className="muted small">Obrázek s výsledky sezóny ke sdílení (PNG {W}×{H}).</p>
    </div>
  );
}
