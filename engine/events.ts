import { addDays } from './calendar';
import { easeAdd } from './ease'; // W2 kalibrace: tlumení zisků nad ~80
import { annualCosts, bonusPerPoint, book, commercialMonthly, defaultTicketPrice } from './finance';
import { generatePlayer, playerAge, squadOf, squadQualityForReputation } from './players';
import type { Rng } from './rng';
import { fine, fineFactor, greyAction, league, media } from './grey';
import { campaignCost, clubValuation, confidenceVote, distributableProfit, payDividend, satisfy, shareholderConfidence } from './ownership';
import { executeTransfer, playerValue as playerValueOf } from './transfers';
import { coachOf, goalTarget, ownPosition, type ActionResult } from './staff';
import type { Club, GameEvent, GameState, Player, Position } from './types';
import { addNews, clamp, competitionOf, FOREIGN_PREFIX, tierOf } from './world';
import { difficultyCostFactor, dramaFactor, maxOpenEvents } from './settings';
import { resolveStoryEvent } from './stories';
import { resolvePress } from './matchday';
import { PEOPLE_COOLDOWN, peopleTemplates } from './people';
import { FINANCE_COOLDOWN, financeTemplates } from './finplus';
import { takeoverTemplate, ultrasTemplates } from './surroundings';
import { starsTemplates } from './stars';
import { rivalTemplates } from './rivals';
import { socialTemplates } from './social'; // W2: sociální sítě
import { bigDecisionTemplates } from './bigdecisions';
import { decisionBudgetLeft, decisionsLastWeek, situationTemplates } from './situations'; // R1: situace z dat a týdenní limit
import { freshOwnMatch, matchesWord, seasonFacts } from './facts'; // R1
import { ultrasOf } from './surroundings'; // R1
import { characterTemplates } from './characters'; // V1
import { noteProfit, ownerDecisionTemplates, reinvestOption, reinvestProfit } from './ownerdecisions'; // W5: strategická rozhodnutí majitele
import { chemistryTemplates } from './chemistry'; // W4

/**
 * Situace, na které musí majitel zareagovat. Každá šablona umí událost vytvořit (pokud dává smysl)
 * a provést zvolenou odpověď. Když majitel do termínu nerozhodne, platí výchozí volba.
 */

const MAX_OPEN = 3;
/** Kolik dní musí uplynout, než se stejná situace může zopakovat. */
const COOLDOWN: Record<string, number> = { sazkovka: 330, soustredeni: 300, dotace: 300, asistent: 300, pyro: 75, noc: 50, serie: 40, regenerace: 150, travnik: 120, talent: 90, specialista: 45, odchod: 60, protest: 60, 'obrazova-prava': 400, tapping: 150, 'spriznena-firma': 300, 'kontroverzni-sponzor': 365, navstevnost: 200, 'mladez-odkup': 200, lobbing: 300, 'trener-nabidka': 300, charita: 120, vyjezd: 90, 'investor-nabidka': 365, 'svaz-bezpecnost': 365, 'novinar-investigace': 60, tiskovka: 45, rozhovor: 90, 'kauza-hrac': 90, 'svaz-spor': 60, valna: 300, navrat: 60 };
/** Situace, které přicházejí i odvolanému majiteli. */
const OUSTED_TEMPLATES = new Set(['navrat', 'krize']);
const EXPIRES_DAYS = 14;
const fmt = (v: number) => `${Math.round(v).toLocaleString('cs-CZ')} Kč`;
const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;

function ownClub(state: GameState): Club {
  return state.clubs[state.owner.clubId];
}

function teamMorale(state: GameState, delta: number): void {
  for (const p of squadOf(state, state.owner.clubId)) p.morale = clamp(p.morale + delta, 0, 100);
}

function trust(state: GameState, role: 'trener' | 'reditel', delta: number): void {
  // Když majitel nerozhodne, platí dopad výchozí volby naplno (dřív se tlumil a pasivita se vyplácela).
  const d = delta;
  state.owner.trust[role] = easeAdd(state.owner.trust[role], d);
}

function fans(state: GameState, delta: number): void {
  const club = ownClub(state);
  club.fanMood = clamp(club.fanMood + delta, 0, 100);
}

function pay(state: GameState, amount: number, note: string): void {
  book(state, state.owner.clubId, 'ostatni', -amount, note);
}

/** Měřítko výdajů v situacích: velikost klubu × obtížnost (těžká hra = dražší situace). */
function costScale(state: GameState): number {
  return scale(state) * difficultyCostFactor(state);
}

/** Měřítko částek podle velikosti klubu (aby situace dávaly smysl v 1. lize i v MSFL). */
function scale(state: GameState): number {
  return annualCosts(ownClub(state), tierOf(state, state.owner.clubId)) / 70_000_000;
}

function round(v: number, step = 50_000): number {
  return Math.max(step, Math.round(v / step) * step);
}

interface Template {
  /** Jak moc je situace teď pravděpodobná (0 = vůbec). */
  weight: (state: GameState) => number;
  create: (state: GameState, rng: Rng) => Omit<GameEvent, 'id' | 'template' | 'date' | 'expires'> | null;
  resolve: (state: GameState, event: GameEvent, option: string) => string;
}

const month = (state: GameState) => Number(state.date.slice(5, 7));
const squad = (state: GameState) => squadOf(state, state.owner.clubId);
const keyPlayers = (state: GameState) => [...squad(state)].sort((a, b) => b.overall - a.overall).slice(0, 14);
const pName = (p: Player) => `${p.firstName} ${p.lastName}`;
const injured = (s: GameState) => squad(s).filter((p) => p.injuredUntil && p.injuredUntil > s.date);
/** Dobrý hráč jiného klubu ze stejné soutěže, kterého by šlo neoficiálně oslovit. */
function tappingTarget(s: GameState): Player | undefined {
  const comp = competitionOf(s, s.owner.clubId);
  if (!comp) return undefined;
  const ours = keyPlayers(s);
  const bar = ours.length ? ours[Math.min(5, ours.length - 1)].overall : 0;
  return Object.values(s.players)
    .filter((p) => p.clubId !== s.owner.clubId && comp.clubIds.includes(p.clubId) && p.overall >= bar && !s.grey.tapped?.includes(p.id))
    .sort((a, b) => a.overall - b.overall || a.id.localeCompare(b.id))[0];
}

