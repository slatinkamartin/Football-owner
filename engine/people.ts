import { addDays } from './calendar';
import { book, departmentEffect, departmentReference, departmentsOf, playerWage } from './finance';
import { bestEleven, generatePlayer, playerAge, squadOf } from './players';
import { createRng, type Rng } from './rng';
import { academyBonus, coachOf, directorOf, ensureInterimStaff, hireStaff, type ActionResult } from './staff';
import { playerName, weakestPosition } from './transfers';
import { signSponsor } from './sponsors';
import type { Club, GameEvent, GameState, Player, Position } from './types';
import { addNews, clamp, FREE, hash01, tierOf, transferWindow } from './world';

/**
 * Lidé v klubu: žádosti hráčů, požadavky trenéra, sliby (které se kontrolují), přetahování
 * vedení, letní přijímačky dorostu, pohovory při najímání a pravomoci ředitelů.
 */

// ---------- Šablony situací (zapojené do situací k rozhodnutí) ----------

export interface PeopleHelpers {
  trust: (s: GameState, role: 'trener' | 'reditel', delta: number) => void;
  teamMorale: (s: GameState, delta: number) => void;
}

interface Template {
  weight: (state: GameState) => number;
  create: (state: GameState, rng: Rng) => Omit<GameEvent, 'id' | 'template' | 'date' | 'expires'> | null;
  resolve: (state: GameState, event: GameEvent, option: string) => string;
}

const fmt = (v: number) => `${Math.round(v).toLocaleString('cs-CZ')} Kč`;
const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;
const own = (s: GameState) => s.clubs[s.owner.clubId];
const squad = (s: GameState) => squadOf(s, s.owner.clubId);
const ranked = (s: GameState) => [...squad(s)].sort((a, b) => b.overall - a.overall);
const month = (s: GameState) => Number(s.date.slice(5, 7));
const morale = (p: Player, d: number) => (p.morale = clamp(p.morale + d, 0, 100));
const round1000 = (v: number) => Math.round(v / 1000) * 1000;

export const PEOPLE_COOLDOWN: Record<string, number> = { 'zadost-plat': 45, 'zadost-minuty': 40, 'zadost-volno': 120, 'zadost-smlouva': 120, 'pozadavek-posila': 150, 'pozadavek-mladi': 250, 'pozadavek-medicina': 300, 'reditel-nabidka': 300 };

function underpaid(s: GameState): Player | undefined {
  const rep = own(s).reputation;
  return ranked(s).slice(0, 11).find((p) => !p.loan && p.wage < playerWage(p.overall, rep) * 0.75 && p.contractUntil > s.season + 1);
}

function benchWarmer(s: GameState): Player | undefined {
  const xi = new Set(bestEleven(squad(s)).map((p) => p.id));
  const median = ranked(s)[Math.floor(squad(s).length / 2)]?.overall ?? 0;
  return ranked(s).find((p) => !xi.has(p.id) && p.overall >= median && p.morale < 45 && p.morale >= 25 && !p.loan);
}

function starOfSeason(s: GameState): Player | undefined {
  return ranked(s).slice(0, 11).find((p) => p.ratingCount >= 10 && p.ratingSum / p.ratingCount >= 7.2 && p.contractUntil >= s.season + 2 && !p.loan);
}

