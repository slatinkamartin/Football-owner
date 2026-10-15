import { useMemo, useState, type ReactNode } from 'react';

/** Stav, který si prohlížeč pamatuje mezi návštěvami (řazení, filtry). Bez úložiště funguje jen v paměti. */
export function useStoredState<T>(key: string, initial: T): [T, (value: T) => void] {
  const storageKey = `majitel:ui:${key}`;
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? { ...(initial as object), ...JSON.parse(raw) } : initial;
    } catch {
      return initial;
    }
  });
  const set = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Úložiště může být zakázané, nastavení pak platí jen do zavření stránky.
    }
  };
  return [value, set];
}

export interface Column<T> {
  key: string;
  label: string;
  /** Hodnota pro řazení (a výchozí zobrazení). Bez ní sloupec nejde řadit. */
  value?: (row: T) => number | string;
  render?: (row: T) => ReactNode;
  num?: boolean;
  hideSm?: boolean;
  title?: string;
  className?: (row: T) => string;
}

type Sort = { key: string; dir: 'asc' | 'desc' };

export function DataTable<T>({
  id,
  rows,
  columns,
  rowKey,
  initialSort,
  onRowClick,
  rowClassName,
  limit,
  empty = 'Nic tu není.',
}: {
  id: string;
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  initialSort?: Sort;
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
  limit?: number;
  empty?: string;
}) {
  const [sort, setSort] = useStoredState<{ s: Sort | null }>(`razeni:${id}`, { s: initialSort ?? null });
  const current = sort.s && columns.some((c) => c.key === sort.s!.key && c.value) ? sort.s : (initialSort ?? null);

  const sorted = useMemo(() => {
    if (!current) return rows;
    const col = columns.find((c) => c.key === current.key);
    if (!col?.value) return rows;
    const factor = current.dir === 'asc' ? 1 : -1;
    const get = col.value;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'cs');
      return cmp * factor;
    });
  }, [rows, columns, current]);

  const shown = limit ? sorted.slice(0, limit) : sorted;

  const toggle = (col: Column<T>) => {
    if (!col.value) return;
    const sample = rows.length ? col.value(rows[0]) : 0;
    const firstDir: Sort['dir'] = typeof sample === 'number' ? 'desc' : 'asc';
    const dir: Sort['dir'] = current?.key === col.key ? (current.dir === 'asc' ? 'desc' : 'asc') : firstDir;
    setSort({ s: { key: col.key, dir } });
  };

  return (
    <>
      <div className="table-wrap">
        <table className={onRowClick ? 'clickable' : undefined}>
          <thead>
            <tr>
              {columns.map((c) => {
                const active = current?.key === c.key;
                const aria = active ? (current!.dir === 'asc' ? 'ascending' : 'descending') : 'none';
                return (
                  <th key={c.key} className={`${c.num ? 'num' : ''} ${c.hideSm ? 'hide-sm' : ''}`} aria-sort={c.value ? aria : undefined} title={c.title}>
                    {c.value ? (
                      <button className={`sort ${active ? 'active' : ''}`} onClick={() => toggle(c)}>
                        {c.label}
                        <span className="sort-arrow" aria-hidden="true">{active ? (current!.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={rowKey(row)} className={rowClassName?.(row)} onClick={onRowClick ? () => onRowClick(row) : undefined}>
                {columns.map((c) => (
                  <td key={c.key} className={`${c.num ? 'num' : ''} ${c.hideSm ? 'hide-sm' : ''} ${c.className?.(row) ?? ''}`}>
                    {c.render ? c.render(row) : c.value ? c.value(row) : null}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="muted">{empty}</p>}
      {limit && rows.length > limit && (
        <p className="muted small">
          Zobrazeno {limit} z {rows.length}. Zužte výběr filtry nebo změňte řazení.
        </p>
      )}
    </>
  );
}

/** Přepínací tlačítka pro filtr (jedna nebo žádná volba). */
export function Chips<V extends string>({
  options,
  value,
  onChange,
  allLabel = 'vše',
}: {
  options: { value: V; label: string }[];
  value: V | '';
  onChange: (v: V | '') => void;
  allLabel?: string;
}) {
  return (
    <div className="chips" role="group">
      <button className={value === '' ? 'active' : ''} onClick={() => onChange('')}>{allLabel}</button>
      {options.map((o) => (
        <button key={o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