export const TEMPLATES: Record<string, Template> = {
  // Žádosti hráčů, požadavky trenéra a přetahování ředitele (engine/people.ts).
  ...peopleTemplates({ trust, teamMorale }),
  // Sponzoři s aktivacemi a finanční šoky (engine/finplus.ts).
  ...financeTemplates({ teamMorale, media }),
  // Převzetí klubu a kotel (engine/surroundings.ts).
  prevzeti: takeoverTemplate(),
  // W3: velká rozhodnutí s dlouhými důsledky (engine/bigdecisions.ts, plánuje je weeklyBigDecisions).
  ...bigDecisionTemplates(),
  // Vedení soupeřů: výroky a lákání sponzorů (engine/rivals.ts, vznikají z háčků).
  ...rivalTemplates(),
  ...socialTemplates(), // W2: kauzy, příspěvky hráčů, ohlášení posily
  ...ultrasTemplates(),
  // W1: letní nabídka z velké ligy za hvězdu (engine/stars.ts).
  ...starsTemplates(),
  // R1: situace z dat (engine/situations.ts, vznikají den po zápase z faktů, nikdy náhodně).
  ...situationTemplates(),
  ...characterTemplates(), // V1: požadavky postav
  ...ownerDecisionTemplates(), // W5: strategická rozhodnutí majitele (plánuje je dailyOwnerDecisions)
  ...chemistryTemplates(), // W4: kapitán na novou sezónu
  // Tisková konference po výjimečném zápase (vzniká po zápase, ne náhodně).
  'tiskovka-zapas': {
    weight: () => 0,
    create: () => null,
    resolve: (s, e, o) => resolvePress(s, e, o, { media, league, fine }),
  },

  soustredeni: {
    weight: (s) => (month(s) === 12 || (month(s) === 1 && s.date.slice(8) < '10') ? 3 : 0),
    create: (s) => {
      const amount = round(1_500_000 * costScale(s), 100_000);
      return {
        title: 'Trenér chce zimní soustředění v Turecku',
        text: `${(() => {
          const f = seasonFacts(s);
          return f.position ? `Tým přezimuje na ${f.position}. místě s ${f.points ?? 0} body. ` : '';
        })()}Dva týdny v teple, kvalitní hřiště a přípravné zápasy se silnými soupeři. Stojí to ${mil(amount)}.`,
        amount,
        defaultOption: 'doma',
        options: [
          { id: 'zaplatit', label: 'Zaplatit soustředění', hint: `−${mil(amount)}, morálka týmu +6, důvěra trenéra +6` },
          { id: 'doma', label: 'Připravovat se doma', hint: 'Zdarma, důvěra trenéra −5' },
        ],
      };
    },
    resolve: (s, e, o) => {
      if (o === 'zaplatit') {
        pay(s, e.amount!, 'Zimní soustředění v Turecku');
        teamMorale(s, 6);
        trust(s, 'trener', 6);
        return 'Tým odletěl na soustředění. Trenér je spokojený.';
      }
      trust(s, 'trener', -5);
      return 'Tým se připravuje doma. Trenér to nese nelibě.';
    },
  },

  noc: {
    // R1: vyřazeno – vymyšlený prohřešek skutečného hráče mimo hřiště bez příčiny v datech (jen pro staré uložené hry).
    weight: () => 0,
    create: (s, rng) => {
      const p = rng.pick(squad(s).filter((x) => playerAge(x, s.season) < 30));
      if (!p) return null;
      return {
        title: `${pName(p)} pařil noc před tréninkem`,
        text: 'Fotky z baru kolují po sociálních sítích. Kabina čeká, jak zareagujete.',
        playerId: p.id,
        defaultOption: 'prehlednout',
        options: [
          { id: 'pokuta', label: 'Udělit pokutu', hint: `Hráč zaplatí ${fmt(p.wage * 0.5)}, jeho morálka −10, důvěra trenéra +3` },
          { id: 'tribuna', label: 'Poslat ho na dva zápasy na tribunu', hint: 'Nenastoupí ve 2 zápasech, jeho morálka −15, důvěra trenéra +5' },
          { id: 'prehlednout', label: 'Přehlédnout to', hint: 'Důvěra trenéra −6, morálka týmu −2' },
        ],
      };
    },
    resolve: (s, e, o) => {
      const p = s.players[e.playerId!];
      if (!p) return 'Hráč už v klubu není.';
      if (o === 'pokuta') {
        book(s, s.owner.clubId, 'ostatni', p.wage * 0.5, `Pokuta: ${pName(p)}`);
        p.morale = clamp(p.morale - 10, 0, 100);
        trust(s, 'trener', 3);
        return `${pName(p)} dostal pokutu.`;
      }
      if (o === 'tribuna') {
        p.suspension += 2;
        p.morale = clamp(p.morale - 15, 0, 100);
        trust(s, 'trener', 5);
        return `${pName(p)} si dva zápasy odsedí na tribuně.`;
      }
      trust(s, 'trener', -6);
      teamMorale(s, -2);
      return 'Prohřešek zůstal bez trestu. Trenér nesouhlasí.';
    },
  },

  serie: {
    // R1: nahrazeno situací z dat sit-serie (cituje skóre série, volba s podmíněnou prémií).
    weight: () => 0,
    create: (s) => {
      const amount = round(bonusPerPoint(ownClub(s)) * 3);
      return {
        title: 'Kapitán žádá mimořádnou prémii za sérii výher',
        text: 'Tým vyhrál tři zápasy po sobě a kabina by ocenila odměnu navíc.',
        amount,
        defaultOption: 'odmitnout',
        options: [
          { id: 'zaplatit', label: 'Vyplatit prémii', hint: `−${fmt(amount)}, morálka týmu +5` },
          { id: 'odmitnout', label: 'Odmítnout', hint: 'Morálka týmu −4' },
        ],
      };
    },
    resolve: (s, e, o) => {
      if (o === 'zaplatit') {
        book(s, s.owner.clubId, 'platy', -e.amount!, 'Mimořádná prémie za sérii výher');
        teamMorale(s, 5);
        return 'Prémie vyplacena, kabina je nadšená.';
      }
      teamMorale(s, -4);
      return 'Hráči si prémii nevybojovali.';
    },
  },

  regenerace: {
    // R1: jen když je v kádru opravdu hodně zraněných (příčina z dat), text je cituje.
    weight: (s) => (ownClub(s).facilities.medical <= 3 && injured(s).length >= 3 ? 1 : 0),
    create: (s) => {
      const amount = round(2_000_000 * costScale(s), 100_000);
      const hurt = injured(s);
      return {
        title: `Hráči si stěžují na zastaralou regeneraci (${hurt.length} zranění)`,
        text: `Zraněných je teď ${hurt.length}: ${hurt.slice(0, 4).map(pName).join(', ')}${hurt.length > 4 ? ' a další' : ''}. Fyzioterapeut upozorňuje, že s regenerací na úrovni ${ownClub(s).facilities.medical} z 5 se hráči budou zraňovat dál.`,
        amount,
        defaultOption: 'odlozit',
        options: [
          { id: 'koupit', label: 'Koupit vybavení hned', hint: `−${mil(amount)}, regenerace +1 hvězda, morálka týmu +3` },
          { id: 'odlozit', label: 'Odložit', hint: 'Morálka týmu −3' },
        ],
      };
    },
    resolve: (s, e, o) => {
      const club = ownClub(s);
      if (o === 'koupit' && club.facilities.medical < 5) {
        pay(s, e.amount!, 'Nové vybavení regenerace');
        club.facilities.medical += 1;
        teamMorale(s, 3);
        return 'Regenerace má nové vybavení.';
      }
      teamMorale(s, -3);
      return 'Nákup se odkládá.';
    },
  },

  sazkovka: {
    weight: (s) => (ownClub(s).sponsorDeal?.name.includes('sázk') ? 0 : 0.4),
    create: (s) => {
      const amount = round(commercialMonthly(ownClub(s), tierOf(s, s.owner.clubId)) * 2, 100_000);
      return {
        title: 'Sázková kancelář nabízí reklamu na dresech',
        text: 'Peníze navíc do konce sezóny. Část fanoušků se ale proti sázkovým sponzorům ozývá.',
        amount,
        defaultOption: 'odmitnout',
        options: [
          { id: 'prijmout', label: 'Přijmout', hint: `+${mil(amount)} hned, nálada fanoušků −8` },
          { id: 'odmitnout', label: 'Odmítnout', hint: 'Nálada fanoušků +2' },
        ],
      };
    },
    resolve: (s, e, o) => {
      if (o === 'prijmout') {
        book(s, s.owner.clubId, 'komercni', e.amount!, 'Reklama sázkové kanceláře na dresech');
        fans(s, -8);
        return 'Smlouva podepsána. Fanoušci jsou rozladění.';
      }
      fans(s, 2);
      return 'Nabídka odmítnuta. Fanoušci to oceňují.';
    },
  },

  protest: {
    weight: (s) => {
      const club = ownClub(s);
      return club.policy.ticketPrice > defaultTicketPrice(tierOf(s, club.id)) * 1.3 ? 3 : 0;
    },
    create: (s) => ({
      title: 'Fanoušci protestují proti cenám vstupenek',
      text: `Vstupné ${ownClub(s).policy.ticketPrice} Kč je o ${Math.round((ownClub(s).policy.ticketPrice / defaultTicketPrice(tierOf(s, s.owner.clubId)) - 1) * 100)} % nad běžnou cenou (${defaultTicketPrice(tierOf(s, s.owner.clubId))} Kč). Na tribuně visí transparenty a fanklub vyzývá k bojkotu.`,
      defaultOption: 'ponechat',
      options: [
        { id: 'snizit', label: 'Vrátit běžnou cenu', hint: `Cena ${defaultTicketPrice(tierOf(s, s.owner.clubId))} Kč, nálada fanoušků +8` },
        { id: 'ponechat', label: 'Cenu ponechat', hint: 'Nálada fanoušků −10' },
      ],
    }),
    resolve: (s, _e, o) => {
      if (o === 'snizit') {
        ownClub(s).policy.ticketPrice = defaultTicketPrice(tierOf(s, s.owner.clubId));
        fans(s, 8);
        return 'Ceny vstupenek se vracejí na běžnou úroveň.';
      }
      fans(s, -10);
      return 'Ceny zůstávají. Fanoušci jsou naštvaní.';
    },
  },

  pyro: {
    // R1: jen týden po domácím zápase a s napjatým vztahem ke kotli; text cituje zápas.
    weight: (s) => {
      const m = freshOwnMatch(s, 7);
      return m && m.home && ultrasOf(s).relation < 60 ? 0.6 : 0;
    },
    create: (s, rng) => {
      const amount = round(rng.int(100_000, 400_000), 10_000);
      const security = round(400_000 * costScale(s), 50_000);
      const m = freshOwnMatch(s, 7);
      return {
        title: `Disciplinární komise: pokuta ${fmt(amount)} za pyrotechniku`,
        text: `Fanoušci odpálili světlice na domácím zápase${m ? ` s ${m.opponentName} (${m.gf}:${m.ga})` : ''}. Přísnější pořadatelskou službu (asi ${fmt(security)} za sezónu navíc) nastavíte u stadionu.`,
        amount,
        defaultOption: 'zaplatit',
        // Pokuta není volba: zaplatí se rovnou a přijde jen zpráva.
        options: [{ id: 'zaplatit', label: 'Zaplatit pokutu', hint: `−${fmt(amount)}` }],
      };
    },
    resolve: (s, e, o) => {
      pay(s, e.amount!, 'Pokuta za pyrotechniku');
      if (o === 'bezpecnost') {
        pay(s, round(400_000 * costScale(s), 50_000), 'Posílení pořadatelské služby');
        fans(s, -3);
        return 'Pokuta zaplacena a pořadatelů je víc.';
      }
      return 'Pokuta zaplacena.';
    },
  },

  talent: {
    weight: (s) => ([3, 4, 5].includes(month(s)) ? 1 + ownClub(s).facilities.academy * 0.3 : 0),
    create: (s, rng) => {
      const club = ownClub(s);
      const position = rng.pick(['DF', 'MF', 'FW', 'MF'] as Position[]);
      const p = generatePlayer(rng, s, { clubId: '', position, season: s.season, quality: squadQualityForReputation(club.reputation) - 6, age: 17 });
      p.potential = Math.min(95, p.potential + 8 + club.facilities.academy * 2);
      p.wage = round(15_000 * (club.reputation / 60), 1_000);
      s.players[p.id] = p;
      return {
        title: `Talent z akademie ${pName(p)} chce profesionální smlouvu`,
        text: `Sedmnáctiletý ${p.position === 'FW' ? 'útočník' : p.position === 'DF' ? 'obránce' : 'záložník'} s hodnocením ${p.overall} a potenciálem kolem ${p.potential}. O kluka se zajímají i jiné kluby.`,
        playerId: p.id,
        amount: p.wage,
        defaultOption: 'odmitnout',
        options: [
          { id: 'podepsat', label: 'Podepsat na 3 roky', hint: `Plat ${fmt(p.wage)} měsíčně, hráč přijde do kádru` },
          { id: 'odmitnout', label: 'Nechat ho odejít', hint: 'Odejde jinam zadarmo' },
        ],
      };
    },
    resolve: (s, e, o) => {
      const p = s.players[e.playerId!];
      if (!p) return 'Hráč už není k dispozici.';
      if (o === 'podepsat') {
        p.clubId = s.owner.clubId;
        p.contractUntil = s.season + 3;
        p.morale = 80;
        return `${pName(p)} podepsal první profesionální smlouvu.`;
      }
      delete s.players[p.id];
      return `${pName(p)} odešel do jiného klubu.`;
    },
  },

  specialista: {
    weight: (s) => (squad(s).some((p) => p.injuredUntil && p.injuredUntil > addDays(s.date, 30) && keyPlayers(s).includes(p)) ? 3 : 0),
    create: (s) => {
      const p = keyPlayers(s).find((x) => x.injuredUntil && x.injuredUntil > addDays(s.date, 30));
      if (!p) return null;
      const amount = round(800_000 * Math.max(0.5, costScale(s)), 50_000);
      return {
        title: `Specialista v Německu nabízí léčbu: ${pName(p)}`,
        text: `Hráč je zraněný do ${p.injuredUntil!.split('-').reverse().join('. ')}. Zahraniční klinika slibuje rychlejší návrat.`,
        playerId: p.id,
        amount,
        defaultOption: 'doma',
        options: [
          { id: 'specialista', label: 'Poslat ho na kliniku', hint: `−${fmt(amount)}, návrat asi o 40 % dřív` },
          { id: 'doma', label: 'Léčit doma', hint: 'Zdarma' },
        ],
      };
    },
    resolve: (s, e, o) => {
      const p = s.players[e.playerId!];
      if (!p?.injuredUntil) return 'Hráč už je zdravý.';
      if (o === 'specialista') {
        pay(s, e.amount!, `Léčba na zahraniční klinice: ${pName(p)}`);
        const days = Math.round((new Date(`${p.injuredUntil}T00:00:00Z`).getTime() - new Date(`${s.date}T00:00:00Z`).getTime()) / 86_400_000);
        p.injuredUntil = addDays(s.date, Math.max(1, Math.round(days * 0.6)));
        p.morale = clamp(p.morale + 5, 0, 100);
        return `${pName(p)} se vrátí do ${p.injuredUntil.split('-').reverse().join('. ')}.`;
      }
      return 'Hráč se léčí doma.';
    },
  },

  dotace: {
    weight: (s) => ([9, 10, 2, 3].includes(month(s)) ? 0.5 : 0),
    create: (s) => {
      const amount = round(3_000_000 * Math.max(0.4, scale(s)), 100_000);
      return {
        title: 'Město nabízí dotaci na mládež',
        text: 'Podmínkou je, že trenér bude dávat víc šancí mladým hráčům.',
        amount,
        defaultOption: 'odmitnout',
        options: [
          { id: 'prijmout', label: 'Přijmout dotaci', hint: `+${mil(amount)}, trenér musí hrát s mladými` },
          { id: 'odmitnout', label: 'Odmítnout', hint: 'Bez dopadu' },
        ],
      };
    },
    resolve: (s, e, o) => {
      if (o !== 'prijmout') return 'Dotace odmítnuta.';
      book(s, s.owner.clubId, 'ostatni', e.amount!, 'Dotace města na mládež');
      const coach = coachOf(s, s.owner.clubId);
      if (coach && !coach.youthFocus) {
        coach.youthFocus = true;
        trust(s, 'trener', -2);
      }
      return 'Dotace přijata, trenér dá víc prostoru mladým.';
    },
  },

  odchod: {
    weight: (s) => (squad(s).some((p) => p.morale < 25 && keyPlayers(s).includes(p)) ? 2 : 0),
    create: (s) => {
      const p = keyPlayers(s).find((x) => x.morale < 25);
      if (!p) return null;
      return {
        title: `${pName(p)} chce odejít`,
        text: `V sezóně odehrál ${p.apps} ${p.apps === 1 ? 'zápas' : p.apps >= 2 && p.apps <= 4 ? 'zápasy' : 'zápasů'} a jeho nálada spadla na ${Math.round(p.morale)} ze 100. Agent tlačí na přestup.`,
        playerId: p.id,
        defaultOption: 'nic',
        options: [
          { id: 'slib', label: 'Slíbit mu víc minut', hint: 'Jeho morálka +20, důvěra trenéra −4' },
          { id: 'prodej', label: 'Nabídnout ho k prodeji', hint: 'Zařadí se na seznam k prodeji' },
          { id: 'nic', label: 'Nic nedělat', hint: 'Jeho morálka −5, morálka týmu −2' },
        ],
      };
    },
    resolve: (s, e, o) => {
      const p = s.players[e.playerId!];
      if (!p || p.clubId !== s.owner.clubId) return 'Hráč už v klubu není.';
      if (o === 'slib') {
        p.morale = clamp(p.morale + 20, 0, 100);
        trust(s, 'trener', -4);
        return `${pName(p)} dostane víc šancí. Trenér si do sestavy nerad nechá mluvit.`;
      }
      if (o === 'prodej') {
        if (!s.market.listed.includes(p.id)) s.market.listed.push(p.id);
        return `${pName(p)} je na seznamu k prodeji.`;
      }
      p.morale = clamp(p.morale - 5, 0, 100);
      teamMorale(s, -2);
      return 'Situace zůstává napjatá.';
    },
  },

  travnik: {
    weight: (s) => ([11, 12, 2, 3].includes(month(s)) && !ownClub(s).pitchDamagedUntil ? 0.7 : 0),
    create: (s) => {
      const amount = round(1_200_000 * Math.max(0.4, costScale(s)), 50_000);
      return {
        title: 'Mráz poškodil trávník',
        text: 'Bez opravy se bude hrát na nerovném povrchu: víc zranění a menší zájem diváků.',
        amount,
        defaultOption: 'pockat',
        options: [
          { id: 'opravit', label: 'Opravit hned', hint: `−${mil(amount)}` },
          { id: 'pockat', label: 'Počkat na jaro', hint: 'Šest týdnů o 10 % méně diváků a víc zranění doma' },
        ],
      };
    },
    resolve: (s, e, o) => {
      if (o === 'opravit') {
        pay(s, e.amount!, 'Oprava trávníku');
        return 'Trávník je opravený.';
      }
      ownClub(s).pitchDamagedUntil = addDays(s.date, 42);
      return 'Trávník se opraví až na jaře.';
    },
  },

  asistent: {
    // R1: jen když tým ztrácí body (3+ zápasy bez výhry), text cituje bilanci.
    weight: (s) => (coachOf(s, s.owner.clubId) && seasonFacts(s).winless >= 3 ? 0.8 : 0),
    create: (s) => {
      const amount = round(1_000_000 * Math.max(0.4, costScale(s)), 50_000);
      const f = seasonFacts(s);
      return {
        title: 'Trenér chce dalšího asistenta',
        text: `Tým je ${matchesWord(f.winless)} bez výhry (skóre posledních tří ${f.last3.gf}:${f.last3.ga}). Specialista na standardní situace by podle trenéra přinesl body navíc.`,
        amount,
        defaultOption: 'odmitnout',
        options: [
          { id: 'najmout', label: 'Najmout asistenta', hint: `−${mil(amount)} (smlouva na rok), schopnosti trenéra +2, důvěra trenéra +4` },
          { id: 'odmitnout', label: 'Odmítnout', hint: 'Důvěra trenéra −4' },
        ],
      };
    },
    resolve: (s, e, o) => {
      const coach = coachOf(s, s.owner.clubId);
      if (o === 'najmout' && coach) {
        book(s, s.owner.clubId, 'vedeni', -e.amount!, 'Asistent trenéra (roční smlouva)');
        coach.ability = Math.min(95, coach.ability + 2);
        trust(s, 'trener', 4);
        return 'Asistent nastoupil.';
      }
      trust(s, 'trener', -4);
      return 'Trenér zůstává bez dalšího asistenta.';
    },
  },

  // ---------- Šedá zóna: na hraně etiky ----------

  'obrazova-prava': {
    weight: (s) => (!s.grey.taxSchemeUntil ? 0.35 : 0),
    create: (s) => {
      const wages = squad(s).reduce((a, p) => a + p.wage, 0);
      return {
        title: 'Daňový poradce: platy hvězd jako obrazová práva',
        text: 'Část platů nejlepších hráčů by šla přes jejich firmy jako licence k obrazovým právům. Je to legální konstrukce, ale finanční úřad i novináři ji v Česku nemají rádi.',
        amount: Math.round(wages * 0.1),
        defaultOption: 'odmitnout',
        options: [
          { id: 'ano', label: 'Na rok to zavést', hint: `Úspora asi ${fmt(wages * 0.1)} měsíčně; při odhalení doměrek s penále a mediální kauza` },
          { id: 'odmitnout', label: 'Zůstat u běžných smluv', hint: 'Nic se nestane' },
        ],
      };
    },
    resolve: (s, e, o) => {
      if (o !== 'ano') return 'Smlouvy zůstávají standardní.';
      s.grey.taxSchemeUntil = addDays(s.date, 365);
      greyAction(s, { label: 'Platy přes obrazová práva', severity: 10, gain: (e.amount ?? 0) * 12 }, 8);
      return 'Od příštího měsíce jde část platů přes firmy hráčů.';
    },
  },

  tapping: {
    weight: (s) => ([5, 6, 11, 12].includes(month(s)) && tappingTarget(s) ? 0.5 : 0),
    create: (s) => {
      const p = tappingTarget(s);
      if (!p) return null;
      return {
        title: `Agent naznačuje: ${pName(p)} by k vám šel`,
        text: `Hráč ${s.clubs[p.clubId].shortName} (hodnocení ${p.overall}) by se s vámi rád sešel ještě před oknem. Neoficiální schůzka je proti pravidlům, ale dělá se to.`,
        playerId: p.id,
        defaultOption: 'odmitnout',
        options: [
          { id: 'schuzka', label: 'Sejít se potají', hint: 'V příštím okně ho jeho klub pustí asi o čtvrtinu levněji; při odhalení pokuta a vztahy se svazem' },
          { id: 'odmitnout', label: 'Počkat na oficiální cestu', hint: 'Nic se nestane' },
        ],
      };
    },
    resolve: (s, e, o) => {
      const p = s.players[e.playerId!];
      if (o !== 'schuzka' || !p) return 'Agent dostal odpověď, že se ozvete v okně.';
      s.grey.tapped = [...(s.grey.tapped ?? []), p.id];
      greyAction(s, { label: `Neoficiální jednání s hráčem: ${pName(p)}`, severity: 8 }, 10);
      return `${pName(p)} o přestup stojí. Najdete ho v Přestupech.`;
    },
  },

  'spriznena-firma': {
    weight: () => 0.3,
    create: (s) => {
      const amount = round(annualCosts(ownClub(s), tierOf(s, s.owner.clubId)) * 0.02, 100_000);
      const partners = s.shareholders.length > 0;
      return {
        title: 'Zakázka pro vaši vlastní firmu',
        text: `Údržbu stadionu a areálu by mohla na dva roky dělat vaše stavební firma za ${mil(amount)}, o něco dráž než konkurence.${partners ? ' Spolumajitelé o tom nemusí vědět.' : ''}`,
        amount,
        defaultOption: 'tendr',
        options: [
          { id: 'ano', label: 'Zadat zakázku své firmě', hint: `Klub zaplatí ${mil(amount)}, vám zůstane asi ${mil(amount * 0.4)}${partners ? '; při odhalení se spolumajitelé rozzuří' : ''}` },
          { id: 'tendr', label: 'Vypsat řádný tendr', hint: 'Nic se nestane' },
        ],
      };
    },
    resolve: (s, e, o) => {
      if (o !== 'ano') return 'Zakázku dostala firma z tendru.';
      book(s, s.owner.clubId, 'provoz', -e.amount!, 'Údržba stadionu a areálu');
      s.owner.wallet += Math.round(e.amount! * 0.4);
      greyAction(s, { label: 'Zakázka pro firmu majitele', severity: 10, minority: s.shareholders.length > 0 }, 10);
      return 'Smlouva podepsána.';
    },
  },

  'kontroverzni-sponzor': {
    weight: (s) => ([7, 8, 1, 2].includes(month(s)) ? 0.35 : 0),
    create: (s) => {
      const amount = round(annualCosts(ownClub(s), tierOf(s, s.owner.clubId)) * 0.05, 100_000);
      return {
        title: 'Štědrá kryptoměnová platforma chce na dresy',
        text: `Nabízí ${mil(amount)} na sezónu. Nikdo pořádně neví, kdo za ní stojí, a fanoušci už na sítích protestují.`,
        amount,
        defaultOption: 'odmitnout',
        options: [
          { id: 'ano', label: 'Vzít peníze', hint: `+${mil(amount)}, fanoušci −4; když platforma padne, peníze se budou vracet` },
          { id: 'odmitnout', label: 'Odmítnout', hint: 'Fanoušci +1' },
        ],
      };
    },
    resolve: (s, e, o) => {
      if (o !== 'ano') {
        fans(s, 1);
        return 'Klub nabídku odmítl.';
      }
      book(s, s.owner.clubId, 'komercni', e.amount!, 'Sponzor: kryptoměnová platforma');
      fans(s, -4);
      greyAction(s, { label: 'Sponzor s pochybným původem peněz', severity: 8, gain: e.amount }, 10);
      return 'Logo platformy je na rukávu dresů.';
    },
  },

  navstevnost: {
    weight: (s) => ([9, 10, 3, 4].includes(month(s)) ? 0.3 : 0),
    create: (s) => {
      const amount = round(annualCosts(ownClub(s), tierOf(s, s.owner.clubId)) * 0.015, 50_000);
      return {
        title: 'Obchodní oddělení chce „zaokrouhlit“ návštěvnost',
        text: `Sponzoři platí bonus podle počtu diváků. Kdyby se do čísel počítali i držitelé permanentek, kteří nepřišli, klub dostane o ${mil(amount)} víc.`,
        amount,
        defaultOption: 'odmitnout',
        options: [
          { id: 'ano', label: 'Vykazovat vyšší čísla', hint: `+${mil(amount)}; při odhalení vratka s penále` },
          { id: 'odmitnout', label: 'Vykazovat skutečnost', hint: 'Nic se nestane' },
        ],
      };
    },
    resolve: (s, e, o) => {
      if (o !== 'ano') return 'Čísla zůstávají přesná.';
      book(s, s.owner.clubId, 'komercni', e.amount!, 'Bonus sponzorů za návštěvnost');
      greyAction(s, { label: 'Nadsazená návštěvnost pro sponzory', severity: 6, gain: e.amount }, 8);
      return 'Sponzoři zaplatili vyšší bonus.';
    },
  },

  'mladez-odkup': {
    weight: (s) => ([3, 4, 5, 6].includes(month(s)) ? 0.35 : 0),
    create: (s, rng) => {
      const club = ownClub(s);
      const position = rng.pick(['DF', 'MF', 'FW'] as Position[]);
      const p = generatePlayer(rng, s, { clubId: '', position, season: s.season, quality: squadQualityForReputation(club.reputation) - 3, age: 16 });
      p.potential = Math.min(95, p.potential + 12);
      p.wage = round(12_000 * (club.reputation / 60), 1_000);
      s.players[p.id] = p;
      const fee = round(1_000_000 * Math.max(0.5, costScale(s)), 100_000);
      return {
        title: `Talent z malého klubu: ${pName(p)}`,
        text: `Šestnáctiletý talent (potenciál kolem ${p.potential}) z vesnického oddílu. Jeho klub chce výchovné ${mil(fee)}. Agent tvrdí, že když hráč nejdřív „přestoupí“ jako amatér přes spřátelený klub, výchovné se platit nemusí.`,
        playerId: p.id,
        amount: fee,
        defaultOption: 'nechat',
        options: [
          { id: 'zaplatit', label: 'Zaplatit výchovné', hint: `−${mil(fee)}, hráč přijde do kádru` },
          { id: 'obejit', label: 'Obejít výchovné přes jiný klub', hint: 'Hráč přijde zadarmo; při odhalení pokuta a odečet 3 bodů' },
          { id: 'nechat', label: 'Nechat ho být', hint: 'Půjde jinam' },
        ],
      };
    },
    resolve: (s, e, o) => {
      const p = s.players[e.playerId!];
      if (!p) return 'Hráč už není k dispozici.';
      if (o === 'nechat') {
        delete s.players[p.id];
        return `${pName(p)} odešel jinam.`;
      }
      if (o === 'zaplatit') pay(s, e.amount!, `Výchovné: ${pName(p)}`);
      else greyAction(s, { label: 'Obcházení výchovného za talent', severity: 12, points: 3, gain: e.amount }, 12);
      p.clubId = s.owner.clubId;
      p.contractUntil = s.season + 3;
      p.morale = 80;
      return `${pName(p)} je hráčem klubu.`;
    },
  },

  lobbing: {
    weight: (s) => ([9, 10, 4, 5].includes(month(s)) ? 0.3 : 0),
    create: (s) => {
      const amount = round(annualCosts(ownClub(s), tierOf(s, s.owner.clubId)) * 0.008, 50_000);
      return {
        title: 'Starosta shání peníze na kampaň',
        text: `Dar ${mil(amount)} z peněz klubu je legální. Starosta naznačil, že pak se „najde“ trojnásobek v rozpočtu města na sportoviště.`,
        amount,
        defaultOption: 'odmitnout',
        options: [
          { id: 'ano', label: 'Přispět na kampaň', hint: `−${mil(amount)}, od města asi +${mil(amount * 3)}, město spokojenější; střet zájmů může vyjít najevo` },
          { id: 'odmitnout', label: 'Do politiky se nemíchat', hint: 'Nic se nestane' },
        ],
      };
    },
    resolve: (s, e, o) => {
      if (o !== 'ano') return 'Klub zůstává politicky neutrální.';
      pay(s, e.amount!, 'Dar na volební kampaň');
      book(s, s.owner.clubId, 'ostatni', e.amount! * 3, 'Příspěvek města na sportoviště');
      satisfy(s, 10, ['mesto']);
      greyAction(s, { label: 'Dar starostovi a dotace pro klub', severity: 8, gain: e.amount! * 3 }, 10);
      return 'Rada města schválila příspěvek na sportoviště.';
    },
  },

  // ---------- Další rozhodnutí majitele ----------

  'trener-nabidka': {
    weight: (s) => {
      const c = coachOf(s, s.owner.clubId);
      return c && c.ability >= 58 && s.owner.trust.trener >= 40 ? 0.3 : 0;
    },
    create: (s) => {
      const c = coachOf(s, s.owner.clubId)!;
      return {
        title: `Trenér ${c.firstName} ${c.lastName}: zájem jiného klubu`,
        text: 'Přišla nabídka z ciziny. Trenér by zůstal, kdyby dostal lepší smlouvu.',
        amount: c.wage,
        defaultOption: 'odmitnout',
        options: [
          { id: 'pridat', label: 'Přidat mu 25 %', hint: `Plat ${fmt(c.wage * 1.25)} měsíčně, důvěra trenéra +6` },
          { id: 'pustit', label: 'Pustit ho za odstupné', hint: `Klub dostane ${mil(c.wage * 8)}, ale musíte najít nového trenéra` },
          { id: 'odmitnout', label: 'Trvat na smlouvě', hint: 'Zůstane, důvěra trenéra −10' },
        ],
      };
    },
    resolve: (s, _e, o) => {
      const c = coachOf(s, s.owner.clubId);
      if (!c) return 'Trenér už v klubu není.';
      if (o === 'pridat') {
        c.wage = Math.round((c.wage * 1.25) / 1000) * 1000;
        trust(s, 'trener', 6);
        return 'Trenér podepsal lepší smlouvu a zůstává.';
      }
      if (o === 'pustit') {
        book(s, s.owner.clubId, 'ostatni', c.wage * 8, `Odstupné za trenéra: ${c.firstName} ${c.lastName}`);
        delete s.staff[c.id];
        ownClub(s).staff.coachId = '';
        return 'Trenér odešel. Tým zatím vede asistent, najděte nového ve Vedení.';
      }
      trust(s, 'trener', -10);
      return 'Trenér zůstává, ale nadšený není.';
    },
  },

  charita: {
    weight: () => 0.2,
    create: (s) => {
      const amount = round(annualCosts(ownClub(s), tierOf(s, s.owner.clubId)) * 0.005, 50_000);
      return {
        title: 'Benefiční zápas pro dětskou nemocnici',
        text: `Hráči by v týdnu odehráli exhibici a klub by přidal ${mil(amount)}. Trenér se bojí o kondici hráčů.`,
        amount,
        defaultOption: 'ne',
        options: [
          { id: 'ano', label: 'Uspořádat zápas a přispět', hint: `−${mil(amount)}, fanoušci +5, média +5, město spokojenější, kondice hráčů −10` },
          { id: 'penize', label: 'Jen poslat peníze', hint: `−${mil(amount)}, média +2` },
          { id: 'ne', label: 'Odmítnout', hint: 'Média −2' },
        ],
      };
    },
    resolve: (s, e, o) => {
      if (o === 'ano') {
        pay(s, e.amount!, 'Benefiční zápas');
        fans(s, 5);
        media(s, 5);
        satisfy(s, 4, ['mesto', 'patriot']);
        for (const p of squad(s)) p.fitness = Math.max(60, p.fitness - 10);
        return 'Zápas vyprodal stadion a nemocnice dostala šek.';
      }
      if (o === 'penize') {
        pay(s, e.amount!, 'Dar dětské nemocnici');
        media(s, 2);
        return 'Klub poslal dar.';
      }
      media(s, -2);
      return 'Klub se akce nezúčastní.';
    },
  },

  vyjezd: {
    weight: (s) => ([8, 9, 10, 3, 4, 5].includes(month(s)) ? 0.4 : 0),
    create: (s) => {
      const amount = round(200_000 * Math.max(0.4, costScale(s)), 10_000);
      return {
        title: 'Fanklub chce dotovat autobusy na derby',
        text: `Na venkovní derby by jelo pět autobusů fanoušků, kdyby klub přispěl ${mil(amount)}.`,
        amount,
        defaultOption: 'ne',
        options: [
          { id: 'ano', label: 'Zaplatit autobusy', hint: `−${mil(amount)}, fanoušci +4, morálka týmu +2` },
          { id: 'ne', label: 'Ať si to zaplatí sami', hint: 'Fanoušci −2' },
        ],
      };
    },
    resolve: (s, e, o) => {
      if (o === 'ano') {
        pay(s, e.amount!, 'Dotace výjezdu fanoušků');
        fans(s, 4);
        teamMorale(s, 2);
        return 'Kotel na derby byl slyšet až do kabin.';
      }
      fans(s, -2);
      return 'Na derby jela jen hrstka fanoušků.';
    },
  },

  'investor-nabidka': {
    weight: (s) => (s.owner.share >= 0.4 && !s.owner.ousted ? 0.2 : 0),
    create: (s) => {
      const part = 0.2;
      const price = Math.round((clubValuation(s) * part * 1.15) / 100_000) * 100_000;
      return {
        title: 'Zahraniční investor chce koupit 20 % klubu',
        text: `Nabízí ${mil(price)}, o 15 % víc, než je tržní cena. Stal by se spolumajitelem a chtěl by dividendy.`,
        amount: price,
        defaultOption: 'odmitnout',
        options: [
          { id: 'prodat', label: 'Prodat 20 %', hint: `+${mil(price)} do vašich osobních peněz, váš podíl klesne na ${Math.round((s.owner.share - part) * 100)} %` },
          { id: 'odmitnout', label: 'Odmítnout', hint: 'Nic se nestane' },
        ],
      };
    },
    resolve: (s, e, o) => {
      if (o !== 'prodat' || s.owner.share < 0.4) return 'Investor odešel.';
      s.owner.wallet += e.amount!;
      s.owner.share = Math.round((s.owner.share - 0.2) * 1000) / 1000;
      s.shareholders.push({ id: `a${++s.nextId}`, name: 'Emirates Sport Holding', kind: 'investor', share: 0.2, satisfaction: 60 });
      return `Prodáno. Váš podíl je ${Math.round(s.owner.share * 100)} %.`;
    },
  },

  'svaz-bezpecnost': {
    weight: (s) => (tierOf(s, s.owner.clubId) <= 2 ? 0.3 : 0),
    create: (s) => {
      const amount = round(annualCosts(ownClub(s), tierOf(s, s.owner.clubId)) * 0.012, 50_000);
      return {
        title: 'Svaz žádá modernizaci kamerového systému',
        text: `Po incidentech na stadionech chce svaz lepší kamery a turnikety. Stálo by to ${mil(amount)}. Termín je zatím doporučený, ne povinný.`,
        amount,
        defaultOption: 'odlozit',
        options: [
          { id: 'ano', label: 'Investovat hned', hint: `−${mil(amount)}, pověst u svazu +8` },
          { id: 'odlozit', label: 'Odložit', hint: 'Pověst u svazu −6' },
        ],
      };
    },
    resolve: (s, e, o) => {
      if (o === 'ano') {
        book(s, s.owner.clubId, 'investice', -e.amount!, 'Kamerový systém a turnikety');
        league(s, 8);
        return 'Svaz modernizaci ocenil.';
      }
      league(s, -6);
      return 'Svaz si poznamenal, že klub nespěchá.';
    },
  },

  // ---------- Média a pověst ----------

  'novinar-investigace': {
    weight: (s) => (s.grey.exposure > 30 && s.grey.actions.some((a) => !a.discovered) ? 1.5 + s.grey.exposure / 25 : 0),
    create: (s) => {
      const amount = round(1_000_000 * costScale(s));
      return {
        title: 'Investigativní novinář se vyptává',
        text: 'Ptá se na podivné platby a poradenské smlouvy klubu. Zatím nic nepublikoval.',
        amount,
        defaultOption: 'ignorovat',
        options: [
          { id: 'pr', label: 'Najmout PR agenturu', hint: `−${mil(amount)}, riziko odhalení výrazně klesne` },
          { id: 'pravnici', label: 'Pohrozit žalobou', hint: `−${mil(amount * 0.5)}, riziko trochu klesne, média −8` },
          { id: 'ignorovat', label: 'Ignorovat ho', hint: 'Riziko odhalení vzroste' },
        ],
      };
    },
    resolve: (s, e, o) => {
      if (o === 'pr') {
        pay(s, e.amount!, 'PR agentura');
        s.grey.exposure = clamp(s.grey.exposure - 15, 0, 100);
        return 'Agentura dodala novináři jiné téma.';
      }
      if (o === 'pravnici') {
        pay(s, e.amount! * 0.5, 'Právní služby');
        s.grey.exposure = clamp(s.grey.exposure - 8, 0, 100);
        media(s, -8);
        return 'Novinář couvl, ale redakce si to pamatuje.';
      }
      s.grey.exposure = clamp(s.grey.exposure + 8, 0, 100);
      return 'Novinář pátrá dál.';
    },
  },

  tiskovka: {
    // R1: nahrazeno příběhem krize (stories.ts), situací sit-bez-vyhry a tiskovkou po zápase (R3).
    weight: () => 0,
    create: () => ({
      title: 'Novináři chtějí slyšet, co bude dál',
      text: 'Tři prohry v řadě. Na tiskové konferenci padne otázka, jestli trenér přežije.',
      defaultOption: 'mlceti',
      options: [
        { id: 'podpora', label: 'Veřejně podpořit trenéra', hint: 'Důvěra trenéra +6, média −2, fanoušci −2' },
        { id: 'ultimatum', label: 'Dát trenérovi ultimátum', hint: 'Důvěra trenéra −8, média +5, fanoušci +3' },
        { id: 'mlceti', label: 'Nekomentovat', hint: 'Média −5' },
      ],
    }),
    resolve: (s, _e, o) => {
      if (o === 'podpora') {
        trust(s, 'trener', 6);
        media(s, -2);
        fans(s, -2);
        return 'Trenér ví, že za ním stojíte.';
      }
      if (o === 'ultimatum') {
        trust(s, 'trener', -8);
        media(s, 5);
        fans(s, 3);
        return 'Titulky píšou o tvrdém majiteli. Trenér je pod tlakem.';
      }
      media(s, -5);
      return 'Novináři si odpověď domysleli sami.';
    },
  },

  rozhovor: {
    weight: () => 0.25,
    create: (s) => ({
      title: 'Sportovní deník chce velký rozhovor',
      text: (() => {
        const f = seasonFacts(s);
        return `Dvoustrana o vašich plánech s klubem${f.position ? ` – tým je na ${f.position}. místě s ${f.points ?? 0} body, forma ${f.form.slice(-5).join(' ') || '–'}` : ''}. Jak budete mluvit?`;
      })(),
      defaultOption: 'odmitnout',
      options: [
        { id: 'ambice', label: 'Mluvit o velkých ambicích', hint: 'Média +6, fanoušci +4, patrioti spokojenější, důvěra trenéra −3 (tlak)' },
        { id: 'skromne', label: 'Mluvit skromně a věcně', hint: 'Média +3' },
        { id: 'odmitnout', label: 'Odmítnout', hint: 'Média −4' },
      ],
    }),
    resolve: (s, _e, o) => {
      if (o === 'ambice') {
        media(s, 6);
        fans(s, 4);
        satisfy(s, 4, ['patriot', 'mesto']);
        trust(s, 'trener', -3);
        return 'Rozhovor vzbudil pozornost. Teď se čekají výsledky.';
      }
      if (o === 'skromne') {
        media(s, 3);
        return 'Věcný rozhovor působil dobře.';
      }
      media(s, -4);
      return 'Deník napsal, že majitel komunikaci s veřejností nezvládá.';
    },
  },

  'kauza-hrac': {
    // R1: vyřazeno – bulvár o soukromí skutečného hráče (soukromí; anonymní kauzy řeší engine/social.ts).
    weight: () => 0,
    create: (s, rng) => {
      const p = rng.pick(keyPlayers(s));
      if (!p) return null;
      return {
        title: `Bulvár rozebírá soukromí: ${pName(p)}`,
        text: 'Fotky a spekulace o jeho soukromém životě jsou na titulních stranách.',
        playerId: p.id,
        defaultOption: 'mlcet',
        options: [
          { id: 'chranit', label: 'Postavit se za hráče', hint: 'Jeho morálka +10, morálka týmu +2, média −5' },
          { id: 'distancovat', label: 'Distancovat se', hint: 'Média +4, jeho morálka −15' },
          { id: 'mlcet', label: 'Nekomentovat', hint: 'Média −2' },
        ],
      };
    },
    resolve: (s, e, o) => {
      const p = s.players[e.playerId!];
      if (o === 'chranit') {
        if (p) p.morale = clamp(p.morale + 10, 0, 100);
        teamMorale(s, 2);
        media(s, -5);
        return 'Kabina ocenila, že klub drží při svých.';
      }
      if (o === 'distancovat') {
        if (p) p.morale = clamp(p.morale - 15, 0, 100);
        media(s, 4);
        return 'Klub se od hráče veřejně distancoval.';
      }
      media(s, -2);
      return 'Kauza po pár dnech utichla.';
    },
  },

  'svaz-spor': {
    // R1: nahrazeno situací sit-verdikt (vzniká jen ze skutečného sporného momentu zápasu, bigMatch.moments).
    weight: () => 0,
    create: (s) => ({
      title: 'Sporný verdikt rozhodčího',
      text: 'V posledním zápase vám nebyl uznán gól a fanoušci zuří. Novináři čekají na vaši reakci.',
      amount: Math.round(150_000 * Math.max(0.3, scale(s))),
      defaultOption: 'nic',
      options: [
        { id: 'kritika', label: 'Ostře kritizovat svaz', hint: `Fanoušci +6, média +2, pověst u svazu −15, pokuta asi ${fmt(150_000 * Math.max(0.3, scale(s)) * fineFactor(s))}` },
        { id: 'stiznost', label: 'Podat oficiální stížnost', hint: 'Fanoušci +2, pověst u svazu −3' },
        { id: 'nic', label: 'Nechat to být', hint: 'Fanoušci −2, pověst u svazu +2' },
      ],
    }),
    resolve: (s, _e, o) => {
      if (o === 'kritika') {
        fans(s, 6);
        media(s, 2);
        league(s, -15);
        const amount = fine(s, 150_000, 'Pokuta za kritiku rozhodčích');
        return `Fanoušci tleskají, disciplinárka vyměřila pokutu ${fmt(amount)}.`;
      }
      if (o === 'stiznost') {
        fans(s, 2);
        league(s, -3);
        return 'Komise rozhodčích stížnost projedná.';
      }
      fans(s, -2);
      league(s, 2);
      return 'Klub se ke sporné situaci nevyjadřoval.';
    },
  },

  // ---------- Krize ----------

  krize: {
    weight: () => 0,
    create: (s) => {
      const club = ownClub(s);
      const limit = club.policy.overdraft ? Math.round((annualCosts(club, tierOf(s, club.id)) * 0.1) / 1_000_000) * 1_000_000 : 0;
      const amount = round(Math.max(0, -club.finance.balance - limit) + annualCosts(club, tierOf(s, club.id)) * 0.05, 100_000);
      const sale = crisisSale(s, amount);
      return {
        title: 'Krizový plán: klub nemá na závazky',
        text: `Účet je druhý měsíc v minusu. Když se to nezlepší, po čtvrtém měsíci přijde insolvence. Na stabilizaci je potřeba asi ${mil(amount)}.`,
        amount,
        defaultOption: 'vyprodej',
        options: [
          { id: 'vklad', label: 'Záchranný vklad majitele', hint: `−${mil(amount)} z vašich peněz (máte ${mil(s.owner.wallet)})` },
          { id: 'vyprodej', label: 'Výprodej hráčů', hint: sale.players.length ? `Odejdou jen ti, kteří pokryjí potřebnou částku, od nejlevnějších (${sale.players.map(pName).join(', ')}), za 60 % hodnoty, celkem asi ${mil(sale.total)}. Trenér ${sale.core ? '−10' : '−4'}` : 'Není koho prodat.' },
          { id: 'platy', label: 'Snížit všem platy o 20 %', hint: 'Morálka týmu −15, důvěra trenéra −10, média −5' },
        ],
      };
    },
    resolve: (s, e, o) => {
      const club = ownClub(s);
      let text: string;
      if (o === 'vklad' && s.owner.wallet >= e.amount!) {
        s.owner.wallet -= e.amount!;
        book(s, club.id, 'vklad', e.amount!, 'Záchranný vklad majitele');
        text = 'Majitel klub zachránil vkladem.';
      } else if (o === 'platy') {
        for (const p of squad(s)) p.wage = Math.max(5_000, Math.round((p.wage * 0.8) / 1000) * 1000);
        teamMorale(s, -15);
        trust(s, 'trener', -10);
        media(s, -5);
        text = 'Hráči neradi přijali snížení platů.';
      } else {
        // Prodej jen tolik hráčů (od nejlevnějších), aby se pokryla potřebná částka, za 60 % hodnoty.
        const sale = crisisSale(s, e.amount ?? 0);
        for (const p of sale.players) executeTransfer(s, p, `${FOREIGN_PREFIX}krize`, sale.fees.get(p.id)!, p.wage, 3);
        trust(s, 'trener', sale.core ? -10 : -4);
        text = sale.players.length ? `Klub v krizovém výprodeji prodal ${sale.players.length === 1 ? 'jednoho hráče' : `${sale.players.length} hráčů`} za ${mil(sale.total)} (${sale.players.map(pName).join(', ')}).` : 'Nebylo koho prodat.';
      }
      const limit = club.policy.overdraft ? Math.round((annualCosts(club, tierOf(s, club.id)) * 0.1) / 1_000_000) * 1_000_000 : 0;
      if (club.finance.balance >= -limit) {
        s.crisis = undefined;
        club.finance.monthsNegative = 0;
        text += ' Krize je zažehnána.';
      }
      return text;
    },
  },

  // ---------- Spolumajitelé ----------

  valna: {
    weight: () => 0,
    create: (s) => {
      const profit = distributableProfit(s);
      const club = ownClub(s);
      const reserve = round(Math.max(0, club.finance.balance) * 0.03);
      const partners = s.shareholders.length > 0;
      // Jediný vlastník bez zisku nemá o čem rozhodovat: situace se nevytvoří.
      if (!partners && profit <= 0) return null;
      const options =
        profit > 0
          ? [
              { id: 'nic', label: partners ? 'Bez dividendy' : 'Nechat zisk v klubu', hint: partners ? 'Zisk zůstane v klubu. Patrioti +3, investor a spekulant nespokojení' : 'Zisk zůstane v klubu.' },
              { id: 'ctvrt', label: `${partners ? 'Dividenda' : 'Vybrat'} 25 % zisku (${mil(profit * 0.25)})`, hint: `Vám ${mil(profit * 0.25 * s.owner.share)}${partners ? ', investor a spekulant spokojenější' : ''}` },
              { id: 'pul', label: `${partners ? 'Dividenda' : 'Vybrat'} 50 % zisku (${mil(profit * 0.5)})`, hint: `Vám ${mil(profit * 0.5 * s.owner.share)}${partners ? ', investor velmi spokojený, patrioti ne' : ''} · fanoušci −2, média −2` },
              reinvestOption(s, profit), // W5: dividenda vs. reinvestice
            ]
          : [
              { id: 'nic', label: 'Bez dividendy', hint: 'Klub zisk nemá. Investor a spekulant nespokojení' },
              ...(reserve > 0 ? [{ id: 'rezervy', label: `Symbolická dividenda z rezerv (${mil(reserve)})`, hint: `Vám ${mil(reserve * s.owner.share)}, investor trochu spokojenější` }] : []),
            ];
      return {
        title: partners ? 'Řádná valná hromada' : 'Rozdělení zisku za sezónu',
        text: partners
          ? `Akcionáři schvalují výsledky sezóny a rozhodují o dividendě. Zisk k rozdělení ${mil(profit)}. Pak hlasují o důvěře vedení (spokojenost ${Math.round(shareholderConfidence(s))}).`
          : `Jako jediný vlastník můžete část zisku (${mil(profit)}) vybrat do osobních peněz.`,
        amount: profit > 0 ? profit : reserve,
        defaultOption: 'nic',
        options,
      };
    },
    resolve: (s, e, o) => {
      if (o === 'reinvest') {
        // W5: reinvestice zisku místo dividendy.
        const msg = reinvestProfit(s, e.amount ?? 0);
        confidenceVote(s, 0);
        return msg;
      }
      const share = o === 'ctvrt' ? 0.25 : o === 'pul' ? 0.5 : o === 'rezervy' ? 1 : 0;
      const total = Math.round((e.amount ?? 0) * share);
      payDividend(s, total);
      noteProfit(s, o, total); // W5
      if (o === 'nic') {
        satisfy(s, -8, ['investor']);
        satisfy(s, -4, ['spekulant']);
        satisfy(s, 3, ['patriot']);
      } else {
        satisfy(s, o === 'pul' ? 14 : o === 'ctvrt' ? 8 : 4, ['investor']);
        satisfy(s, o === 'pul' ? 8 : 5, ['spekulant']);
        if (o === 'pul') satisfy(s, -3, ['patriot', 'mesto']);
      }
      confidenceVote(s, total);
      if (!s.shareholders.length) return total > 0 ? `Vybráno ${mil(total)} ze zisku do vašich osobních peněz.` : 'Zisk zůstává v klubu.';
      return total > 0 ? `Vyplaceno ${mil(total)} na dividendách, vám ${mil(total * s.owner.share)}.` : 'Dividenda se nevyplácí.';
    },
  },

  navrat: {
    weight: (s) => {
      const o = s.owner.ousted;
      if (!o || o.banUntil || addDays(o.since, 120) > s.date) return 0;
      const pos = ownPosition(s);
      const failing = pos && pos.played >= 5 && pos.position > goalTarget(s.owner.seasonGoal, pos.comp);
      return failing || ownClub(s).finance.balance < 0 || shareholderConfidence(s) >= 55 ? 50 : 0;
    },
    create: (s) => {
      const amount = round(campaignCost(s) * 5, 100_000);
      return {
        title: 'Akcionáři vás žádají o návrat',
        text: 'Představenstvu se nedaří a spolumajitelé chtějí, abyste se vrátil do vedení. Podmínkou je čerstvý kapitál do klubu.',
        amount,
        defaultOption: 'odmitnout',
        options: [
          { id: 'vratit', label: 'Vrátit se', hint: `Vložíte ${mil(amount)} z osobních peněz (máte ${mil(s.owner.wallet)})` },
          { id: 'odmitnout', label: 'Zůstat stranou', hint: 'Zůstáváte pasivním akcionářem' },
        ],
      };
    },
    resolve: (s, e, o) => {
      if (o !== 'vratit') return 'Zůstáváte stranou.';
      if (s.owner.wallet < e.amount!) return 'Na vklad nemáte dost peněz. Zůstáváte stranou.';
      s.owner.wallet -= e.amount!;
      book(s, s.owner.clubId, 'vklad', e.amount!, 'Vklad majitele při návratu do vedení');
      s.owner.ousted = undefined;
      satisfy(s, 15);
      return 'Vracíte se do vedení klubu.';
    },
  },
};

