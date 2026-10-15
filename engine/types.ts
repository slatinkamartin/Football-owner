export type Position = 'GK' | 'DF' | 'MF' | 'FW';
export type Region = 'cechy' | 'morava';
export type Difficulty = 'snadna' | 'stredni' | 'tezka';

// ---------- Datový balíček ----------

export interface CompetitionDef {
  id: string;
  name: string;
  fullName?: string;
  tier: number;
  region?: Region;
  targetSize: number;
  /** Počet klubů, které postupují o úroveň výš. */
  promote: number;
  /** Počet klubů, které sestupují o úroveň níž. */
  relegate: number;
}

export interface ClubDef {
  id: string;
  name: string;
  shortName: string;
  city: string;
  region: Region;
  competition: string;
  reputation: number;
  stadium: Stadium;
  colors: [string, string];
  /** B-tým: id mateřského klubu. Nesmí hrát ve stejné soutěži ani v nejvyšší soutěži. */
  reserveOf?: string;
}

export interface DataPack {
  id: string;
  name: string;
  country: string;
  note?: string;
  competitions: CompetitionDef[];
  clubs: ClubDef[];
}

// ---------- Stav hry ----------

export interface Stadium {
  name: string;
  capacity: number;
}

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  birthYear: number;
  position: Position;
  overall: number;
  potential: number;
  clubId: string;
  /** Měsíční plat v Kč. */
  wage: number;
  /** Rok, kdy smlouva končí (30. 6.). */
  contractUntil: number;
  goals: number;
  apps: number;
}

export type FinanceCategory =
  | 'vstupne'
  | 'tv'
  | 'komercni'
  | 'platy'
  | 'provoz'
  | 'prestupy'
  | 'vklad';

export const INCOME_CATEGORIES: FinanceCategory[] = ['vstupne', 'tv', 'komercni', 'vklad'];
export const EXPENSE_CATEGORIES: FinanceCategory[] = ['platy', 'provoz', 'prestupy'];

export type FinanceTotals = Record<FinanceCategory, number>;

export interface Transaction {
  date: string;
  category: FinanceCategory;
  amount: number;
  note: string;
}

export interface ClubFinance {
  balance: number;
  /** Počet po sobě jdoucích konců měsíce se záporným zůstatkem. */
  monthsNegative: number;
  season: FinanceTotals;
  lastSeason?: FinanceTotals;
  /** Poslední transakce (jen u klubu hráče). */
  transactions: Transaction[];
}

export interface ClubPolicy {
  ticketPrice: number;
  /** Násobek běžného mzdového rozpočtu (0,7 až 1,5). */
  wageMultiplier: number;
  /** Rozpočet na letní posily v Kč. */
  transferBudget: number;
}

export interface Club {
  id: string;
  name: string;
  shortName: string;
  city: string;
  region: Region;
  reputation: number;
  stadium: Stadium;
  colors: [string, string];
  reserveOf?: string;
  generated?: boolean;
  policy: ClubPolicy;
  finance: ClubFinance;
}

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
  attendance: number;
  scorers: { playerId: string; clubId: string; minute: number }[];
}

export interface Fixture {
  id: string;
  round: number;
  date: string;
  homeId: string;
  awayId: string;
  result?: MatchResult;
}

export interface Competition extends CompetitionDef {
  clubIds: string[];
  fixtures: Fixture[];
}

export interface Owner {
  name: string;
  clubId: string;
  /** Podíl v klubu (0 až 1). */
  share: number;
  /** Osobní peníze majitele v Kč. */
  wallet: number;
  difficulty: Difficulty;
}

export interface NewsItem {
  date: string;
  kind: 'info' | 'vysledek' | 'varovani' | 'sezona';
  title: string;
  text?: string;
}

export interface SeasonRecord {
  season: number;
  champions: Record<string, string>;
  ownerClub: { competitionId: string; position: number; points: number };
}

export interface GameState {
  version: 1;
  packId: string;
  seed: number;
  rngState: number;
  date: string;
  /** Rok začátku aktuální sezóny (2026 = sezóna 2026/27). */
  season: number;
  owner: Owner;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  competitions: Record<string, Competition>;
  /** Kluby mimo modelované soutěže (divize a níže). */
  pool: string[];
  news: NewsItem[];
  history: SeasonRecord[];
  nextId: number;
  gameOver?: { date: string; reason: string };
}
