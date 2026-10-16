import { addDays } from './calendar';
import { book, departmentEffect, sponsorsAnnual } from './finance';
import { ownerCommercialFactor } from './grey';
import type { Rng } from './rng';
import { commercialFactor, expectedPosition, type ActionResult } from './staff';
import type { Club, GameState, SponsorContract, SponsorOffer, SponsorSlot } from './types';
import { addNews, competitionOf, tierOf } from './world';

/**
 * Sponzorská místa klubu majitele. Každé místo má svůj podíl na sponzorském trhu klubu.
 * Na volná a končící místa přicházejí nabídky na 1–3 roky: pevná částka, nebo nižší částka s bonusem.
 * Pevná smlouva chrání před propadem, ale po úspěšné sezóně se dá vyjednat víc.
 */

export const SLOTS: SponsorSlot[] = ['generalni', 'dres', 'stadion', 'dodavatel', 'pivovar', 'trenink', 'mladez'];
export const SLOT_LABEL: Record<SponsorSlot, string> = {
  generalni: 'Generální partner',
  dres: 'Rukáv a záda dresu',
  stadion: 'Název stadionu',
  dodavatel: 'Dodavatel dresů',
  pivovar: 'Pivovar a catering',
  trenink: 'Tréninkové centrum',
  mladez: 'Partner mládeže',
};
/** Podíl místa na sponzorském trhu klubu. Zbytek (20 %) tvoří drobní sponzoři a reklama. */
export const SLOT_SHARE: Record<SponsorSlot, number> = { generalni: 0.3, dres: 0.1, stadion: 0.12, dodavatel: 0.1, pivovar: 0.07, trenink: 0.06, mladez: 0.05 };
/** Drobní sponzoři a reklama (fanshop je od verze 10 samostatný řádek). */
export const SMALL_SPONSORS_SHARE = 0.12;

const NAMES: Record<SponsorSlot, string[]> = {
  generalni: ['Fortuna', 'Tipsport', 'Moneta', 'ČEZ', 'Raiffeisenbank', 'Kaufland', 'Penny', 'Agrofert', 'Synot'],
  dres: ['Alza', 'Mall', 'Rohlik', 'O2', 'T-Mobile', 'Vodafone', 'Datart', 'Notino'],
  stadion: ['Epet', 'Malina', 'Doosan', 'Mapei', 'Fortuna', 'Chance', 'Generali'],
  dodavatel: ['Nike', 'Adidas', 'Puma', 'Macron', 'Joma', 'Kappa', 'Umbro'],
  pivovar: ['Pilsner Urquell', 'Gambrinus', 'Kozel', 'Radegast', 'Staropramen', 'Budvar', 'Bernard'],
  trenink: ['Skanska', 'Metrostav', 'Strabag', 'Eurovia', 'Hochtief'],
  mladez: ['Česká spořitelna', 'Kofola', 'Lidl', 'Albert', 'Tesco'],
};

function ownClub(state: GameState): Club {
  return state.clubs[state.owner.clubId];
}

/** Tržní hodnota sponzorství klubu (bez generálního partnera ze starých verzí). */
export function sponsorMarket(state: GameState): number {
  const club = ownClub(state);
  const tier = tierOf(state, club.id);
  const marketing = 1 + 0.08 * departmentEffect(club, tier, 'marketing');
  return sponsorsAnnual({ ...club, sponsorDeal: undefined }, tier) * marketing * ownerCommercialFactor(state) * commercialFactor(state);
}

export function contracts(state: GameState): SponsorContract[] {
  return ownClub(state).sponsors ?? [];
}

/** Měsíční příjem ze sponzorů klubu majitele: smlouvy plus drobní sponzoři. */
export function sponsorMonthly(state: GameState): { contracts: number; small: number } {
  return {
    contracts: contracts(state).reduce((a, c) => a + c.annual, 0) / 12,
    small: (sponsorMarket(state) * SMALL_SPONSORS_SHARE) / 12,
  };
}

/** Odhad ročních sponzorských příjmů pro rozpočet: smlouvy, drobní sponzoři a volná místa (kromě názvu stadionu). */
export function sponsorForecast(state: GameState): number {
  const m = sponsorMonthly(state);
  const taken = new Set(contracts(state).map((c) => c.slot));
  const open = SLOTS.filter((s) => !taken.has(s) && s !== 'stadion').reduce((a, s) => a + SLOT_SHARE[s], 0);
  return (m.contracts + m.small) * 12 + sponsorMarket(state) * open * 0.9;
}

function pickName(rng: Rng, slot: SponsorSlot, used: Set<string>): string {
  const free = NAMES[slot].filter((n) => !used.has(n));
  return rng.pick(free.length ? free : NAMES[slot]);
}