/** Krizový výprodej: od nejlevnějších hráčů (s nějakou hodnotou) jen tolik, aby se pokryla částka; kádr neklesne pod 16. */
function crisisSale(s: GameState, amount: number): { players: Player[]; fees: Map<string, number>; total: number; core: boolean } {
  const all = squad(s).filter((p) => !p.loan);
  const core = new Set([...all].sort((a, b) => b.overall - a.overall).slice(0, 5).map((p) => p.id));
  const fees = new Map<string, number>();
  const players: Player[] = [];
  let total = 0;
  for (const p of all.map((p) => ({ p, fee: Math.round((playerValueOf(s, p) * 0.6) / 100_000) * 100_000 })).filter((x) => x.fee > 0).sort((a, b) => a.fee - b.fee)) {
    if (total >= amount || all.length - players.length <= 16) break;
    players.push(p.p);
    fees.set(p.p.id, p.fee);
    total += p.fee;
  }
  // Když drobní hráči nestačí, nahradí je jeden dražší, který částku pokryje sám (méně odchodů).
  if (total < amount || players.length > 3) {
    const one = all.map((p) => ({ p, fee: Math.round((playerValueOf(s, p) * 0.6) / 100_000) * 100_000 })).filter((x) => x.fee >= amount).sort((a, b) => a.fee - b.fee)[0];
    if (one && (total < amount || players.length > 3)) return { players: [one.p], fees: new Map([[one.p.id, one.fee]]), total: one.fee, core: core.has(one.p.id) };
  }
  return { players, fees, total, core: players.some((p) => core.has(p.id)) };
}

