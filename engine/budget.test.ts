import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { coachMotivation, dressingRoom, homeAdvantage } from './atmosphere';
import { adjustForNewTier, approveBudget, budgetApproved, budgetChanged, operatingActual, budgetVote, budgetWarnings, forecastSeason, moneyCalendar, planToDate, resetBudgetToDraft, seasonTicketDemand, ticketPreview } from './budget';
import { expiringSponsors, generateSponsorOffers } from './sponsors';
import { leaguePhaseChance, qualifyEurope, resolveEurope } from './europe';
import { annualCosts, departmentEffect, departmentReference, sponsorsAnnual, updatePolicy } from './index';
import { advanceDays, migrateSave, newGame } from './game';
import { squadOf } from './players';
import { createRng } from './rng';
import { finalStandings } from './competitions';
import type { DataPack, GameState } from './types';

const czPack = pack as DataPack;
const start = newGame(czPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'stredni', seed: 5 });

describe('ekonomika', () => {
  it('platy jsou největší náklad a střed ligy hospodaří zhruba vyrovnaně', () => {
    const plan = forecastSeason(start);
    const wages = -plan.lines.find((l) => l.key === 'platy')!.amount;
    const costs = -plan.lines.filter((l) => l.amount < 0 && l.key !== 'prestupy').reduce((a, l) => a + l.amount, 0);
    expect(wages / costs).toBeGreaterThan(0.5);
    expect(Math.abs(plan.result + start.clubs.bohemians.policy.transferBudget) / costs).toBeLessThan(0.25);
  });

  it('sponzoři platí víc slavnějším klubům a spokojeným fanouškům', () => {
    const club = structuredClone(start.clubs.bohemians);
    const base = sponsorsAnnual(club, 1);
    club.reputation += 5;
    expect(sponsorsAnnual(club, 1)).toBeGreaterThan(base * 1.3);
    club.fanMood = 90;
    expect(sponsorsAnnual(club, 1)).toBeGreaterThan(base * 1.4);
  });

  it('oddělení mají klesající výnos', () => {
    const club = structuredClone(start.clubs.bohemians);
    const ref = departmentReference(club, 1);
    club.policy.departments = { ...ref, mladez: ref.mladez * 2, medicina: ref.medicina * 4, skauting: 0 };
    expect(departmentEffect(club, 1, 'marketing')).toBeCloseTo(0, 5);
    expect(departmentEffect(club, 1, 'mladez')).toBeCloseTo(0.5, 2);
    expect(departmentEffect(club, 1, 'medicina')).toBeCloseTo(1, 2);
    expect(departmentEffect(club, 1, 'skauting')).toBe(-1);
  });
});

