import { book, financeLevel } from './finance';
import { satisfy } from './ownership';
import type { Rng } from './rng';
import { sponsorMarket } from './sponsors';
import { facilityUpkeep } from './stadium';
import { financeFactor } from './staff';
import type { CampChoice, Club, GameState, Level, SalesPolicy } from './types';
import { addNews, clamp, tierOf } from './world';

/**
 * Provozní řádky rozpočtu, které majitel nastavuje v Příjmech a Výdajích:
 * catering, fanshop, akce na stadionu, údržba, soustředění, bezpečnost a komunita.
 * Každý řádek má peníze i dopad ve hře (nálada fanoušků, trávník, forma, pokuty, vztahy s městem).
 */

export const LEVEL_LABEL: Record<Level, string> = { nizka: 'nízká', bezna: 'běžná', vysoka: 'vysoká' };
export const SALES_LABEL: Record<SalesPolicy, string> = { drzet: 'Držet kádr', dobra: 'Prodat za dobrou cenu', prodejni: 'Prodejní klub' };
export const CAMP_LABEL: Record<CampChoice, string> = { zadne: 'Bez soustředění', doma: 'Doma', zahranici: 'V zahraničí' };

const own = (state: GameState) => state.clubs[state.owner.clubId];
const tierIdx = (tier: number) => Math.min(3, Math.max(1, tier));

// ---------- Catering a VIP ----------

/** Útrata na diváka a cena VIP podle cenové úrovně. */
export function cateringFactor(club: Club): number {
  return financeLevel(club.policy.cateringPrice, 0.8, 1, 1.15);
}

// ---------- Fanshop a dresy ----------

/** Fanshop za měsíc: tržby (podle pověsti, nálady a cen) minus náklady na novou kolekci. */
export function fanshopDetail(state: GameState, fanMood = own(state).fanMood): { gross: number; kitCost: number; net: number } {
  const club = own(state);
  const mood = 0.7 + 0.6 * (fanMood / 100);
  const price = financeLevel(club.policy.merchPrice, 0.82, 1, 1.1);
  const kit = club.policy.newKit ? 1.3 : 1;
  const base = (sponsorMarket(state) * 0.08) / 12;
  const gross = base * mood * price * kit;
  const kitCost = club.policy.newKit ? base * 0.25 : 0;
  return { gross: Math.round(gross), kitCost: Math.round(kitCost), net: Math.round(gross - kitCost) };
}

// ---------- Akce na stadionu ----------

/** Příjem z jedné akce (koncert, kemp, pronájem) podle kapacity a soutěže. */
export function eventIncome(club: Club, tier: number): number {
  const k = [0, 1, 0.5, 0.25][tierIdx(tier)];
  return Math.round(((150_000 + club.stadium.capacity * 30) * k) / 10_000) * 10_000;
}

/** Šance, že akce poškodí trávník (podle údržby). */
export function eventDamageChance(club: Club): number {
  return financeLevel(club.policy.maintenance, 0.55, 0.3, 0.12);
}

// ---------- Údržba stadionu a trávníku ----------

export function adminMonthly(tier: number): number {
  // Část dřívějšího provozu je teď v samostatných řádcích (bezpečnost, soustředění, komunita).
  return [0, 250_000, 50_000, 20_000][tierIdx(tier)];
}

export function maintenanceMonthly(club: Club, tier: number): number {
  const base = club.stadium.capacity * 15 + facilityUpkeep(club.facilities, tier);
  return Math.round(base * financeLevel(club.policy.maintenance, 0.85, 1, 1.15));
}

/** Údržba mění riziko zranění (trávník, šatny, regenerace). */
export function maintenanceInjury(club: Club): number {
  return financeLevel(club.policy.maintenance, 1.12, 1, 0.9);
}

/** Domácí výhoda podle stavu trávníku: poškozený ji výrazně sníží, špičková údržba přidá. */
export function pitchFactor(club: Club, damaged: boolean): number {
  if (damaged) return 0.6;
  return financeLevel(club.policy.maintenance, 0.9, 1, 1.08);
}

// ---------- Nálada fanoušků z nastavení ----------