/** Nové nabídky na volná a končící místa (začátek sezóny, pak průběžně). */
export function generateSponsorOffers(state: GameState, rng: Rng): void {
  if (state.owner.ousted) return;
  const club = ownClub(state);
  const market = sponsorMarket(state);
  const comp = competitionOf(state, club.id);
  const director = club.staff.commercialId ? state.staff[club.staff.commercialId]?.ability ?? 50 : 40;
  const quality = (director - 50) / 400;
  autoSignExpired(state);
  const used = new Set([...contracts(state).map((c) => c.name)]);
  // Od března přicházejí nabídky i na místa, kterým smlouva končí v létě (prodloužení nebo nový partner).
  const month = Number(state.date.slice(5, 7));
  const renewing = month >= 3 && month <= 6;
  const active = new Set(contracts(state).filter((c) => c.untilSeason > state.season || (c.untilSeason === state.season && !renewing)).map((c) => c.slot));
  const offered = new Set((state.sponsorOffers ?? []).map((o) => o.slot));
  const offers = [...(state.sponsorOffers ?? []).filter((o) => o.expires > state.date)];
  for (const slot of SLOTS) {
    if (active.has(slot) || offered.has(slot)) continue;
    const count = 2 + (director >= 60 ? 1 : 0);
    const value = market * SLOT_SHARE[slot];
    const expected = comp ? expectedPosition(state, club.id) : 8;
    for (let i = 0; i < count; i++) {
      const style = (['jistota', 'bonus', 'kratka'] as const)[i % 3];
      // Vztah se sponzorem (aktivace, splněné cíle) mění nabídky o ±10 %.
      const relation = 0.9 + (state.sponsorRelations?.[slot] ?? 50) / 500;
      const base = value * (0.88 + rng.next() * 0.22 + quality) * relation;
      const current = renewing && i === 0 ? contracts(state).find((c) => c.slot === slot && c.untilSeason === state.season) : undefined;
      const name = current?.name ?? pickName(rng, slot, used);
      used.add(name);
      const offer: SponsorOffer = {
        id: `sp${++state.nextId}`,
        slot,
        name,
        annual: 0,
        untilSeason: 0,
        years: style === 'jistota' ? 3 : style === 'bonus' ? 2 : 1,
        expires: addDays(state.date, 30),
        style,
      };
      if (style === 'jistota') offer.annual = round(base * 0.95);
      if (style === 'kratka') offer.annual = round(base * 1.05);
      if (style === 'bonus') {
        offer.annual = round(base * 0.8);
        const target = Math.max(1, expected - 2);
        const kind = rng.chance(0.6) || !comp || comp.tier > 1 ? 'umisteni' : rng.chance(0.5) ? 'pohar' : 'evropa';
        offer.bonus = { kind, amount: round(base * (kind === 'umisteni' ? 0.45 : 0.6)), target: kind === 'umisteni' ? target : undefined };
      }
      // Nabídka na končící místo platí od příští sezóny.
      offer.untilSeason = state.season + offer.years - (renewing && contracts(state).some((c) => c.slot === slot) ? 0 : 1);
      offers.push(offer);
    }
  }
  state.sponsorOffers = offers;
}

/** Nabídky, na které majitel nereagoval: obchodní oddělení podepíše nejvyšší (kromě názvu stadionu). */
function autoSignExpired(state: GameState): void {
  const club = ownClub(state);
  const expired = (state.sponsorOffers ?? []).filter((o) => o.expires <= state.date && o.slot !== 'stadion');
  const signed: string[] = [];
  for (const slot of new Set(expired.map((o) => o.slot))) {
    if (contracts(state).some((c) => c.slot === slot && c.untilSeason >= state.season)) continue;
    const best = expired.filter((o) => o.slot === slot).sort((a, b) => b.annual - a.annual)[0];
    club.sponsors = [...(club.sponsors ?? []).filter((c) => c.slot !== slot), { slot, name: best.name, annual: best.annual, untilSeason: best.untilSeason, bonus: best.bonus }];
    signed.push(`${SLOT_LABEL[slot]}: ${best.name}`);
  }
  state.sponsorOffers = (state.sponsorOffers ?? []).filter((o) => o.expires > state.date);
  if (signed.length) addNews(state, { kind: 'info', title: 'Obchodní oddělení podepsalo sponzory', text: `${signed.join(', ')}. Na nabídky jste nereagoval, podepsala se nejvyšší.` });
}

function round(v: number): number {
  return Math.round(v / 50_000) * 50_000;
}

