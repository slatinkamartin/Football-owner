import { createContext, useContext, useEffect, type ReactNode } from 'react';

export type ModalRef = { type: 'match' | 'player' | 'club'; id: string };

export interface Nav {
  open: (m: ModalRef) => void;
  /** Začít jednání o hráči (přepne na Přestupy). */
  negotiate: (playerId: string) => void;
  /** Přidat nebo odebrat hráče ze sledovaných. */
  watch?: (playerId: string) => void;
}

export const NavContext = createContext<Nav>({ open: () => {}, negotiate: () => {} });

export function useNav(): Nav {
  return useContext(NavContext);
}

export function PlayerLink({ id, children }: { id: string; children: ReactNode }) {
  const nav = useNav();
  return (
    <button
      className="namelink"
      onClick={(e) => {
        e.stopPropagation();
        nav.open({ type: 'player', id });
      }}
    >
      {children}
    </button>
  );
}

export function ClubLink({ id, children }: { id: string; children: ReactNode }) {
  const nav = useNav();
  return (
    <button
      className="namelink"
      onClick={(e) => {
        e.stopPropagation();
        nav.open({ type: 'club', id });
      }}
    >
      {children}
    </button>
  );
}

/** Překryvné okno (karta hráče, klubu, zápasu). Esc zavře, pod oknem se stránka neposouvá. */
export function Sheet({
  label,
  onClose,
  onBack,
  children,
}: {
  label: string;
  onClose: () => void;
  onBack?: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (onBack ?? onClose)();
    window.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, onBack]);

  return (
    <div className="overlay sheet-overlay" onClick={onClose}>
      <div className="card sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-bar">
          {onBack ? <button onClick={onBack}>‹ Zpět</button> : <span />}
          <button onClick={onClose}>Zavřít</button>
        </div>
        {children}
      </div>
    </div>
  );
}