/** Měsíční změna nálady fanoušků z cen cateringu a fanshopu a ze stavu stadionu. */
export function policyMoodDrift(club: Club): number {
  return financeLevel(club.policy.cateringPrice, 0.3, 0, -0.7) + financeLevel(club.policy.merchPrice, 0.3, 0, -0.7) + financeLevel(club.policy.maintenance, -0.5, 0, 0.2);
}

/** Měsíční pokles nálady kvůli drahým vstupenkám. */
export function ticketMoodPenalty(club: Club, tier: number, defaultPrice: number): number {
  void tier;
  return Math.max(0, club.policy.ticketPrice / defaultPrice - TICKET_ANGER) * 8;
}

/** Od jaké ceny vstupenek (násobek běžné) začnou fanoušci ztrácet náladu. */
export const TICKET_ANGER = 1.1;

/** Odhad nálady fanoušků za n měsíců při současném nastavení (návrat k normálu, ceny, údržba). */
export function projectMood(club: Club, tier: number, defaultPrice: number, target: number, months: number): number {
  let mood = club.fanMood;
  for (let i = 0; i < months; i++) mood = clamp(mood + (target - mood) * 0.05 - ticketMoodPenalty(club, tier, defaultPrice) + policyMoodDrift(club), 0, 100);
  return mood;
}

// ---------- Soustředění ----------

export function campCost(tier: number, choice: CampChoice = 'doma'): number {
  const base = [0, 1_500_000, 300_000, 50_000][tierIdx(tier)];
  return Math.round(base * { zadne: 0, doma: 0.2, zahranici: 1 }[choice]);
}

/** Bonus k síle týmu v prvních týdnech podzimu a jara podle soustředění. */
export function campBonus(state: GameState): number {
  const md = state.date.slice(5);
  const paid = state.campsPaid?.season === state.season ? state.campsPaid : undefined;
  const effect = (c: CampChoice = 'doma') => ({ zadne: -0.8, doma: 0, zahranici: 1 })[c];
  // Bonus jen za soustředění, které se opravdu zaplatilo (volbu po zaplacení už nejde změnit).
  if (md >= '07-15' && md <= '09-15') return effect(paid?.summer ?? 'doma');
  if (md >= '02-01' && md <= '03-31') return effect(paid?.winter ?? 'doma');
  return 0;
}

/** Bylo už soustředění zaplacené (a tím zamčené)? */
export function campLocked(state: GameState, which: 'summer' | 'winter'): CampChoice | undefined {
  const paid = state.campsPaid?.season === state.season ? state.campsPaid : undefined;
  return paid?.[which];
}

// ---------- Pořadatelé a bezpečnost ----------

export function securityPerMatch(tier: number, level?: Level): number {
  const base = [0, 120_000, 30_000, 5_000][tierIdx(tier)];
  return Math.round(base * financeLevel(level, 0.6, 1, 1.5));
}

export function incidentChance(level?: Level): number {
  return financeLevel(level, 0.07, 0.025, 0.008);
}

export function incidentFine(tier: number): number {
  return [0, 500_000, 100_000, 20_000][tierIdx(tier)];
}

// ---------- Komunita ----------

export function communityReference(tier: number): number {
  return [0, 1_000_000, 200_000, 40_000][tierIdx(tier)];
}

export function communitySpend(club: Club, tier: number): number {
  return club.policy.community ?? communityReference(tier);
}

/** Účinek komunitního rozpočtu: běžná výše 0, nic −1, čtyřnásobek +1 (klesající výnos). */
export function communityEffect(club: Club, tier: number): number {
  const spend = communitySpend(club, tier);
  if (spend <= 0) return -1;
  return clamp(Math.log2(spend / communityReference(tier)) / 2, -1, 1);
}

// ---------- Zpracování v čase ----------