/** Jednou týdně: možná nová situace (nejvýš tři otevřené najednou). */
export function maybeCreateEvent(state: GameState, rng: Rng): void {
  if (state.events.length >= Math.min(MAX_OPEN + 1, maxOpenEvents(state)) || state.gameOver) return;
  const open = new Set(state.events.map((e) => e.template));
  state.eventLog ??= {};
  const recent = (id: string) => {
    const last = state.eventLog![id];
    return !!last && addDays(last, COOLDOWN[id] ?? PEOPLE_COOLDOWN[id] ?? FINANCE_COOLDOWN[id] ?? ({ prevzeti: 400, 'kotel-schuzka': 90 } as Record<string, number>)[id] ?? 90) > state.date;
  };
  const weighted = Object.entries(TEMPLATES)
    .filter(([id]) => !open.has(id) && !recent(id) && (!state.owner.ousted || OUSTED_TEMPLATES.has(id)))
    .map(([id, t]) => ({ id, w: t.weight(state) }))
    .filter((x) => x.w > 0);
  const total = weighted.reduce((a, x) => a + x.w, 0);
  // Naléhavé situace (w ≥ 50) přijdou vždy, ostatní zhruba jednou za tři týdny (asi 16 za sezónu).
  const urgent = weighted.find((x) => x.w >= 50);
  // R1: týdenní limit rozhodnutí. Náhodné situace přijdou jen v týdnu bez jiného rozhodnutí (přednost mají situace z dat).
  if (!urgent && (decisionBudgetLeft(state) <= 0 || decisionsLastWeek(state) >= 1)) return;
  if (!urgent && !rng.chance(Math.min(0.4, total * 0.035 * dramaFactor(state)))) return;
  let pick = urgent?.id;
  if (!pick) {
    let r = rng.next() * total;
    for (const x of weighted) {
      r -= x.w;
      if (r <= 0) {
        pick = x.id;
        break;
      }
    }
  }
  if (!pick) return;
  createEvent(state, rng, pick);
}

