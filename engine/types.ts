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
  /** Kapacita na začátku hry (měřítko běžných příjmů). */
  originalCapacity?: number;
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

export type StaffRole = 'trener' | 'reditel' | 'financni' | 'obchodni' | 'akademie' | 'media';
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
  /** Další ředitelé (jen klub majitele, nepovinní). */
  financeId?: string;
  commercialId?: string;
  academyId?: string;
  mediaId?: string;
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
  | 'stadion'
  | 'ostatni'
  | 'investice'
  | 'uver'
  | 'dane'
  | 'vklad'
  | 'oddeleni'
  | 'evropa';

export const INCOME_CATEGORIES: FinanceCategory[] = ['vstupne', 'stadion', 'tv', 'komercni', 'evropa', 'pohar', 'ostatni', 'uver', 'vklad'];
export const EXPENSE_CATEGORIES: FinanceCategory[] = ['platy', 'vedeni', 'oddeleni', 'provoz', 'prestupy', 'investice', 'dane'];

/** Roční rozpočty oddělení klubu v Kč. */
export interface Departments {
  skauting: number;
  mladez: number;
  medicina: number;
  marketing: number;
}

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
  /** Odpisy staveb a vybavení. */
  buildingDepreciation: number;
  /** Úroky z úvěrů. */
  interest: number;
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
  /** Stavby a vybavení (jen klub majitele). */
  assets?: FixedAsset[];
  season: FinanceTotals;
  lastSeason?: FinanceTotals;
  /** Poslední transakce (jen u klubu hráče). */
  transactions: Transaction[];
}

export interface ClubPolicy {
  ticketPrice: number;
  /** Cena permanentky na sezónu (jen klub majitele). */
  seasonTicketPrice?: number;
  /** Roční rozpočty oddělení (ostatní kluby mají běžnou výši). */
  departments?: Departments;
  /** Sportovní ředitel sám prodlužuje smlouvy a doplňuje kádr (výchozí ano). */
  autoSquad?: boolean;
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
  facilities: Facilities;
  /** Nálada fanoušků 0–100: ovlivňuje návštěvnost a příjmy od sponzorů. */
  fanMood: number;
  /** Smlouva s generálním partnerem na aktuální sezónu (jen klub majitele). */
  sponsorDeal?: SponsorDeal;
  /** Poškozený trávník do tohoto data (nižší návštěva, víc zranění). */
  pitchDamagedUntil?: string;
  /** Kolik ostatní kluby utratily za přestupy v aktuální sezóně. */
  transferSpent?: number;
}

// ---------- Stadion a zázemí ----------

export interface Facilities {
  /** Počet VIP skyboxů. */
  vip: number;
  /** Úroveň cateringu a fanshopu 0–3 (útrata diváka na zápase). */
  catering: number;
  /** Vyhřívaný trávník (podmínka licence pro 1. ligu). */
  heating: boolean;
  /** Tréninkové centrum 1–5: rychlejší vývoj hráčů. */
  training: number;
  /** Akademie 1–5: počet a kvalita dorostenců. */
  academy: number;
  /** Regenerace a zdravotní péče 1–5: méně a kratší zranění. */
  medical: number;
}

export type ProjectKind = 'kapacita' | 'vip' | 'catering' | 'vyhrivani' | 'trenink' | 'akademie' | 'medicina';

export interface Project {
  id: string;
  kind: ProjectKind;
  label: string;
  cost: number;
  start: string;
  end: string;
  /** Kolik míst / skyboxů přibude, nebo cílová úroveň. */
  value: number;
}

/** Dlouhodobý majetek v rozvaze (stavby a vybavení), odepisovaný měsíčně. */
export interface FixedAsset {
  label: string;
  value: number;
  monthly: number;
}

export interface SponsorDeal {
  name: string;
  /** Násobek běžných komerčních příjmů. */
  factor: number;
  /** Bonus za každou ligovou výhru. */
  winBonus: number;
  season: number;
}

export interface Loan {
  id: string;
  principal: number;
  remaining: number;
  /** Roční úroková sazba. */
  rate: number;
  payment: number;
  monthsLeft: number;
}

// ---------- Situace k rozhodnutí ----------

export interface EventOption {
  id: string;
  label: string;
  /** Srozumitelný popis důsledků. */
  hint: string;
}