export function peopleTemplates(h: PeopleHelpers): Record<string, Template> {
  return {
    'zadost-plat': {
      weight: (s) => (underpaid(s) ? 1.2 : 0),
      create: (s) => {
        const p = underpaid(s);
        if (!p) return null;
        const fair = round1000(playerWage(p.overall, own(s).reputation));
        return {
          title: `${playerName(p)} chce přidat`,
          text: `Patří k oporám, ale bere ${fmt(p.wage)} měsíčně. Na trhu by dostal kolem ${fmt(fair)}.`,
          playerId: p.id,
          amount: fair,
          defaultOption: 'odmitnout',
          options: [
            { id: 'pridat', label: `Přidat na ${fmt(fair)}`, hint: 'Morálka hráče +12, vyšší platy v rozpočtu.' },
            { id: 'kompromis', label: `Kompromis ${fmt(round1000((p.wage + fair) / 2))}`, hint: 'Morálka hráče +4.' },
            { id: 'odmitnout', label: 'Odmítnout', hint: 'Morálka hráče −15, může chtít odejít.' },
          ],
        };
      },
      resolve: (s, e, o) => {
        const p = s.players[e.playerId!];
        if (!p || p.clubId !== s.owner.clubId) return 'Hráč už v klubu není.';
        if (o === 'pridat') {
          p.wage = e.amount!;
          morale(p, 12);
          return `${playerName(p)} má nový plat a je spokojený.`;
        }
        if (o === 'kompromis') {
          p.wage = round1000((p.wage + e.amount!) / 2);
          morale(p, 4);
          return 'Dohodli jste se napůl.';
        }
        morale(p, -15);
        return `${playerName(p)} je zklamaný.`;
      },
    },

    'zadost-minuty': {
      weight: (s) => (benchWarmer(s) ? 1 : 0),
      create: (s) => {
        const p = benchWarmer(s);
        if (!p) return null;
        return {
          title: `${playerName(p)} chce víc hrát`,
          text: 'Je dost dobrý na základní sestavu, ale trenér mu nedává šanci. Přišel za vámi.',
          playerId: p.id,
          defaultOption: 'odmitnout',
          options: [
            { id: 'trener', label: 'Promluvit s trenérem', hint: 'Morálka hráče +8, důvěra trenéra −2 (nerad slyší rady k sestavě).' },
            { id: 'prodej', label: 'Nabídnout ho k prodeji', hint: 'Zařadí se na seznam k prodeji, morálka +5.' },
            { id: 'odmitnout', label: 'Musí si šanci vybojovat', hint: 'Morálka hráče −8.' },
          ],
        };
      },
      resolve: (s, e, o) => {
        const p = s.players[e.playerId!];
        if (!p || p.clubId !== s.owner.clubId) return 'Hráč už v klubu není.';
        if (o === 'trener') {
          morale(p, 8);
          h.trust(s, 'trener', -2);
          return 'Trenér slíbil, že ho bude víc zkoušet.';
        }
        if (o === 'prodej') {
          if (!s.market.listed.includes(p.id)) s.market.listed.push(p.id);
          morale(p, 5);
          return `${playerName(p)} je na seznamu k prodeji.`;
        }
        morale(p, -8);
        return 'Hráč odešel z kanceláře mlčky.';
      },
    },

    'zadost-volno': {
      weight: (s) => (squad(s).length >= 20 ? 0.4 : 0),
      create: (s, rng) => {
        const p = rng.pick(ranked(s).slice(0, 18));
        if (!p) return null;
        return {
          title: `${playerName(p)} prosí o volno kvůli rodině`,
          text: 'Doma se narodilo dítě a v rodině je toho hodně. Chtěl by týden volna.',
          playerId: p.id,
          defaultOption: 'pustit',
          options: [
            { id: 'pustit', label: 'Pustit na týden', hint: 'Týden chybí, morálka hráče +10, kabina +1.' },
            { id: 'nepustit', label: 'Potřebujeme ho', hint: 'Morálka hráče −10.' },
          ],
        };
      },
      resolve: (s, e, o) => {
        const p = s.players[e.playerId!];
        if (!p || p.clubId !== s.owner.clubId) return 'Hráč už v klubu není.';
        if (o === 'pustit') {
          p.injuredUntil = addDays(s.date, 7);
          p.injury = 'osobní volno';
          morale(p, 10);
          h.teamMorale(s, 1);
          return `${playerName(p)} je týden doma s rodinou.`;
        }
        morale(p, -10);
        return 'Hráč zůstává, ale nadšený není.';
      },
    },

    'zadost-smlouva': {
      weight: (s) => ([1, 2, 3, 4, 5].includes(month(s)) && starOfSeason(s) ? 0.8 : 0),
      create: (s) => {
        const p = starOfSeason(s);
        if (!p) return null;
        const wage = round1000(Math.max(p.wage * 1.2, playerWage(p.overall, own(s).reputation)));
        return {
          title: `${playerName(p)} hraje sezónu života a chce novou smlouvu`,
          text: `Průměrná známka ${(p.ratingSum / p.ratingCount).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}. Agent naznačuje, že o něj je zájem.`,
          playerId: p.id,
          amount: wage,
          defaultOption: 'pozdeji',
          options: [
            { id: 'prodlouzit', label: `Prodloužit o 2 roky za ${fmt(wage)}`, hint: 'Morálka +10, hráč zůstane déle (a dráž se prodá).' },
            { id: 'pozdeji', label: 'Až v létě', hint: 'Morálka −5.' },
          ],
        };
      },
      resolve: (s, e, o) => {
        const p = s.players[e.playerId!];
        if (!p || p.clubId !== s.owner.clubId) return 'Hráč už v klubu není.';
        if (o === 'prodlouzit') {
          p.wage = e.amount!;
          p.contractUntil += 2;
          morale(p, 10);
          return `${playerName(p)} podepsal do roku ${p.contractUntil}.`;
        }
        morale(p, -5);
        return 'Jednání se odkládá na léto.';
      },
    },

    'pozadavek-posila': {
      weight: (s) => (coachOf(s, s.owner.clubId) && transferWindow(s.date) && !(s.promises ?? []).some((x) => x.kind === 'posila' && !x.done) ? 1 : 0),
      create: (s) => {
        const coach = coachOf(s, s.owner.clubId);
        if (!coach) return null;
        const { position, bar } = weakestPosition(squad(s));
        const label = { GK: 'brankáře', DF: 'obránce', MF: 'záložníka', FW: 'útočníka' }[position];
        return {
          title: `Trenér chce posilu: ${label}`,
          text: `${coach.firstName} ${coach.lastName} tvrdí, že na pozici ${label} tým ztrácí body. Chce hráče lepšího než ${bar}.`,
          amount: bar,
          defaultOption: 'odmitnout',
          options: [
            { id: 'slib', label: 'Slíbit posilu do konce okna', hint: `Když do konce okna přijde ${label} aspoň s hodnocením ${bar + 3}: důvěra trenéra +6. Jinak −10.` },
            { id: 'odmitnout', label: 'Musí si poradit s tím, co má', hint: 'Důvěra trenéra −4.' },
          ],
        };
      },
      resolve: (s, e, o) => {
        if (o === 'slib') {
          const { position } = weakestPosition(squad(s));
          const end = transferWindow(s.date) === 'leto' ? `${s.date.slice(0, 4)}-08-31` : `${s.date.slice(0, 4)}-02-14`;
          s.promises = [...(s.promises ?? []), { id: `sl${++s.nextId}`, kind: 'posila', role: 'trener', position, bar: (e.amount ?? 0) + 3, until: end, made: s.date, known: squad(s).map((p) => p.id) }];
          return 'Trenér čeká, že slib dodržíte.';
        }
        h.trust(s, 'trener', -4);
        return 'Trenér to nese nelibě.';
      },
    },

    'pozadavek-mladi': {
      weight: (s) => {
        const c = coachOf(s, s.owner.clubId);
        return c && !c.youthFocus && own(s).facilities.academy >= 3 && squad(s).filter((p) => playerAge(p, s.season) <= 21 && p.potential >= p.overall + 8).length >= 2 ? 0.4 : 0;
      },
      create: () => ({
        title: 'Šéf akademie: dejte mladým šanci',
        text: 'V kádru jsou talenti s velkým potenciálem, ale trenér sází na zkušené. Akademie chce, abyste trenérovi doporučil dát mladým víc minut.',
        defaultOption: 'ne',
        options: [
          { id: 'ano', label: 'Doporučit trenérovi mladé', hint: 'Trenér bude stavět mladé (rychlejší vývoj, vyšší hodnota), důvěra trenéra −3, výkon chvíli kolísá.' },
          { id: 'ne', label: 'Výsledky mají přednost', hint: 'Patrioti ve vedení −3 spokojenost.' },
        ],
      }),
      resolve: (s, _e, o) => {
        const c = coachOf(s, s.owner.clubId);
        if (o === 'ano' && c) {
          c.youthFocus = true;
          h.trust(s, 'trener', -3);
          return 'Trenér začne víc stavět mladé.';
        }
        for (const x of s.shareholders) if (x.kind === 'patriot') x.satisfaction = clamp(x.satisfaction - 3, 0, 100);
        return 'Akademie je zklamaná.';
      },
    },

    'pozadavek-medicina': {
      weight: (s) => {
        const injured = squad(s).filter((p) => p.injuredUntil && p.injuredUntil >= s.date && p.injury !== 'osobní volno').length;
        return coachOf(s, s.owner.clubId) && injured >= 2 && departmentEffect(own(s), tierOf(s, s.owner.clubId), 'medicina') < 0.3 ? 1 : 0;
      },
      create: (s) => {
        const club = own(s);
        const tier = tierOf(s, club.id);
        const raise = Math.round((departmentReference(club, tier).medicina * 0.4) / 50_000) * 50_000;
        return {
          title: 'Trenér: máme moc zraněných, potřebujeme lepší medicínu',
          text: 'Na marodce je půl kádru. Trenér chce víc peněz pro zdravotní oddělení (fyzioterapeuti, regenerace).',
          amount: raise,
          defaultOption: 'ne',
          options: [
            { id: 'ano', label: `Přidat medicíně ${mil(raise)} ročně`, hint: 'Méně a kratší zranění, důvěra trenéra +4.' },
            { id: 'ne', label: 'Rozpočet nepovolí', hint: 'Důvěra trenéra −3.' },
          ],
        };
      },
      resolve: (s, e, o) => {
        const club = own(s);
        if (o === 'ano') {
          const d = departmentsOf(club, tierOf(s, club.id));
          club.policy.departments = { ...d, medicina: d.medicina + (e.amount ?? 0) };
          h.trust(s, 'trener', 4);
          return 'Medicína dostala víc peněz (Finance › Výdaje › Oddělení).';
        }
        h.trust(s, 'trener', -3);
        return 'Trenér nesouhlasí.';
      },
    },

    'reditel-nabidka': {
      weight: (s) => {
        const d = directorOf(s, s.owner.clubId);
        return d && !d.interim && d.ability >= 60 && s.owner.trust.reditel >= 40 ? 0.25 : 0;
      },
      create: (s) => {
        const d = directorOf(s, s.owner.clubId)!;
        return {
          title: `O sportovního ředitele ${d.firstName} ${d.lastName} má zájem jiný klub`,
          text: 'Větší klub mu nabízí víc peněz i pravomocí. Zůstane, když dostane lepší smlouvu.',
          amount: d.wage,
          defaultOption: 'odmitnout',
          options: [
            { id: 'pridat', label: 'Přidat mu 25 % a prodloužit o 2 roky', hint: `Plat ${fmt(d.wage * 1.25)} měsíčně, důvěra ředitele +6.` },
            { id: 'pustit', label: 'Pustit ho za odstupné', hint: `Klub dostane ${mil(d.wage * 8)}, přestupy zatím vede zastupující ředitel.` },
            { id: 'odmitnout', label: 'Trvat na smlouvě', hint: 'Zůstane, důvěra ředitele −10.' },
          ],
        };
      },
      resolve: (s, _e, o) => {
        const d = directorOf(s, s.owner.clubId);
        if (!d) return 'Ředitel už v klubu není.';
        if (o === 'pridat') {
          d.wage = round1000(d.wage * 1.25);
          d.contractUntil += 2;
          h.trust(s, 'reditel', 6);
          return 'Ředitel zůstává s lepší smlouvou.';
        }
        if (o === 'pustit') {
          book(s, s.owner.clubId, 'ostatni', d.wage * 8, `Odstupné za ředitele ${d.firstName} ${d.lastName}`);
          d.clubId = FREE;
          own(s).staff.directorId = '';
          ensureInterimStaff(s, createRng(s.rngState ^ s.nextId));
          return 'Ředitel odešel, nového najdete ve Vedení.';
        }
        h.trust(s, 'reditel', -10);
        return 'Ředitel zůstává, ale nadšený není.';
      },
    },
  };
}