/** Měsíčně (klub majitele): fanshop, údržba, komunita, akce na stadionu a jejich dopady. */
export function monthlyOperations(state: GameState, rng: Rng): void {
  const club = own(state);
  const tier = tierOf(state, club.id);
  const ff = financeFactor(state);
  const shop = fanshopDetail(state);
  book(state, club.id, 'fanshop', shop.net, club.policy.newKit ? 'Fanshop a dresy (nová kolekce)' : 'Fanshop a dresy');
  book(state, club.id, 'udrzba', -maintenanceMonthly(club, tier) * ff, 'Údržba stadionu a trávníku');
  const community = communitySpend(club, tier);
  if (community > 0) book(state, club.id, 'komunita', -community / 12, 'Komunita, ženský a dětský fotbal');

  // Akce na stadionu: rozložené do sezóny, každá může poškodit trávník.
  state.stadiumEventAcc = (state.stadiumEventAcc ?? 0) + (club.policy.stadiumEvents ?? 0) / 12;
  while (state.stadiumEventAcc >= 1) {
    state.stadiumEventAcc -= 1;
    const income = eventIncome(club, tier);
    book(state, club.id, 'akce', income, 'Akce na stadionu (koncert, kemp, pronájem)');
    if (rng.chance(eventDamageChance(club)) && !(club.pitchDamagedUntil && club.pitchDamagedUntil >= state.date)) {
      const days = club.policy.maintenance === 'vysoka' ? 10 : club.policy.maintenance === 'nizka' ? 28 : 18;
      const until = new Date(`${state.date}T00:00:00Z`);
      until.setUTCDate(until.getUTCDate() + days);
      club.pitchDamagedUntil = until.toISOString().slice(0, 10);
      addNews(state, { kind: 'varovani', title: 'Akce na stadionu poškodila trávník', text: `Oprava potrvá asi ${days} dní. Doma hrozí víc zranění a přijde méně diváků.` });
    }
  }

  // Nálada fanoušků: ceny cateringu a fanshopu, stav stadionu.
  club.fanMood = clamp(club.fanMood + policyMoodDrift(club), 0, 100);

  // Komunita: město, patrioti a média.
  const e = communityEffect(club, tier);
  satisfy(state, e * 0.4, ['mesto', 'patriot']);
  state.owner.media = clamp(state.owner.media + e * 0.15, 0, 100);
}

/** Denně: soustředění se platí 10. 7. a 10. 1., nová kolekce dresů potěší fanoušky na začátku sezóny. */
export function dailyOperations(state: GameState): void {
  const md = state.date.slice(5);
  const club = own(state);
  const tier = tierOf(state, club.id);
  if (md === '07-10' || md === '01-10') {
    const choice = (md === '07-10' ? club.policy.summerCamp : club.policy.winterCamp) ?? 'doma';
    const paid = state.campsPaid?.season === state.season ? state.campsPaid : { season: state.season };
    state.campsPaid = { ...paid, [md === '07-10' ? 'summer' : 'winter']: choice };
    const cost = campCost(tier, choice);
    if (cost > 0) book(state, club.id, 'soustredeni', -cost, `${md === '07-10' ? 'Letní' : 'Zimní'} soustředění (${CAMP_LABEL[choice ?? 'doma'].toLowerCase()})`);
  }
  if (md === '07-02' && club.policy.newKit) {
    club.fanMood = clamp(club.fanMood + 3, 0, 100);
    addNews(state, { kind: 'info', title: 'Nová kolekce dresů je v prodeji', text: 'Fanoušci ji vzali dobře, fanshop čeká vyšší tržby.' });
  }
}

/** Domácí zápas klubu majitele: pořadatelská služba a riziko výtržností. */
export function homeMatchOperations(state: GameState, rng: Rng, label: string): void {
  const club = own(state);
  const tier = tierOf(state, club.id);
  book(state, club.id, 'bezpecnost', -securityPerMatch(tier, club.policy.security), `Pořadatelé a bezpečnost: ${label}`);
  if (rng.chance(incidentChance(club.policy.security))) {
    const fine = incidentFine(tier);
    book(state, club.id, 'ostatni', -fine, `Pokuta za výtržnosti fanoušků: ${label}`);
    club.fanMood = clamp(club.fanMood - 2, 0, 100);
    state.owner.media = clamp(state.owner.media - 2, 0, 100);
    addNews(state, { kind: 'varovani', title: 'Výtržnosti na stadionu', text: `Svaz udělil pokutu ${Math.round(fine / 1000).toLocaleString('cs-CZ')} tis. Kč. Posílená pořadatelská služba riziko snižuje.` });
  }
}
