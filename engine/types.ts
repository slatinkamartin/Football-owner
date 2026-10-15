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
  /** 'nadstavba' = po základní části se soutěž dělí na skupiny (o titul, o umístění, o záchranu). */
  format?: 'nadstavba';
  /** Baráž: kluby na pozicích `upper` hrají s kluby na pozicích `lower` z nižší soutěže `vs`. */
  playoff?: { vs: string; upper: number[]; lower: number[] };
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
  /** Prázdný řetězec = volný hráč bez klubu. */
  clubId: string;
  /** Měsíční plat v Kč. */
  wage: number;
  /** Rok, kdy smlouva končí (30. 6.). */
  contractUntil: number;
  /** Statistiky v aktuální sezóně. */
  goals: number;
  apps: number;
  starts: number;
  minutes: number;
  assists: number;
  yellows: number;
  reds: number;
  /** Součet a počet známek (průměr = ratingSum / ratingCount). */
  ratingSum: number;
  ratingCount: number;
  /** Kondice 0–100. Po zápase klesá, každý den se obnovuje. */
  fitness: number;
  /** Zraněný do tohoto data (včetně). */
  injuredUntil?: string;
  injury?: string;
  /** Počet zápasů klubu, které hráč ještě nesmí hrát kvůli kartám. */
  suspension: number;
  /** Morálka 0–100. Klesá hráčům, kteří nehrají, roste s úspěchy a novou smlouvou. */
  morale: number;
  /** Posledních až 5 známek (forma). */
  recent: number[];
  /** Kdy si hráč naposledy stěžoval na málo minut. */
  complainedAt?: string;
  career: CareerSeason[];
  transfers: PlayerTransfer[];
  trend?: TrendPoint[];
  /** Účetní zůstatková hodnota registrace (jen hráči klubu majitele koupení za odstupné). */
  bookValue?: number;
  /** Měsíční odpis registrace. */
  amortization?: number;
}

// ---------- Vývoj a kariéra hráče ----------

export interface CareerSeason {
  season: number;
  club: string;
  competition: string;
  apps: number;
  goals: number;
  assists: number;
  minutes: number;
  avgRating?: number;
  overall: number;
  value: number;
}

export interface PlayerTransfer {
  date: string;
  from: string;
  to: string;
  fee: number;
}

/** Měsíční záznam vývoje (ukládá se pro hráče klubu majitele). */
export interface TrendPoint {
  date: string;
  overall: number;
  value: number;
}

// ---------- Lidé ----------

export type StaffRole = 'trener' | 'reditel';
export type CoachStyle = 'utocny' | 'vyvazeny' | 'defenzivni';

export interface Staff {
  id: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
  birthYear: number;
  /** Odborné schopnosti 1–100 (trenér: vedení týmu; ředitel: skauting a vyjednávání). */
  ability: number;
  /** Povaha 1–20. */
  ambition: number;
  ego: number;
  loyalty: number;
  style: CoachStyle;
  /** Trenér dává víc prostoru mladým (vlastní preference nebo na radu majitele). */
  youthFocus: boolean;
  /** Prázdný řetězec = bez angažmá. */
  clubId: string;
  /** Měsíční plat v Kč. */
  wage: number;
  contractUntil: number;
}

export type SeasonGoal = 'titul' | 'postup' | 'horni' | 'stred' | 'zachrana';

export interface ClubStaff {
  coachId: string;
  directorId: string;
}

// ---------- Přestupy ----------

export interface TransferProposal {
  id: string;
  playerId: string;
  estimatedFee: number;
  estimatedWage: number;
  note: string;
}

export interface IncomingOffer {
  id: string;
  playerId: string;
  buyerId: string;
  fee: number;
  expires: string;
  advice: 'prijmout' | 'odmitnout';
  note: string;
}

export interface Negotiation {
  playerId: string;
  /** Prázdný řetězec = volný hráč, jedná se rovnou s hráčem. */
  sellerId: string;
  stage: 'klub' | 'hrac' | 'hotovo' | 'neuspech';
  askingFee: number;
  minFee: number;
  agreedFee: number;
  minWage: number;
  roundsLeft: number;
  /** Poslední protinávrh protistrany (odstupné, nebo plat). */
  counter?: number;
  againstAdvice: boolean;
  log: string[];
}

export interface TransferRecord {
  date: string;
  playerName: string;
  fromId: string;
  toId: string;
  fee: number;
}

export interface Market {
  proposals: TransferProposal[];
  offers: IncomingOffer[];
  negotiation?: Negotiation;
  /** Hráči klubu majitele nabídnutí k prodeji. */
  listed: string[];
  /** Utraceno za odstupné v této sezóně. */
  spent: number;
  /** Polovina příjmů z prodejů se vrací do rozpočtu na přestupy. */
  earned: number;
  history: TransferRecord[];
}

export type FinanceCategory =
  | 'vstupne'
  | 'tv'
  | 'komercni'
  | 'platy'
  | 'provoz'
  | 'prestupy'
  | 'vedeni'
  | 'pohar'
  | 'dane'
  | 'vklad';

export const INCOME_CATEGORIES: FinanceCategory[] = ['vstupne', 'tv', 'komercni', 'pohar', 'vklad'];
export const EXPENSE_CATEGORIES: FinanceCategory[] = ['platy', 'vedeni', 'provoz', 'prestupy', 'dane'];