// ---------- Sliby ----------

/** Kontrola slibů (týdně): splněné zvednou důvěru, porušené ji srazí. */
export function checkPromises(state: GameState): void {
  for (const p of state.promises ?? []) {
    if (p.done) continue;
    if (p.kind === 'posila') {
      const signed = squad(state).find((x) => !p.known?.includes(x.id) && x.position === p.position && x.overall >= (p.bar ?? 0));
      if (signed) {
        p.done = 'splneno';
        state.owner.trust.trener = clamp(state.owner.trust.trener + 6, 0, 100);
        addNews(state, { kind: 'info', title: `Slib trenérovi splněn: ${playerName(signed)}`, text: 'Trenér dostal posilu, kterou chtěl. Důvěra trenéra +6.' });
      } else if (state.date > p.until) {
        p.done = 'poruseno';
        state.owner.trust.trener = clamp(state.owner.trust.trener - 10, 0, 100);
        addNews(state, { kind: 'varovani', title: 'Slib trenérovi porušen', text: 'Okno se zavřelo a slíbená posila nepřišla. Důvěra trenéra −10.' });
      }
    }
    if (p.kind === 'rozpocet') {
      const club = own(state);
      if (club.policy.transferBudget < (p.value ?? 0) * 0.9) {
        p.done = 'poruseno';
        const role = p.role as 'trener' | 'reditel';
        state.owner.trust[role] = clamp(state.owner.trust[role] - 15, 0, 100);
        addNews(state, { kind: 'varovani', title: 'Porušený slib z pohovoru', text: `Při najímání padl slib rozpočtu na přestupy aspoň ${mil(p.value ?? 0)}. Důvěra ${role === 'trener' ? 'trenéra' : 'ředitele'} −15.` });
      } else if (state.date > p.until) p.done = 'splneno';
    }
  }
  state.promises = (state.promises ?? []).filter((p) => !p.done || p.until > addDays(state.date, -60));
}