export interface GameEvent {
  id: string;
  template: string;
  date: string;
  /** Do kdy je třeba rozhodnout (jinak se použije výchozí volba). */
  expires: string;
  title: string;
  text: string;
  options: EventOption[];
  defaultOption: string;
  playerId?: string;
  amount?: number;
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
  /** Domácí výhoda v zápase (body síly). */
  homeEdge?: number;
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
  /** Odečtené body (disciplinární tresty). */
  penalties?: Record<string, number>;
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
  /** Podíl v klubu (0 až 1). Zbytek patří spolumajitelům. */
  share: number;
  /** Osobní peníze majitele v Kč. */
  wallet: number;
  difficulty: Difficulty;
  seasonGoal: SeasonGoal;
  /** Důvěra trenéra a ředitele v majitele, 0–100. */
  trust: { trener: number; reditel: number };
  lastAdvice?: string;
  /** Pověst majitele u médií a u fotbalového svazu, 0–100. */
  media: number;
  league: number;
  /** Odvolán valnou hromadou z vedení klubu: je jen pasivním akcionářem. */
  ousted?: { since: string; lastAttempt?: string; /** Zákaz činnosti od svazu do tohoto data. */ banUntil?: string };
  /** Hodnota klubu na začátku sezóny (pro spokojenost akcionářů). */
  valuationStart?: number;
  /** Poslední mediální kampaň. */
  lastCampaign?: string;
}

// ---------- Spolumajitelé ----------

export type ShareholderKind = 'investor' | 'patriot' | 'spekulant' | 'mesto';

export interface Shareholder {
  id: string;
  name: string;
  kind: ShareholderKind;
  /** Podíl v klubu (0 až 1). */
  share: number;
  /** Spokojenost s vedením klubu 0–100. */
  satisfaction: number;
}

export interface AgmRecord {
  date: string;
  dividend: number;
  confidence: number;
  ousted: boolean;
}

// ---------- Šedá zóna ----------

export interface GreyAction {
  date: string;
  label: string;
  /** Závažnost (podle ní se trestá při odhalení). */
  severity: number;
  /** Co klub získal a při odhalení musí vrátit (s penále). */
  gain?: number;
  /** Odečet bodů při odhalení. */
  points?: number;
  /** Poškození spolumajitelů (obchod se spřízněnou firmou). */
  minority?: boolean;
  discovered?: boolean;
}

export interface GreyZone {
  /** Skryté riziko odhalení 0–100. Roste s každou akcí, pomalu klesá. */
  exposure: number;
  actions: GreyAction[];
  /** Část platů jako obrazová práva přes firmy hráčů do tohoto data. */
  taxSchemeUntil?: string;
  /** Hráči soupeřů oslovení před oknem (klub je prodá levněji). */
  tapped?: string[];
  /** Sponzoři po skandálu platí méně do tohoto data. */
  scandalUntil?: string;
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

export interface BudgetLine {
  key: string;
  label: string;
  amount: number;
  categories: FinanceCategory[];
}

export interface BudgetPlan {
  lines: BudgetLine[];
  result: number;
  cashMin: number;
  cashEnd: number;
  months: { date: string; balance: number }[];
}

export interface SeasonBudget {
  season: number;
  /** Datum schválení (nebo poslední revize). */
  approved?: string;
  revised?: boolean;
  plan?: BudgetPlan;
  /** Prodané permanentky. */
  seasonTickets?: number;
}

export type EuropeCompetition = 'LM' | 'EL' | 'KL';

export interface EuropeEntry {
  season: number;
  clubId: string;
  /** Kam klub nastoupil (předkola). */
  entry: EuropeCompetition;
  /** Kde skončil: ligová fáze některé soutěže, nebo vyřazení v předkolech. */
  result: EuropeCompetition | 'predkola';
  revenue: number;
}

export interface EuropeSeason {
  season: number;
  entries: EuropeEntry[];
  /** Vyhodnoceno a vyplaceno (konec srpna). */
  resolved?: boolean;
}

export const SAVE_VERSION = 8;

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
  projects: Project[];
  events: GameEvent[];
  shareholders: Shareholder[];
  agm: AgmRecord[];
  grey: GreyZone;
  /** Kdy naposledy nastala která situace. */
  eventLog?: Record<string, string>;
  loans: Loan[];
  /** Rozpočet sezóny klubu majitele. */
  budget?: SeasonBudget;
  /** Evropské poháry českých klubů v aktuální sezóně a historie. */
  europe?: EuropeSeason;
  europeHistory?: EuropeEntry[];
  /** Kluby mimo modelované soutěže (divize a níže). */
  pool: string[];
  news: NewsItem[];
  history: SeasonRecord[];
  nextId: number;
  gameOver?: { date: string; reason: string; kind?: 'krach' | 'prodej' | 'trest' };
}