/** Účetní položky sezóny (jen klub majitele). Na rozdíl od peněz rozkládají cenu hráče do let smlouvy. */
export interface Accounting {
  /** Odpisy hráčských registrací. */
  amortization: number;
  /** Zisk (nebo ztráta) z prodeje hráčů = odstupné minus zůstatková hodnota. */
  saleProfit: number;
  /** Jednorázové odpisy při uvolnění hráče. */
  writeOffs: number;
  /** Odměny agentům (náklad, neodepisují se). */
  agentFees: number;
}

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
  /** Zůstatek na začátku měsíce (pro výhled finančního ředitele). */
  monthStartBalance?: number;
  /** Zůstatek na začátku každého měsíce (pro graf, jen klub majitele). */
  balanceHistory?: { date: string; balance: number }[];
  accounting?: Accounting;
  lastAccounting?: Accounting;
  /** Neuplatněná daňová ztráta z minulých let. */
  lossCarry?: number;
  season: FinanceTotals;
  lastSeason?: FinanceTotals;
  /** Poslední transakce (jen u klubu hráče). */
  transactions: Transaction[];
}

export interface ClubPolicy {
  ticketPrice: number;
  /** Násobek běžného mzdového rozpočtu (0,7 až 1,5). */
  wageMultiplier: number;
  /** Rozpočet na odstupné za posily na celou sezónu v Kč. */
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
  staff: ClubStaff;
  policy: ClubPolicy;
  finance: ClubFinance;
}

export interface MatchResult {
  homeGoals: number;
  awayGoals: number;
  attendance: number;
  /** Penaltový rozstřel (pohár, baráž). */
  penalties?: [number, number];
  scorers: { playerId: string; clubId: string; minute: number; assistId?: string; penalty?: boolean }[];
  /** Podrobnosti (sestavy, statistiky, události). Ukládají se jen pro soutěž klubu majitele. */
  detail?: MatchDetail;
}

export type MatchEventType = 'gol' | 'zluta' | 'cervena' | 'druha-zluta' | 'stridani' | 'zraneni';

export interface MatchEvent {
  minute: number;
  type: MatchEventType;
  clubId: string;
  /** Hráč, kterého se událost týká (střelec, potrestaný, střídaný). */
  playerId: string;
  /** Asistence u gólu, nebo hráč, který přišel na hřiště. */
  otherId?: string;
  note?: string;
}

export interface MatchPlayerLine {
  id: string;
  name: string;
  position: Position;
  minutes: number;
  rating?: number;
  started: boolean;
}

export interface TeamMatchStats {
  formation: string;
  lineup: MatchPlayerLine[];
  bench: MatchPlayerLine[];
  xg: number;
  shots: number;
  onTarget: number;
  possession: number;
  corners: number;
  fouls: number;
  offsides: number;
  yellows: number;
  reds: number;
  saves: number;
}

export interface MatchDetail {
  home: TeamMatchStats;
  away: TeamMatchStats;
  events: MatchEvent[];
  /** Hráč zápasu. */
  potm?: string;
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
  /** Skupiny nadstavby (vznikají po základní části). */
  groups?: { name: string; clubIds: string[] }[];
  /** Termíny vyhrazené pro nadstavbu. */
  reservedDates?: string[];
}

/** Pohár nebo baráž: vyřazovací zápasy mimo ligové tabulky. */
export interface Cup {
  id: string;
  name: string;
  kind: 'pohar' | 'baraz';
  fixtures: Fixture[];
  /** Názvy a termíny kol (u baráže i odveta). */
  rounds: { name: string; date: string; secondLeg?: string }[];
  /** Kluby, které jsou ještě ve hře. */
  alive: string[];
  /** Index kola, které se má rozlosovat. */
  nextRound: number;
  winner?: string;
  /** Baráž: dvojice (horní klub, dolní klub) a vítěz. */
  ties?: { upper: string; lower: string; winner?: string }[];
}

export interface Owner {
  name: string;
  clubId: string;
  /** Podíl v klubu (0 až 1). */
  share: number;
  /** Osobní peníze majitele v Kč. */
  wallet: number;
  difficulty: Difficulty;
  seasonGoal: SeasonGoal;
  /** Důvěra trenéra a ředitele v majitele, 0–100. */
  trust: { trener: number; reditel: number };
  lastAdvice?: string;
}

export interface NewsItem {
  date: string;
  kind: 'info' | 'vysledek' | 'varovani' | 'sezona';
  title: string;
  text?: string;
  /** Zápas, ke kterému se zpráva vztahuje (otevře náhled). */
  fixtureId?: string;
  playerId?: string;
}

export interface SeasonRecord {
  season: number;
  champions: Record<string, string>;
  ownerClub: { competitionId: string; position: number; points: number };
  cupWinner?: string;
}

/** Průběh sezóny klubu majitele (pro graf pozice v tabulce). */
export interface TimelinePoint {
  round: number;
  date: string;
  position: number;
  points: number;
}

export const SAVE_VERSION = 5;

export interface GameState {
  version: typeof SAVE_VERSION;
  packId: string;
  seed: number;
  rngState: number;
  date: string;
  /** Rok začátku aktuální sezóny (2026 = sezóna 2026/27). */
  season: number;
  owner: Owner;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  staff: Record<string, Staff>;
  market: Market;
  competitions: Record<string, Competition>;
  cups: Record<string, Cup>;
  timeline: TimelinePoint[];
  /** Kluby mimo modelované soutěže (divize a níže). */
  pool: string[];
  news: NewsItem[];
  history: SeasonRecord[];
  nextId: number;
  gameOver?: { date: string; reason: string };
}
