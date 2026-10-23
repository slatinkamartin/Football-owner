/**
 * V2: jednotné drobné komponenty rozhraní: erb klubu, portrét z iniciál s kroužkem nálady,
 * šipka trendu, podzáložky a karta, kterou jde odsunout (na mobilu tahem, jinde křížkem).
 */
import { useRef, useState, type ReactNode } from 'react';
import { Icon } from './icons';

/** Erb klubu: štít v barvách klubu s iniciálami. */
export function Crest({ colors, name, size = 32 }: { colors: [string, string]; name: string; size?: number }) {
  const initials = crestInitials(name);
  const id = `cr-${(colors[0] + colors[1] + name).replace(/[^a-z0-9]/gi, '')}`;
  return (
    <svg className="crest-svg" width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={`Erb: ${name}`}>
      <defs>
        <clipPath id={id}>
          <path d="M20 2l15 5v11c0 9.5-6.4 16.6-15 20-8.6-3.4-15-10.5-15-20V7z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width="40" height="40" fill={colors[0]} />
        <path d="M20 0h20v40H20z" fill={colors[1]} opacity="0.95" />
        <path d="M0 24h40v6H0z" fill={colors[0]} />
      </g>
      <path d="M20 2l15 5v11c0 9.5-6.4 16.6-15 20-8.6-3.4-15-10.5-15-20V7z" fill="none" stroke="rgba(0,0,0,.35)" strokeWidth="1.2" />
      <text x="20" y="21" textAnchor="middle" fontSize={initials.length > 2 ? 9 : 11} fontWeight="800" fill="#fff" stroke="rgba(0,0,0,.55)" strokeWidth="2.2" paintOrder="stroke" fontFamily="system-ui, sans-serif">
        {initials}
      </text>
    </svg>
  );
}

export function crestInitials(name: string): string {
  const skip = new Set(['fc', 'fk', 'sk', 'ac', 'mfk', 'sfc', 'tj', 'sk.', 'a.s.', 'praha', '1905', 'z.s.']);
  const words = name.split(/\s+/).filter((w) => w && !skip.has(w.toLowerCase()) && !/^\d+$/.test(w));
  if (!words.length) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const AVATAR_COLORS = ['#3b6fc4', '#8a5cc4', '#c45c8a', '#c4793b', '#2e8f8a', '#5c7a2e', '#7a5c3b', '#3b8fc4'];

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Portrét z iniciál v barvě podle jména, kolem kroužek nálady (0–100). */
export function Avatar({ name, mood, size = 44 }: { name: string; mood?: number; size?: number }) {
  const parts = name.replace(/\([^)]*\)/g, '').replace(/[„“"]/g, '').split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  const color = AVATAR_COLORS[hashStr(name) % AVATAR_COLORS.length];
  const r = 21;
  const c = 2 * Math.PI * r;
  const m = mood === undefined ? undefined : Math.max(0, Math.min(100, mood));
  const tone = m === undefined ? '' : m >= 60 ? 'good' : m >= 35 ? 'warn' : 'bad';
  return (
    <svg className="avatar" width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={m === undefined ? name : `${name}, nálada ${Math.round(m)} ze 100`}>
      <circle cx="24" cy="24" r="17" fill={color} />
      <text x="24" y="29" textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">{initials}</text>
      {m !== undefined && (
        <>
          <circle cx="24" cy="24" r={r} fill="none" className="avatar-track" strokeWidth="3" />
          <circle cx="24" cy="24" r={r} fill="none" className={`avatar-ring ${tone}`} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(c * m) / 100} ${c}`} transform="rotate(-90 24 24)" />
        </>
      )}
    </svg>
  );
}

/** Šipka trendu s číslem. */
export function Trend({ value, title, suffix = '' }: { value: number; title?: string; suffix?: string }) {
  const v = Math.round(value);
  const cls = v > 0 ? 'pos' : v < 0 ? 'neg' : 'muted';
  return (
    <span className={`trend ${cls}`} title={title}>
      <Icon name={v > 0 ? 'up' : v < 0 ? 'dn' : 'flat'} size={14} />
      {v !== 0 && <span className="num">{Math.abs(v)}{suffix}</span>}
    </span>
  );
}

export interface SubTab<T extends string> {
  id: T;
  label: string;
  count?: number;
  hidden?: boolean;
}

/** Podzáložky hlavní záložky (stejný vzhled jako ostatní podzáložky ve hře). */
export function SubTabs<T extends string>({ tabs, value, onChange, label }: { tabs: SubTab<T>[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <nav className="subtabs main-subtabs" aria-label={label}>
      {tabs.filter((t) => !t.hidden).map((t) => (
        <button key={t.id} className={value === t.id ? 'active' : ''} aria-current={value === t.id ? 'page' : undefined} onClick={() => onChange(t.id)}>
          {t.label}
          {!!t.count && <span className="subtab-count">{t.count}</span>}
        </button>
      ))}
    </nav>
  );
}

/**
 * Karta, kterou jde odsunout: na dotykovém displeji tahem do strany, jinak křížkem.
 * Odsunutí platí do `resetKey` (např. do dalšího týdne).
 */
export function Dismissible({ id, resetKey, children, className = '' }: { id: string; resetKey: string; children: ReactNode; className?: string }) {
  const storeKey = `majitel:odsunuto:${id}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(storeKey) === resetKey;
    } catch {
      return false;
    }
  });
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; lock?: 'x' | 'y' } | null>(null);
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(storeKey, resetKey);
    } catch {
      /* jen do zavření */
    }
  };
  if (hidden) {
    return (
      <button className="linkbtn dismissed-restore" onClick={() => { setHidden(false); setDx(0); try { localStorage.removeItem(storeKey); } catch { /* */ } }}>
        Zobrazit skrytou kartu ›
      </button>
    );
  }
  return (
    <div
      className={`dismissible ${className}`}
      style={dx ? { transform: `translateX(${dx}px)`, opacity: Math.max(0.2, 1 - Math.abs(dx) / 260) } : undefined}
      onTouchStart={(e) => { const t = e.touches[0]; start.current = { x: t.clientX, y: t.clientY }; }}
      onTouchMove={(e) => {
        const s = start.current;
        if (!s) return;
        const t = e.touches[0];
        const mx = t.clientX - s.x;
        const my = t.clientY - s.y;
        if (!s.lock && (Math.abs(mx) > 10 || Math.abs(my) > 10)) s.lock = Math.abs(mx) > Math.abs(my) * 1.4 ? 'x' : 'y';
        if (s.lock === 'x') setDx(mx);
      }}
      onTouchEnd={() => {
        if (Math.abs(dx) > 110) hide();
        else setDx(0);
        start.current = null;
      }}
    >
      <button className="dismiss-x" aria-label="Skrýt kartu do dalšího týdne" title="Skrýt do dalšího týdne" onClick={hide}>
        <Icon name="close" size={16} />
      </button>
      {children}
    </div>
  );
}
