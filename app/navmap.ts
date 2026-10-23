/**
 * V2: mapa navigace. Šest hlavních záložek s podzáložkami a Hra. Staré cíle odkazů
 * (milníky, porada, rádce, zprávy: 'kadr', 'prestupy', 'finance'…) se překládají sem,
 * takže každý odkaz vede na správnou podzáložku.
 */
import type { FinanceTab } from './screens/Finance';

export type MainTab = 'tyden' | 'tym' | 'trh' | 'klub' | 'penize' | 'liga' | 'hra';
export type TymSub = 'kadr' | 'trenink' | 'vedeni' | 'postavy';
export type TrhSub = 'prestupy' | 'lov' | 'agenti' | 'zahranici';
export type KlubSub = 'stadion' | 'fanousci' | 'forum' | 'site' | 'majitel' | 'projekty' | 'odznaky';
export type LigaSub = 'tabulky' | 'zapasy' | 'pohary' | 'historie';
export type SubTabId = TymSub | TrhSub | KlubSub | LigaSub | FinanceTab;

export interface Target {
  main: MainTab;
  sub?: SubTabId;
}

export const MAIN_TABS: { id: MainTab; label: string; icon: string }[] = [
  { id: 'tyden', label: 'Týden', icon: 'tyden' },
  { id: 'tym', label: 'Tým', icon: 'tym' },
  { id: 'trh', label: 'Trh', icon: 'trh' },
  { id: 'klub', label: 'Klub', icon: 'klub' },
  { id: 'penize', label: 'Peníze', icon: 'penize' },
  { id: 'liga', label: 'Liga', icon: 'liga' },
];

export const DEFAULT_SUB: Partial<Record<MainTab, SubTabId>> = { tym: 'kadr', trh: 'prestupy', klub: 'stadion', liga: 'tabulky', penize: 'prehled' };

const FINANCE_SUBS = new Set(['prehled', 'rozpocet', 'prijmy', 'vydaje', 'prestupy', 'financovani', 'ucetnictvi']);

/** Starý nebo nový cíl odkazu → hlavní záložka a podzáložka. Neznámý cíl vede na Týden. */
export function resolveTarget(tab: string | undefined, sub?: string): Target {
  const t = (tab ?? '').toLowerCase();
  // Nový tvar „hlavni/pod“.
  if (t.includes('/')) {
    const [m, s] = t.split('/');
    return resolveTarget(m, s || sub);
  }
  switch (t) {
    case '':
    case 'tyden':
    case 'prehled':
    case 'domov':
    case 'rozhodnuti':
    case 'schranka':
    case 'agenda':
      return { main: 'tyden' };
    case 'tym':
      return { main: 'tym', sub: (sub as TymSub) ?? 'kadr' };
    case 'kadr':
    case 'soupiska':
      return { main: 'tym', sub: 'kadr' };
    case 'trenink':
    case 'training':
      return { main: 'tym', sub: 'trenink' };
    case 'vedeni':
    case 'lide':
    case 'people':
      return { main: 'tym', sub: 'vedeni' };
    case 'postavy':
    case 'kontakty':
    case 'characters':
      return { main: 'tym', sub: 'postavy' };
    case 'trh':
      return { main: 'trh', sub: (sub as TrhSub) ?? 'prestupy' };
    case 'prestupy':
    case 'transfers':
      return { main: 'trh', sub: 'prestupy' };
    case 'lov':
    case 'hunt':
    case 'skauting':
      return { main: 'trh', sub: 'lov' };
    case 'agenti':
      return { main: 'trh', sub: 'agenti' };
    case 'zahranici':
      return { main: 'trh', sub: 'zahranici' };
    case 'klub':
      return { main: 'klub', sub: (sub as KlubSub) ?? 'stadion' };
    case 'stadion':
      return { main: 'klub', sub: 'stadion' };
    case 'fanousci':
    case 'fans':
    case 'kotel':
      return { main: 'klub', sub: 'fanousci' };
    case 'forum':
      return { main: 'klub', sub: 'forum' };
    case 'site':
    case 'socialni':
    case 'social':
    case 'media':
      return { main: 'klub', sub: 'site' };
    case 'majitel':
    case 'owner':
      return { main: 'klub', sub: 'majitel' };
    case 'projekty':
    case 'projects':
    case 'cile':
      return { main: 'klub', sub: 'projekty' };
    case 'odznaky':
    case 'uspechy':
      return { main: 'klub', sub: 'odznaky' };
    case 'penize':
    case 'finance':
      return { main: 'penize', sub: sub && FINANCE_SUBS.has(sub) ? (sub as FinanceTab) : 'prehled' };
    case 'liga':
      return { main: 'liga', sub: (sub as LigaSub) ?? 'tabulky' };
    case 'tabulky':
    case 'tabulka':
      return { main: 'liga', sub: 'tabulky' };
    case 'zapasy':
    case 'matches':
      return { main: 'liga', sub: 'zapasy' };
    case 'pohar':
    case 'pohary':
    case 'evropa':
    case 'cup':
      return { main: 'liga', sub: 'pohary' };
    case 'historie':
      return { main: 'liga', sub: 'historie' };
    case 'hra':
    case 'nastaveni':
      return { main: 'hra' };
    default:
      if (FINANCE_SUBS.has(t)) return { main: 'penize', sub: t as FinanceTab };
      return { main: 'tyden' };
  }
}