// ---------- Pohovor ----------

export interface InterviewAnswers {
  /** Trenér: kolik prostoru mladým. */
  youth?: 'mladi' | 'vyvazene' | 'vysledky';
  /** Trenér i ředitel: rozpočet na přestupy. */
  budget?: 'navysit' | 'udrzet' | 'setrit';
  /** Ředitel: kolik smí rozhodovat sám. */
  autonomy?: 'plna' | 'stredni' | 'mala';
}

/** Co pohovor prozradí o kandidátovi (skryté rysy) a jak sedí odpovědi. */
export function interviewFit(state: GameState, staffId: string, a: InterviewAnswers): { trust: number; notes: string[] } {
  const s = state.staff[staffId];
  const notes: string[] = [];
  let trust = 60;
  if (!s) return { trust, notes };
  if (s.role === 'trener' && a.youth) {
    if (s.youthFocus) notes.push('Rád dává šanci mladým.');
    else notes.push('Sází spíš na zkušené hráče.');
    if ((a.youth === 'mladi') === s.youthFocus || a.youth === 'vyvazene') trust += 5;
    else trust -= 8;
  }
  if (s.ego >= 15) notes.push('Má velké ego: hůř snáší rady do sestavy.');
  if (s.ambition >= 15) notes.push('Je ambiciózní: chce vyhrávat a peníze na posily.');
  if (s.loyalty >= 15) notes.push('Je loajální: neodchází při první nabídce.');
  if (a.budget) {
    if (a.budget === 'navysit') trust += s.ambition >= 12 ? 8 : 4;
    if (a.budget === 'setrit') trust -= s.ambition >= 12 ? 10 : 4;
  }
  if (s.role === 'reditel' && a.autonomy) {
    if (a.autonomy === 'plna') trust += 6;
    if (a.autonomy === 'mala') trust -= s.ego >= 12 ? 8 : 3;
  }
  return { trust: clamp(trust, 30, 85), notes };
}

