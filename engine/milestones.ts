import { forecastSeason } from './budget';
import { addDays } from './calendar';
import { prizeMoney } from './finance';
import { licenceProblems } from './financing';
import { squadOf } from './players';
import { computeTable } from './standings';
import { expectedPosition, goalLabel } from './staff';
import { budgetRemaining } from './transfers';
import type { GameState } from './types';
import { clubLabel, competitionOf } from './world';

/**
 * Milníky sezóny: důležité body, na kterých se posun času zastaví a hra vysvětlí, co nastává.
 * Tlačítko „dál“ je ukazuje jako krok („Do startu ligy“), po dosažení vyskočí okno s vysvětlením.
 */

export type MilestoneTab = 'prehled' | 'tabulky' | 'kadr' | 'prestupy' | 'vedeni' | 'stadion' | 'finance';

export interface Milestone {
  id: string;
  date: string;
  /** Krátký popisek na tlačítko: „Do {short} ›“. */
  short: string;
  title: string;
  text: string[];
  /** Kam vede tlačítko; u Financí i konkrétní podzáložka. */
  todo: { label: string; tab: MilestoneTab; sub?: 'prehled' | 'rozpocet' | 'prijmy' | 'vydaje' | 'financovani' }[];
}

const mil = (v: number) => (Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč` : `${Math.round(v / 1000).toLocaleString('cs-CZ')} tis. Kč`);
const fmt = (d: string) => d.split('-').slice(1).reverse().map(Number).join('. ') + '.';

/** Milníky aktuální sezóny (a začátek té příští), seřazené podle data. */
export function seasonMilestones(state: GameState): Milestone[] {
  const y = state.season;
  const own = state.owner.clubId;
  const comp = competitionOf(state, own);
  const out: Milestone[] = [];
  const add = (m: Milestone) => out.push(m);
  const squad = () => squadOf(state, own);

  add({
    id: `start-${y}`,
    date: `${y}-07-01`,
    short: 'nové sezóny',
    title: `Začíná sezóna ${y}/${String(y + 1).slice(2)}`,
    text: [
      'Finanční ředitel (nebo účetní) připravil rozpočet. Schvalte ho do 15. 7., při schválení se prodají permanentky.',
      `Přestupní okno je otevřené do 31. 8. Vedení navrhuje cíl sezóny: ${comp ? goalLabel(state.owner.seasonGoal, comp) : 'udržet se'}. Změnit ho můžete ve Vedení; podle něj vás budou hodnotit fanoušci, média${state.shareholders.length ? ' i spolumajitelé' : ' i vedení'}.`,
    ],
    todo: [
      { label: 'Rozpočet sezóny', tab: 'finance', sub: 'rozpocet' },
      { label: 'Cíl sezóny', tab: 'vedeni' },
      { label: 'Přestupy', tab: 'prestupy' },
    ],
  });

  // Termín rozpočtu není milník: když ho majitel neschválí, návrh vedení platí sám (jen zpráva).

  const league = comp?.fixtures.filter((f) => f.homeId === own || f.awayId === own).sort((a, b) => (a.date < b.date ? -1 : 1)) ?? [];
  const autumn = league.filter((f) => f.date < `${y + 1}-01-01`);
  const spring = league.filter((f) => f.date >= `${y + 1}-01-01`);
  if (comp && autumn.length) {
    const first = autumn[0];
    add({
      id: `liga-${y}`,
      date: addDays(first.date, -1),
      short: 'startu ligy',
      title: `Zítra začíná ${comp.name}`,
      text: [
        `První zápas: ${clubLabel(state, first.homeId)} – ${clubLabel(state, first.awayId)}.`,
        `Cíl sezóny: ${goalLabel(state.owner.seasonGoal, comp)}. V kádru je ${squad().length} hráčů, na přestupy zbývá ${mil(budgetRemaining(state))}.`,
      ],
      todo: [
        { label: 'Kádr', tab: 'kadr' },
        { label: 'Přestupy', tab: 'prestupy' },
      ],
    });
  }

  const eu = state.europe?.season === y ? state.europe.entries.find((e) => e.clubId === own) : undefined;
  if (eu) {
    add({
      id: `evropa-${y}`,
      date: `${y}-08-28`,
      short: 'Evropy',
      title: 'Evropské poháry: rozhodnuto o předkolech',
      text: [
        state.europe!.resolved
          ? eu.result === 'predkola'
            ? 'Klub v předkolech vypadl. Peníze za účast v předkolech přišly, ligová fáze nebude.'
            : `Klub postoupil do ligové fáze. Peníze přijdou ve čtyřech splátkách od října do ledna, celkem asi ${mil(eu.revenue)}.`
          : 'Dnes se rozhoduje o postupu z předkol.',
      ],
      todo: [{ label: 'Příjmy', tab: 'finance', sub: 'prijmy' }],
    });
  }

  add({
    id: `okno-leto-${y}`,
    date: `${y}-08-30`,
    short: 'konce okna',
    title: 'Zítra se zavírá letní přestupní okno',
    text: [
      `Do zítřka můžete kupovat a prodávat hráče. Pak až v zimním okně od 8. 1.`,
      `V kádru je ${squad().length} hráčů, na přestupy zbývá ${mil(budgetRemaining(state))}.`,
    ],
    todo: [
      { label: 'Přestupy', tab: 'prestupy' },
      { label: 'Kádr', tab: 'kadr' },
    ],
  });

  if (comp && autumn.length && spring.length) {
    const table = computeTable(comp, state);
    const pos = table.findIndex((r) => r.clubId === own) + 1;
    add({
      id: `pauza-${y}`,
      date: addDays(autumn[autumn.length - 1].date, 1),
      short: 'zimní pauzy',
      title: 'Konec podzimu, zimní pauza',
      text: [
        `Po podzimu je klub na ${pos}. místě (cíl: ${goalLabel(state.owner.seasonGoal, comp)}).`,
        `Zimní přestupní okno se otevře 8. 1., jaro začíná ${fmt(spring[0].date)}. Dobrý čas zkontrolovat výhled rozpočtu a končící smlouvy.`,
      ],
      todo: [
        { label: 'Tabulka', tab: 'tabulky' },
        { label: 'Výhled financí', tab: 'finance', sub: 'prehled' },
      ],
    });
  }

  add({
    id: `okno-zima-${y}`,
    date: `${y + 1}-01-08`,
    short: 'zimního okna',
    title: 'Otevřelo se zimní přestupní okno',
    text: [`Do 14. 2. můžete kupovat a prodávat. Na přestupy zbývá ${mil(budgetRemaining(state))}.`],
    todo: [{ label: 'Přestupy', tab: 'prestupy' }],
  });
  add({
    id: `okno-zima-konec-${y}`,
    date: `${y + 1}-02-13`,
    short: 'konce okna',
    title: 'Zítra se zavírá zimní přestupní okno',
    text: ['Poslední den, kdy můžete posílit kádr nebo prodat hráče. Další okno až v létě.'],
    todo: [{ label: 'Přestupy', tab: 'prestupy' }],
  });

  if (spring.length) {
    const first = spring[0];
    add({
      id: `jaro-${y}`,
      date: addDays(first.date, -1),
      short: 'startu jara',
      title: 'Zítra začíná jarní část',
      text: [`První jarní zápas: ${clubLabel(state, first.homeId)} – ${clubLabel(state, first.awayId)}.`],
      todo: [{ label: 'Kádr', tab: 'kadr' }],
    });
  }

  // Licence je milník, jen když by neprošla (jinak není co řešit).
  const problems = licenceProblems(state);
  if (problems.length) add({
    id: `licence-${y}`,
    date: `${y + 1}-03-30`,
    short: 'licence',
    title: 'Zítra licenční řízení svazu',
    text: [
      'Svaz kontroluje vlastní kapitál (půjčka majitele se počítá jako vlastní zdroje) a neuhrazené závazky.',
      `Teď by licence neprošla: ${problems.join(', ')}. Na nápravu bude čas do 31. 5.`,
    ],
    todo: [{ label: 'Financování', tab: 'finance', sub: 'financovani' }],
  });
  if (state.licence?.season === y && state.licence.status === 'podminka' && problems.length) {
    add({
      id: `licence-naprava-${y}`,
      date: `${y + 1}-05-30`,
      short: 'termínu licence',
      title: 'Zítra končí termín na nápravu licence',
      text: [`Pořád chybí: ${problems.join(', ')}. Hrozí pokuta a odečet 5 bodů v příští sezóně.`],
      todo: [{ label: 'Financování', tab: 'finance', sub: 'financovani' }],
    });
  }

  if (comp?.reservedDates?.length) {
    add({
      id: `nadstavba-${y}`,
      date: addDays(comp.reservedDates[0], -1),
      short: 'nadstavby',
      title: 'Zítra začíná nadstavba',
      text: comp.clubIds.length === 16
        ? [
            'Základní část skončila. 1.–6. hraje skupinu o titul a 11.–16. skupinu o záchranu: jednokolově 5 kol, body ze základní části zůstávají.',
            '7.–10. hraje play-off o umístění (semifinále 10–7 a 9–8 na dva zápasy, pak finále). Vítěz získá volný los do 2. kola poháru.',
          ]
        : ['Základní část skončila, kluby se rozdělí do skupin podle tabulky.'],
      todo: [{ label: 'Tabulka', tab: 'tabulky' }],
    });
  }

  if (comp) {
    const position = expectedPosition(state, own);
    const prize = prizeMoney(comp.tier, position, comp.clubIds.length);
    const expiring = squad().filter((p) => p.contractUntil <= y + 1).length;
    const tax = forecastSeason(state).lines.find((l) => l.key === 'dane');
    add({
      id: `konec-${y}`,
      date: `${y + 1}-06-19`,
      short: 'konce sezóny',
      title: 'Zítra končí sezóna',
      text: [
        `Vyplatí se odměna za umístění (odhad ${mil(prize)})${tax && tax.amount < 0 ? ` a daň z příjmů (asi ${mil(-tax.amount)})` : ''}. Rozhodne se o postupech a sestupech.`,
        expiring ? `${expiring} hráčům končí smlouva. Kdo nebude prodloužený, odejde zadarmo.` : 'Žádnému hráči nekončí smlouva.',
      ],
      todo: [
        { label: 'Končící smlouvy', tab: 'finance', sub: 'vydaje' },
        { label: 'Kádr', tab: 'kadr' },
      ],
    });
  }

  out.push({ ...out[0], id: `start-${y + 1}`, date: `${y + 1}-07-01`, title: `Začíná sezóna ${y + 1}/${String(y + 2).slice(2)}` });
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Nejbližší milník po dnešku. */
export function nextMilestone(state: GameState): Milestone | undefined {
  return seasonMilestones(state).find((m) => m.date > state.date);
}

/** Milník, který je dnes (pro okno s vysvětlením). */
export function milestoneToday(state: GameState): Milestone | undefined {
  return seasonMilestones(state).find((m) => m.date === state.date);
}

/** Počet dní do data. */
export function daysUntil(state: GameState, date: string): number {
  return Math.round((new Date(`${date}T00:00:00Z`).getTime() - new Date(`${state.date}T00:00:00Z`).getTime()) / 86_400_000);
}
