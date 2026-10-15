import { addDays } from './calendar';
import { annualCosts, bonusPerPoint, book, commercialMonthly, defaultTicketPrice } from './finance';
import { generatePlayer, playerAge, squadOf, squadQualityForReputation } from './players';
import type { Rng } from './rng';
import { coachOf, type ActionResult } from './staff';
import { computeTable } from './standings';
import type { Club, GameEvent, GameState, Player, Position } from './types';
import { addNews, clamp, competitionOf, tierOf } from './world';

/**
 * Situace, na které musí majitel zareagovat. Každá šablona umí událost vytvořit (pokud dává smysl)
 * a provést zvolenou odpověď. Když majitel do termínu nerozhodne, platí výchozí volba.
 */

const MAX_OPEN = 3;
/** Kolik dní musí uplynout, než se stejná situace může zopakovat. */
const COOLDOWN: Record<string, number> = { sazkovka: 330, partner: 300, soustredeni: 300, dotace: 300, asistent: 300, pyro: 75, noc: 50, serie: 40, regenerace: 150, travnik: 120, talent: 90, specialista: 45, odchod: 60, protest: 60 };
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
  state.owner.trust[role] = clamp(state.owner.trust[role] + delta, 0, 100);
}

function fans(state: GameState, delta: number): void {
  const club = ownClub(state);
  club.fanMood = clamp(club.fanMood + delta, 0, 100);
}

