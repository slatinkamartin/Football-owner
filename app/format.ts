export function money(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;
  }
  return `${Math.round(value).toLocaleString('cs-CZ')} Kč`;
}

export function num(value: number): string {
  return Math.round(value).toLocaleString('cs-CZ');
}