export function bonusText(c: SponsorContract): string {
  if (!c.bonus) return '';
  if (c.bonus.kind === 'umisteni') return `bonus ${fmt(c.bonus.amount)} za umístění do ${c.bonus.target}. místa`;
  if (c.bonus.kind === 'pohar') return `bonus ${fmt(c.bonus.amount)} za vítězství v poháru`;
  return `bonus ${fmt(c.bonus.amount)} za ligovou fázi evropských pohárů`;
}

function fmt(v: number): string {
  return `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;
}

export function signSponsor(prev: GameState, offerId: string): ActionResult {
  const offer = prev.sponsorOffers?.find((o) => o.id === offerId);
  if (!offer) return { state: prev, ok: false, message: 'Nabídka už neplatí.' };
  if (prev.owner.ousted) return { state: prev, ok: false, message: 'Smlouvy teď podepisuje představenstvo.' };
  const state = structuredClone(prev);
  const club = ownClub(state);
  const contract: SponsorContract = { slot: offer.slot, name: offer.name, annual: offer.annual, untilSeason: offer.untilSeason, bonus: offer.bonus };
  club.sponsors = [...(club.sponsors ?? []).filter((c) => c.slot !== offer.slot), contract];
  state.sponsorOffers = (state.sponsorOffers ?? []).filter((o) => o.slot !== offer.slot);
  if (offer.slot === 'stadion') {
    club.stadium.originalName ??= club.stadium.name;
    club.stadium.name = `${offer.name} Arena`;
    club.fanMood = Math.max(0, club.fanMood - 6);
  }
  const message = `${SLOT_LABEL[offer.slot]}: ${offer.name} na ${offer.years === 1 ? 'rok' : `${offer.years} roky`} za ${fmt(offer.annual)} ročně${offer.bonus ? `, ${bonusText(offer)}` : ''}.`;
  addNews(state, { kind: 'info', title: 'Nová sponzorská smlouva', text: message });
  return { state, ok: true, message };
}

/** Začátek sezóny: skončené smlouvy odejdou, název stadionu se vrátí, přijdou nové nabídky. */
export function seasonStartSponsors(state: GameState, rng: Rng): void {
  const club = ownClub(state);
  const ended = (club.sponsors ?? []).filter((c) => c.untilSeason < state.season);
  club.sponsors = (club.sponsors ?? []).filter((c) => c.untilSeason >= state.season);
  if (ended.some((c) => c.slot === 'stadion') && club.stadium.originalName) {
    club.stadium.name = club.stadium.originalName;
  }
  state.sponsorOffers = [];
  generateSponsorOffers(state, rng);
  if (ended.length) {
    addNews(state, {
      kind: 'info',
      title: `Skončily sponzorské smlouvy: ${ended.map((c) => SLOT_LABEL[c.slot]).join(', ')}`,
      text: 'Nové nabídky najdete ve Financích v části Příjmy.',
    });
  }
}

/** Konec sezóny: bonusy za umístění a pohár. */
export function sponsorSeasonBonuses(state: GameState, position: number, cupWinner?: string): void {
  for (const c of contracts(state)) {
    if (!c.bonus) continue;
    const won =
      (c.bonus.kind === 'umisteni' && c.bonus.target !== undefined && position <= c.bonus.target) ||
      (c.bonus.kind === 'pohar' && cupWinner === state.owner.clubId);
    if (won) book(state, state.owner.clubId, 'komercni', c.bonus.amount, `Bonus sponzora ${c.name}`);
  }
}

/** Ligová fáze Evropy: bonusy sponzorů. */
export function sponsorEuropeBonus(state: GameState): void {
  for (const c of contracts(state)) {
    if (c.bonus?.kind === 'evropa') book(state, state.owner.clubId, 'komercni', c.bonus.amount, `Bonus sponzora ${c.name} za Evropu`);
  }
}

/** Nová hra: klub už má část smluv (generální partner, dodavatel dresů, pivovar), ostatní místa jsou volná. */
export function initialSponsors(state: GameState, rng: Rng): void {
  const club = ownClub(state);
  const market = sponsorMarket(state);
  const used = new Set<string>();
  club.sponsors = (['generalni', 'dodavatel', 'pivovar'] as SponsorSlot[]).map((slot) => {
    const name = pickName(rng, slot, used);
    used.add(name);
    return { slot, name, annual: round(market * SLOT_SHARE[slot] * (0.9 + rng.next() * 0.15)), untilSeason: state.season + rng.int(0, 1) };
  });
  generateSponsorOffers(state, rng);
}

/** Smlouvy, které končí s touto sezónou (k obnovení). */
export function expiringSponsors(state: GameState): SponsorContract[] {
  return contracts(state).filter((c) => c.untilSeason === state.season);
}