function pay(state: GameState, amount: number, note: string): void {
  book(state, state.owner.clubId, 'ostatni', -amount, note);
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

export const TEMPLATES: Record<string, Template> = {
  soustredeni: {
    weight: (s) => (month(s) === 12 || (month(s) === 1 && s.date.slice(8) < '10') ? 3 : 0),
    create: (s) => {
      const amount = round(1_500_000 * scale(s), 100_000);
      return {
        title: 'Trenér chce zimní soustředění v Turecku',
        text: `Dva týdny v teple, kvalitní hřiště a přípravné zápasy se silnými soupeři. Stojí to ${mil(amount)}.`,
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
    weight: (s) => (squad(s).length > 10 ? 1.2 : 0),
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
        book(s, s.owner.clubId, 'ostatni', p.wage * 0.5, `Pokuta hráči ${pName(p)}`);
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
    weight: (s) => {
      const comp = competitionOf(s, s.owner.clubId);
      if (!comp) return 0;
      const row = computeTable(comp, s).find((r) => r.clubId === s.owner.clubId);
      return row && row.form.slice(-3).join('') === 'VVV' ? 4 : 0;
    },
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
    weight: (s) => (ownClub(s).facilities.medical <= 2 ? 1 : 0.2),
    create: (s) => {
      const amount = round(2_000_000 * scale(s), 100_000);
      return {
        title: 'Hráči si stěžují na zastaralou regeneraci',
        text: 'Fyzioterapeut upozorňuje, že bez nového vybavení se hráči budou zraňovat častěji.',
        amount,
        defaultOption: 'odlozit',
        options: [
          { id: 'koupit', label: 'Koupit vybavení hned', hint: `−${mil(amount)}, úroveň regenerace +1, morálka týmu +3` },
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
    weight: (s) => (ownClub(s).sponsorDeal?.name.includes('sázk') ? 0 : 0.6),
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
      text: 'Na tribuně visí transparenty a fanklub vyzývá k bojkotu.',
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
    weight: () => 0.6,
    create: (s, rng) => {
      const amount = round(rng.int(100_000, 400_000), 10_000);
      const security = round(400_000 * scale(s), 50_000);
      return {
        title: `Disciplinární komise: pokuta ${fmt(amount)} za pyrotechniku`,
        text: 'Fanoušci odpálili světlice na posledním domácím zápase.',
        amount,
        defaultOption: 'zaplatit',
        options: [
          { id: 'zaplatit', label: 'Zaplatit pokutu', hint: `−${fmt(amount)}` },
          { id: 'bezpecnost', label: 'Zaplatit a posílit pořadatelskou službu', hint: `−${fmt(amount + security)}, nálada fanoušků −3, menší riziko dalších pokut` },
        ],
      };
    },
    resolve: (s, e, o) => {
      pay(s, e.amount!, 'Pokuta za pyrotechniku');
      if (o === 'bezpecnost') {
        pay(s, round(400_000 * scale(s), 50_000), 'Posílení pořadatelské služby');
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
      const amount = round(800_000 * Math.max(0.5, scale(s)), 50_000);
      return {
        title: `Specialista v Německu nabízí léčbu pro ${pName(p)}`,
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
        text: 'Málo hraje a jeho agent tlačí na přestup.',
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
      const amount = round(1_200_000 * Math.max(0.4, scale(s)), 50_000);
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
    weight: (s) => (coachOf(s, s.owner.clubId) ? 0.5 : 0),
    create: (s) => {
      const amount = round(1_000_000 * Math.max(0.4, scale(s)), 50_000);
      return {
        title: 'Trenér chce dalšího asistenta',
        text: 'Specialista na standardní situace by podle něj přinesl body navíc.',
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

  partner: {
    weight: (s) => (month(s) === 7 && ownClub(s).sponsorDeal?.season !== s.season ? 50 : 0),
    create: (s) => {
      const base = commercialMonthly({ ...ownClub(s), sponsorDeal: undefined }, tierOf(s, s.owner.clubId));
      const winBonus = round(base * 0.5, 10_000);
      return {
        title: 'Výběr generálního partnera na sezónu',
        text: 'Obchodní oddělení má dvě nabídky. Rozhodněte, zda chcete jistotu, nebo sázku na výsledky.',
        amount: winBonus,
        defaultOption: 'jistota',
        options: [
          { id: 'jistota', label: 'Pevná smlouva', hint: 'Komerční příjmy +8 % po celou sezónu' },
          { id: 'vykon', label: 'Smlouva s bonusy za výsledky', hint: `Komerční příjmy −10 %, ale bonus ${fmt(winBonus)} za každou ligovou výhru` },
        ],
      };
    },
    resolve: (s, e, o) => {
      const club = ownClub(s);
      club.sponsorDeal =
        o === 'vykon'
          ? { name: 'Partner s bonusy za výsledky', factor: 0.9, winBonus: e.amount!, season: s.season }
          : { name: 'Partner s pevnou smlouvou', factor: 1.08, winBonus: 0, season: s.season };
      return o === 'vykon' ? 'Smlouva s bonusy podepsána.' : 'Pevná smlouva podepsána.';
    },
  },
};

/** Jednou týdně: možná nová situace (nejvýš tři otevřené najednou). */
export function maybeCreateEvent(state: GameState, rng: Rng): void {
  if (state.events.length >= MAX_OPEN || state.gameOver) return;
  const open = new Set(state.events.map((e) => e.template));
  state.eventLog ??= {};
  const recent = (id: string) => {
    const last = state.eventLog![id];
    return !!last && addDays(last, COOLDOWN[id] ?? 90) > state.date;
  };
  const weighted = Object.entries(TEMPLATES)
    .filter(([id]) => !open.has(id) && !recent(id))
    .map(([id, t]) => ({ id, w: t.weight(state) }))
    .filter((x) => x.w > 0);
  const total = weighted.reduce((a, x) => a + x.w, 0);
  // Výběr partnera přijde vždy, ostatní situace zhruba jednou za dva týdny.
  const urgent = weighted.find((x) => x.w >= 50);
  if (!urgent && !rng.chance(Math.min(0.45, total * 0.06))) return;
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
  const body = TEMPLATES[pick].create(state, rng);
  if (!body) return;
  state.events.push({ ...body, id: `e${++state.nextId}`, template: pick, date: state.date, expires: addDays(state.date, EXPIRES_DAYS) });
  state.eventLog[pick] = state.date;
}

export function resolveEvent(prev: GameState, eventId: string, optionId: string, auto = false): ActionResult {
  const event = prev.events.find((e) => e.id === eventId);
  if (!event) return { state: prev, ok: false, message: 'Situace už není aktuální.' };
  const state = structuredClone(prev);
  const result = applyResolution(state, event, optionId, auto);
  return { state, ok: true, message: result };
}

function applyResolution(state: GameState, event: GameEvent, optionId: string, auto: boolean): string {
  const message = TEMPLATES[event.template]?.resolve(state, event, optionId) ?? '';
  state.events = state.events.filter((e) => e.id !== event.id);
  const option = event.options.find((o) => o.id === optionId);
  addNews(state, {
    kind: 'info',
    title: `${event.title}: ${auto ? 'nerozhodl jste, platí' : 'rozhodnuto'} „${option?.label ?? optionId}“`,
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