/** Po najmutí: zapíše počáteční důvěru, sliby z pohovoru a pravomoci. */
export function applyInterview(state: GameState, staffId: string, a: InterviewAnswers): void {
  const s = state.staff[staffId];
  if (!s || (s.role !== 'trener' && s.role !== 'reditel')) return;
  const fit = interviewFit(state, staffId, a);
  state.owner.trust[s.role] = fit.trust;
  if (a.youth === 'mladi' && s.role === 'trener') s.youthFocus = true;
  if (a.budget === 'navysit' || a.budget === 'udrzet') {
    const club = own(state);
    if (a.budget === 'navysit') club.policy.transferBudget = Math.round((club.policy.transferBudget * 1.2) / 100_000) * 100_000;
    state.promises = [...(state.promises ?? []), { id: `sl${++state.nextId}`, kind: 'rozpocet', role: s.role, value: own(state).policy.transferBudget, until: `${state.season + 1}-06-30`, made: state.date }];
  }
  if (a.autonomy) setDelegation(state, { director: a.autonomy === 'plna' ? 'vysoka' : a.autonomy === 'stredni' ? 'stredni' : 'nizka' });
}

// ---------- Pravomoci ----------

export type DelegationLevel = 'nizka' | 'stredni' | 'vysoka';

export interface Delegation {
  /** Sportovní ředitel: nízká = jen nouzové doplnění kádru; střední = smlouvy a doplnění; vysoká = i nákupy a prodeje. */
  director: DelegationLevel;
  /** Obchodní ředitel sám podepisuje nejlepší sponzorské nabídky na volná místa. */
  commercial: boolean;
  /** Finanční ředitel sám schvaluje návrh rozpočtu (majitel ho může dál upravovat). */
  finance: boolean;
}