describe('rozpočet sezóny', () => {
  it('schválení prodá permanentky a uloží plán', () => {
    expect(budgetApproved(start)).toBe(false);
    const demand = seasonTicketDemand(start);
    expect(demand).toBeGreaterThan(500);
    const r = approveBudget(start);
    expect(r.ok).toBe(true);
    expect(r.state.budget!.seasonTickets).toBe(demand);
    expect(r.state.clubs.bohemians.finance.balance).toBeGreaterThan(start.clubs.bohemians.finance.balance);
    expect(budgetApproved(r.state)).toBe(true);
    // Dražší permanentka = méně prodaných.
    const pricey = updatePolicy(start, { seasonTicketPrice: 6000 });
    expect(seasonTicketDemand(pricey)).toBeLessThan(demand);
  });

  it('bez schválení platí rozpočet po termínu automaticky', () => {
    const later = advanceDays(start, 16).state;
    expect(budgetApproved(later)).toBe(true);
  });

  it('varování: licence a cíl nad možnosti rozpočtu', () => {
    const s = structuredClone(start);
    s.clubs.bohemians.finance.balance = -50_000_000;
    s.owner.seasonGoal = 'titul';
    s.clubs.bohemians.policy.wageMultiplier = 0.5;
    const w = budgetWarnings(s).map((x) => x.text).join(' ');
    expect(w).toContain('Licence');
    expect(w).toContain('Mzdovým stropem');
  });

  it('akcionáři hlasují o rozpočtu podle svých zájmů', () => {
    const s = newGame(czPack, { clubId: 'bohemians', ownerName: 'T', difficulty: 'stredni', seed: 5, ownerShare: 0.35 });
    for (const x of s.shareholders) x.satisfaction = 45;
    const cheap = updatePolicy(s, { departments: { ...departmentReference(s.clubs.bohemians, 1), mladez: 0, marketing: 0 } });
    const generous = updatePolicy(s, { departments: { ...departmentReference(s.clubs.bohemians, 1), mladez: departmentReference(s.clubs.bohemians, 1).mladez * 4, marketing: departmentReference(s.clubs.bohemians, 1).marketing * 2 } });
    expect(budgetVote(generous).yes).toBeGreaterThan(budgetVote(cheap).yes);
  });

  it('živý plán: vyšší mzdový strop je hned v plánu a jde vrátit na návrh vedení', () => {
    const before = forecastSeason(start);
    const raised = updatePolicy(start, { wageMultiplier: start.clubs.bohemians.policy.wageMultiplier + 0.3 });
    const after = forecastSeason(raised);
    expect(after.lines.find((l) => l.key === 'rezerva')!.amount).toBeLessThan(before.lines.find((l) => l.key === 'rezerva')!.amount);
    expect(after.result).toBeLessThan(before.result);
    const reset = resetBudgetToDraft(raised);
    expect(reset.ok).toBe(true);
    expect(reset.state.clubs.bohemians.policy.wageMultiplier).toBe(start.clubs.bohemians.policy.wageMultiplier);
  });

  it('plán k dnešku roste s časem a vyšší vstupné sníží návštěvu', () => {
    const line = forecastSeason(start).lines.find((l) => l.key === 'platy')!;
    const later = structuredClone(start);
    later.date = `${start.season}-12-31`;
    expect(Math.abs(planToDate(later, line))).toBeGreaterThan(Math.abs(line.amount) * 0.45);
    expect(Math.abs(planToDate(later, line))).toBeLessThan(Math.abs(line.amount) * 0.55);
    expect(ticketPreview(start, 600).attendance).toBeLessThan(ticketPreview(start, 150).attendance);
  });

  it('kalendář peněz a měsíční uzávěrka', () => {
    const cal = moneyCalendar(start);
    expect(cal.monthly.find((m) => m.label === 'Platy hráčů')!.amount).toBeLessThan(0);
    expect(cal.items.some((i) => i.label.includes('Licenční'))).toBe(true);
    const r = advanceDays(start, 70).state;
    expect(r.news.some((n) => n.title.includes('Měsíční uzávěrka'))).toBe(true);
  });

  it('od března přijde nabídka na prodloužení končící sponzorské smlouvy', () => {
    const s = structuredClone(start);
    s.date = `${s.season + 1}-03-01`;
    const c = s.clubs.bohemians.sponsors![0];
    c.untilSeason = s.season;
    s.sponsorOffers = [];
    expect(expiringSponsors(s).length).toBeGreaterThan(0);
    generateSponsorOffers(s, createRng(1));
    const renewal = s.sponsorOffers!.find((o) => o.slot === c.slot && o.name === c.name);
    expect(renewal).toBeDefined();
    expect(renewal!.untilSeason).toBeGreaterThan(s.season);
  });

  it('výhled v půlce sezóny = skutečnost + zbytek a sedí se zůstatkem na konci', () => {
    let s = approveBudget(start).state;
    s = advanceDays(s, 240).state;
    const plan = forecastSeason(s);
    expect(plan.from).toBe(s.date);
    expect(plan.months[0].date > s.date).toBe(true);
    const platy = plan.lines.find((l) => l.key === 'platy')!;
    expect(platy.actual).toBe(s.clubs.bohemians.finance.season.platy);
    expect(Math.abs(operatingActual(s) - plan.lines.filter((l) => l.group === 'provoz').reduce((a, l) => a + (l.actual ?? 0), 0))).toBeLessThan(1000);
    const end = advanceDays(s, Math.round((new Date(`${s.season + 1}-06-19`).getTime() - new Date(s.date).getTime()) / 86_400_000)).state;
    const actualEnd = end.clubs.bohemians.finance.balance;
    expect(Math.abs(actualEnd - plan.months[plan.months.length - 2].balance)).toBeLessThan(Math.abs(actualEnd) * 0.35 + 5_000_000);
  });

  it('neschválené změny jen při změně nastavení, ne při posunu výhledu', () => {
    let s = approveBudget(start).state;
    expect(budgetChanged(s)).toBe(false);
    s = advanceDays(s, 60).state;
    expect(budgetChanged(s)).toBe(false);
    expect(budgetChanged(updatePolicy(s, { ticketPrice: 400 }))).toBe(true);
  });

  it('ztrátový klub: návrh ukáže potřebu od majitele a půjčka ji pokryje', () => {
    const s = structuredClone(start);
    s.clubs.bohemians.finance.balance = 2_000_000;
    const plan = forecastSeason(s);
    expect(plan.ownerNeed).toBeGreaterThan(0);
    expect(budgetWarnings(s, plan).some((w) => w.text.includes('Potřeba od majitele'))).toBe(true);
    s.clubs.bohemians.finance.balance += plan.ownerNeed!;
    expect(forecastSeason(s).ownerNeed).toBe(0);
  });

  it('přestupy na splátky se v plánu nepočítají dvakrát', () => {
    const s = structuredClone(start);
    const budget = s.clubs.bohemians.policy.transferBudget;
    const before = forecastSeason(s).lines.find((l) => l.key === 'prestupy')!.amount;
    // Koupě za celý rozpočet: polovina hned, zbytek ve splátkách.
    s.market.spent += budget;
    s.clubs.bohemians.finance.season.prestupy -= budget / 2;
    s.clubs.bohemians.finance.balance -= budget / 2;
    s.payments = [
      { id: 'a', due: `${s.season}-12-30`, from: 'bohemians', to: 'slavia', amount: budget / 4, note: 'x' },
      { id: 'b', due: `${s.season + 1}-07-01`, from: 'bohemians', to: 'slavia', amount: budget / 4, note: 'x' },
    ];
    const after = forecastSeason(s).lines.find((l) => l.key === 'prestupy')!.amount;
    expect(Math.round(after)).toBe(Math.round(before + budget / 4));
  });

  it('po sestupu se ceny přepočítají na nižší soutěž', () => {
    const s = structuredClone(start);
    s.clubs.bohemians.policy.departments = departmentReference(s.clubs.bohemians, 1);
    const wage = squadOf(s, 'bohemians')[0].wage;
    adjustForNewTier(s, 1, 2);
    expect(s.clubs.bohemians.policy.ticketPrice).toBe(120);
    expect(squadOf(s, 'bohemians')[0].wage).toBeLessThan(wage * 0.75);
    expect(s.clubs.bohemians.policy.departments!.mladez).toBeLessThan(departmentReference(s.clubs.bohemians, 1).mladez);
  });
});

