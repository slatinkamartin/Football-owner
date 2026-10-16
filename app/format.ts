/** Částky: miliony s jedním desetinným místem, tisíce zaokrouhleně, malé částky přesně. */
export function money(value: number): string {
  const abs = Math.abs(value);
  if (abs < 0.5) return '0 Kč';
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;
  }
  if (abs >= 10_000) return `${Math.round(value / 1_000).toLocaleString('cs-CZ')} tis. Kč`;
  return `${Math.round(value).toLocaleString('cs-CZ')} Kč`;
}

export function num(value: number): string {
  return Math.round(value).toLocaleString('cs-CZ');
}