export function delegationOf(club: Club): Delegation {
  const d = club.policy.delegation;
  return {
    director: d?.director ?? (club.policy.autoSquad === false ? 'nizka' : 'vysoka'),
    commercial: d?.commercial ?? false,
    finance: d?.finance ?? false,
  };
}

export function setDelegation(state: GameState, patch: Partial<Delegation>): void {
  const club = own(state);
  const d = { ...delegationOf(club), ...patch };
  club.policy.delegation = d;
  club.policy.autoSquad = d.director !== 'nizka';
}

export function updateDelegation(prev: GameState, patch: Partial<Delegation>): ActionResult {
  const state = structuredClone(prev);
  setDelegation(state, patch);
  return { state, ok: true, message: 'Pravomoci upraveny.' };
}

/** Smí ředitel sám kupovat a prodávat? */
export function directorMayTrade(state: GameState): boolean {
  return delegationOf(own(state)).director === 'vysoka';
}

/** Měsíčně: víc pravomocí = vedení vám víc věří, méně = cítí se kontrolované. */
export function monthlyDelegation(state: GameState): void {
  const d = delegationOf(own(state));
  const delta = d.director === 'vysoka' ? 0.3 : d.director === 'nizka' ? -0.3 : 0;
  if (directorOf(state, state.owner.clubId)) state.owner.trust.reditel = clamp(state.owner.trust.reditel + delta, 0, 100);
}

// ---------- Přijímačky dorostu ----------

export interface YouthCandidate {
  player: Player;
  /** Odhad akademie: rozpětí potenciálu. */
  potLo: number;
  potHi: number;
}

/** Kolik dorostenců smí klub přijmout. */
export function youthSlots(club: Club): number {
  return club.facilities.academy >= 4 ? 3 : 2;
}

function youthError(state: GameState): number {
  const club = own(state);
  const dept = departmentEffect(club, tierOf(state, club.id), 'mladez');
  return Math.max(2, 7 - club.facilities.academy - dept * 2 - (academyBonus(state, club.id) > 1 ? 1 : 0));
}

export function youthView(state: GameState, p: Player): { potLo: number; potHi: number } {
  const err = youthError(state);
  const est = p.potential + (hash01(`${p.id}-dorost`) * 2 - 1) * err * 0.8;
  return { potLo: Math.min(p.potential, Math.round(est - err)), potHi: Math.max(p.potential, Math.round(est + err)) };
}

/** Konec sezóny: akademie klubu majitele představí dorostence (místo automatického přijetí). */
export function createYouthIntake(state: GameState, rng: Rng, season: number, quality: number, academy: number, bonus: number): void {
  const club = own(state);
  const count = academy >= 4 ? 6 : academy >= 2 ? 5 : 4;
  const candidates: Player[] = [];
  for (let i = 0; i < count; i++) {
    const position = rng.pick(['GK', 'DF', 'DF', 'MF', 'MF', 'FW'] as Position[]);
    const p = generatePlayer(rng, state, { clubId: FREE, position, season, quality: quality + rng.normal(0, 3), age: rng.int(17, 18) });
    p.wage = 8_000;
    p.potential = Math.min(95, Math.round(p.potential + Math.max(0, academy - 3) * 2 + bonus + rng.normal(0, 3)));
    candidates.push(p);
  }
  state.youthIntake = { season, deadline: `${season}-07-15`, slots: youthSlots(club), candidates, chosen: [] };
  addNews(state, { kind: 'info', title: `Akademie představila ${count} dorostenců`, text: `Smlouvu můžete dát nejvýš ${youthSlots(club)} z nich (Kádr › Přijímačky dorostu) do 15. 7. Ostatní odejdou jinam.` });
}

