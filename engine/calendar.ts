/** Práce s daty ve formátu YYYY-MM-DD (vždy UTC, bez časových pásem). */

export function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

export function formatIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parseDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return formatIso(d);
}

export function dayOfWeek(iso: string): number {
  return parseDate(iso).getUTCDay();
}

export function monthDay(iso: string): string {
  return iso.slice(5);
}

/** Začátek sezóny (1. 7.), kdy se losuje a probíhá letní přestupní okno. */
export const SEASON_START = '07-01';
/** Uzavření sezóny: tabulky, postupy a sestupy. */
export const SEASON_END = '06-20';

function saturdaysBetween(from: string, to: string): string[] {
  const result: string[] = [];
  let d = from;
  while (dayOfWeek(d) !== 6) d = addDays(d, 1);
  for (; d <= to; d = addDays(d, 7)) result.push(d);
  return result;
}

/** Vybere `count` termínů rovnoměrně z dostupných sobot. Když nestačí, přidá středy. */
function spread(slots: string[], count: number): string[] {
  if (count <= slots.length) {
    return Array.from({ length: count }, (_, i) => slots[Math.floor((i * slots.length) / count)]);
  }
  const extra = slots.slice(0, count - slots.length).map((s) => addDays(s, 4));
  return [...slots, ...extra].sort();
}

/** Termíny kol pro sezónu: polovina na podzim, polovina na jaře. */
export function roundDates(season: number, rounds: number): string[] {
  const autumn = saturdaysBetween(`${season}-07-25`, `${season}-11-28`);
  const spring = saturdaysBetween(`${season + 1}-02-14`, `${season + 1}-06-06`);
  const firstHalf = Math.ceil(rounds / 2);
  return [...spread(autumn, firstHalf), ...spread(spring, rounds - firstHalf)];
}

const MONTHS = [
  'ledna', 'února', 'března', 'dubna', 'května', 'června',
  'července', 'srpna', 'září', 'října', 'listopadu', 'prosince',
];
const DAYS = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];

export function formatDate(iso: string, withDay = false): string {
  const d = parseDate(iso);
  const text = `${d.getUTCDate()}. ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return withDay ? `${DAYS[d.getUTCDay()]} ${text}` : text;
}

export function formatShortDate(iso: string): string {
  const d = parseDate(iso);
  return `${d.getUTCDate()}. ${d.getUTCMonth() + 1}.`;
}

export function seasonLabel(season: number): string {
  return `${season}/${String(season + 1).slice(2)}`;
}