/** Vytvoří konkrétní situaci (i mimo náhodný výběr, např. valnou hromadu). */
export function createEvent(state: GameState, rng: Rng, template: string, expires?: string): void {
  const body = TEMPLATES[template]?.create(state, rng);
  if (!body) return;
  state.eventLog ??= {};
  state.eventLog[template] = state.date;
  const event: GameEvent = { ...body, id: `e${++state.nextId}`, template, date: state.date, expires: expires ?? addDays(state.date, EXPIRES_DAYS) };
  // Situace bez volby (jediná možnost) není rozhodnutí: rovnou se provede a přijde jen zpráva.
  if (body.options.length === 1) {
    const message = TEMPLATES[template]!.resolve(state, event, body.options[0].id);
    addNews(state, { kind: 'info', title: body.title, text: [body.text, message].filter(Boolean).join(' '), playerId: body.playerId && state.players[body.playerId] ? body.playerId : undefined });
    return;
  }
  state.events.push(event);
}

export function resolveEvent(prev: GameState, eventId: string, optionId: string, auto = false): ActionResult {
  const event = prev.events.find((e) => e.id === eventId);
  if (!event) return { state: prev, ok: false, message: 'Situace už není aktuální.' };
  const state = structuredClone(prev);
  const result = applyResolution(state, event, optionId, auto);
  return { state, ok: true, message: result };
}

function applyResolution(state: GameState, event: GameEvent, optionId: string, auto: boolean): string {
  const message = event.storyId ? resolveStoryEvent(state, event, optionId) : TEMPLATES[event.template]?.resolve(state, event, optionId) ?? '';
  state.events = state.events.filter((e) => e.id !== event.id);
  const option = event.options.find((o) => o.id === optionId);
  addNews(state, {
    kind: 'info',
    title: `${event.title}: ${auto ? 'bez rozhodnutí platí' : 'rozhodnuto'} „${option?.label ?? optionId}“`,
    text: message,
    playerId: event.playerId && state.players[event.playerId] ? event.playerId : undefined,
  });
  return message;
}

/** Situace po termínu se vyřeší výchozí volbou. */
export function expireEvents(state: GameState): void {
  for (const e of [...state.events]) {
    if (e.expires <= state.date) applyResolution(state, e, e.defaultOption, true);
  }
}