export function toggleYouth(prev: GameState, playerId: string): ActionResult {
  const intake = prev.youthIntake;
  if (!intake) return { state: prev, ok: false, message: 'Přijímačky neprobíhají.' };
  const state = structuredClone(prev);
  const it = state.youthIntake!;
  if (it.chosen.includes(playerId)) it.chosen = it.chosen.filter((x) => x !== playerId);
  else if (it.chosen.length >= it.slots) return { state: prev, ok: false, message: `Smlouvu lze dát nejvýš ${it.slots} dorostencům.` };
  else it.chosen.push(playerId);
  return { state, ok: true, message: '' };
}

/** Uzavření přijímaček (15. 7. nebo ručně): vybraní podepíšou, ostatní jdou mezi volné hráče. */
export function closeYouthIntake(prev: GameState, mutate = false): ActionResult {
  const state = mutate ? prev : structuredClone(prev);
  const it = state.youthIntake;
  if (!it) return { state: prev, ok: false, message: 'Přijímačky neprobíhají.' };
  // Když majitel nevybral, rozhodne šéf akademie podle odhadu potenciálu.
  const chosen = it.chosen.length ? it.chosen : [...it.candidates].sort((a, b) => youthView(state, b).potHi + youthView(state, b).potLo - (youthView(state, a).potHi + youthView(state, a).potLo)).slice(0, it.slots).map((p) => p.id);
  const own = state.owner.clubId;
  const signed: string[] = [];
  for (const p of it.candidates) {
    if (chosen.includes(p.id)) {
      p.clubId = own;
      p.contractUntil = state.season + 3;
      signed.push(`${playerName(p)} (${p.overall}, potenciál ${p.potential})`);
    } else {
      p.clubId = FREE;
      p.wage = 6_000;
    }
    state.players[p.id] = p;
  }
  state.youthIntake = undefined;
  const message = `Z akademie podepsali: ${signed.join(', ')}. Ostatní dorostenci odešli jinam.`;
  addNews(state, { kind: 'info', title: 'Přijímačky dorostu uzavřeny', text: message });
  return { state, ok: true, message };
}


/** Obchodní ředitel s pravomocí: na volná sponzorská místa podepíše nejlepší nabídku (jednou měsíčně). */
export function autoSponsors(state: GameState): void {
  const club = own(state);
  if (!delegationOf(club).commercial || !club.staff.commercialId || state.owner.ousted) return;
  const taken = new Set((club.sponsors ?? []).map((c) => c.slot));
  const best = new Map<string, { id: string; annual: number }>();
  for (const o of state.sponsorOffers ?? []) {
    if (taken.has(o.slot) || o.slot === 'stadion') continue;
    const b = best.get(o.slot);
    if (!b || o.annual > b.annual) best.set(o.slot, { id: o.id, annual: o.annual });
  }
  for (const { id } of best.values()) {
    const r = signSponsor(state, id);
    if (r.ok) Object.assign(state, r.state);
  }
}

/** Najmutí po pohovoru: počáteční důvěra podle toho, jak sedí odpovědi, a zapsané sliby. */
export function hireWithInterview(prev: GameState, staffId: string, years: number, answers: InterviewAnswers): ActionResult {
  const r = hireStaff(prev, staffId, years);
  if (!r.ok) return r;
  applyInterview(r.state, staffId, answers);
  const fit = r.state.owner.trust[r.state.staff[staffId]?.role === 'reditel' ? 'reditel' : 'trener'];
  return { ...r, message: `${r.message} Výchozí důvěra po pohovoru: ${Math.round(fit)}.` };
}