describe('Evropa a lidé', () => {
  it('silnější tým má větší šanci na ligovou fázi a dostane peníze', () => {
    expect(leaguePhaseChance(75, 'LM')).toBeGreaterThan(leaguePhaseChance(65, 'LM'));
    const s: GameState = structuredClone(start);
    const comp = Object.values(s.competitions).find((c) => c.tier === 1)!;
    const table = finalStandings(comp, s);
    qualifyEurope(s, table);
    s.season += 1;
    s.date = `${s.season}-08-28`;
    const before = s.clubs[table[0].clubId].finance.balance;
    resolveEurope(s, createRng(3));
    expect(s.europe!.resolved).toBe(true);
    expect(s.clubs[table[0].clubId].finance.balance).toBeGreaterThan(before);
    expect(s.europeHistory!.length).toBe(s.europe!.entries.length);
  });

  it('domácí prostředí, motivace trenéra a kabina', () => {
    const club = structuredClone(start.clubs.bohemians);
    club.fanMood = 90;
    const loud = homeAdvantage(club, club.stadium.capacity, club.stadium.capacity);
    club.fanMood = 10;
    const quiet = homeAdvantage(club, club.stadium.capacity * 0.2, club.stadium.capacity);
    expect(loud).toBeGreaterThan(8);
    expect(quiet).toBeLessThan(4);
    const s = structuredClone(start);
    s.owner.trust.trener = 10;
    expect(coachMotivation(s)).toBe(-2);
    for (const p of squadOf(s, 'bohemians')) p.morale = 20;
    expect(dressingRoom(s).bonus).toBeLessThan(0);
  });

  it('starší uložená hra (verze 7) se převede, platy se přepočítají a přibudou sponzorská místa', () => {
    const old = structuredClone(start) as unknown as Record<string, unknown> & { version: number };
    old.version = 7;
    const p = squadOf(start, 'bohemians')[0];
    const m = migrateSave(old)!;
    expect(m.version).toBe(start.version);
    expect(m.budget?.approved).toBeTruthy();
    expect(m.players[p.id].wage).toBeGreaterThan(p.wage);
    expect(m.clubs.bohemians.sponsors?.length).toBeGreaterThan(0);
    expect(annualCosts(m.clubs.bohemians, 1)).toBeGreaterThan(0);
  });
});
