import { addDays } from './calendar';
import { easeAdd } from './ease'; // W2 kalibrace: tlumení zisků nad ~80
import { allFixtures } from './competitions';
import { freshOwnMatch, matchesWord, seasonFacts, type OwnMatchFacts, type SeasonFacts } from './facts';
import { fine, league, media } from './grey';
import { matchStakes } from './matchday';
import { agoText, goalWord, narrativeAfterMatch, openStatements, recordStatement, type Statement } from './narrative';
import { playerAge, squadOf } from './players';
import { activePromises, addPromise, decisionBudgetLeft, weeklyDecisionLimit, windowEnd, type PromiseInput } from './situations';
import { coachOf, ownPosition, type ActionResult } from './staff';
import type { GameEvent, GameState, Player } from './types';
import { addNews, clamp, hash01 } from './world';

/**
 * Tisková konference po zápase: 2–3 otázky novinářů postavené na faktech zápasu a sezóny
 * (brzké střídání, série bez výhry, sucho střelce, červená, sporný moment, dřívější výroky, sliby).
 * Ke každé otázce 2–3 odpovědi s dopadem na média, trenéra, hráče, fanoušky a svaz. Odpověď může
 * být výrok, na který naváže engine/narrative.ts, nebo slib (engine/situations.ts addPromise).
 * Nejvýš jedna tiskovka týdně, jako jedna situace; když majitel nerozhodne, platí výchozí odpovědi.
 */

export const PRESS_TEMPLATE = 'tiskovka-zapas';
/** Nejvýš jedna tiskovka týdně; méně naléhavá (bez červené, sporného momentu, výroku) jednou za 14 dní. */
const COOLDOWN_DAYS = 7;
const CALM_COOLDOWN_DAYS = 14;
/** Stejná otázka (téma + hráč) se neopakuje dřív než za 4 týdny. */
const TOPIC_COOLDOWN_DAYS = 28;
const EXPIRES_DAYS = 3;

export interface PressEffect {
  media?: number;
  coach?: number;
  team?: number;
  fans?: number;
  league?: number;
  /** Morálka hráče, o kterém je otázka. */
  player?: number;
  /** Šance na pokutu od svazu (0–1). */
  fineRisk?: number;
}

/** Slib z tiskovky (zaregistruje se přes engine/situations.ts addPromise). */
export type PressPromise = PromiseInput;

export interface PressAnswer {
  id: string;
  label: string;
  hint: string;
  effect: PressEffect;
  /** Výrok, který si novináři zapamatují (navazující příběhy). */
  statement?: Omit<Statement, 'id' | 'date' | 'seen' | 'season'>;
  promise?: PressPromise;
  /** Uzavře dřívější výrok (např. majitel přizná, že cíl přecenil). */
  closes?: string;
}

export interface PressQuestion {
  id: string;
  /** O čem otázka je (pro přehled a testy). */
  topic: string;
  /** Kdo se ptá (vymyšlený novinář a médium). */
  asker: string;
  text: string;
  /** Fakt, ze kterého otázka vychází. */
  fact: string;
  playerId?: string;
  answers: PressAnswer[];
  defaultAnswer: string;
}

export interface PressConference {
  eventId: string;
  fixtureId: string;
  date: string;
  title: string;
  questions: PressQuestion[];
}

export interface PressRecord {
  date: string;
  title: string;
  lines: string[];
}

export interface PressState {
  current?: PressConference;
  /** Kdy padla která otázka (téma:hráč → datum), aby se novináři neptali pořád na totéž. */
  asked?: Record<string, string>;
  lastDate?: string;
  history?: PressRecord[];
}

const fullName = (p: Pick<Player, 'firstName' | 'lastName'>) => `${p.firstName} ${p.lastName}`;
const daysTo = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
/** „po 8 zápasech“ (6. pád). */
export const zapasech = (n: number) => (n === 1 ? 'jednom zápase' : n === 2 ? 'dvou zápasech' : n === 3 ? 'třech zápasech' : n === 4 ? 'čtyřech zápasech' : `${n} zápasech`);
const sign = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

const ASKERS = ['Petr Hrubý, Sport', 'Jana Malá, iSport', 'Tomáš Veselý, Deník', 'Eva Dvořáková, ČT sport', 'Martin Kos, Fotbal.cz', 'Lucie Benešová, rádio Region', 'Ondřej Šíma, Blesk'];

/** Popis dopadu odpovědi pro tlačítko („Média +1, trenér −3, …“). */
export function effectHint(e: PressEffect, playerLabel?: string, extra?: string): string {
  const parts: string[] = [];
  if (e.media) parts.push(`média ${sign(e.media)}`);
  if (e.coach) parts.push(`trenér ${sign(e.coach)}`);
  if (e.team) parts.push(`kabina ${sign(e.team)}`);
  if (e.player) parts.push(`${playerLabel ?? 'hráč'} ${sign(e.player)}`);
  if (e.fans) parts.push(`fanoušci ${sign(e.fans)}`);
  if (e.league) parts.push(`svaz ${sign(e.league)}`);
  if (e.fineRisk) parts.push(`riziko pokuty ${Math.round(e.fineRisk * 100)} %`);
  const s = parts.join(', ');
  const out = [s ? s[0].toUpperCase() + s.slice(1) : 'Bez dopadu', extra].filter(Boolean).join('. ');
  return out.endsWith('.') ? out : `${out}.`;
}

function answer(id: string, label: string, effect: PressEffect, opts: { player?: Player; statement?: PressAnswer['statement']; promise?: PressPromise; closes?: string; note?: string } = {}): PressAnswer {
  const extra = [opts.note, opts.statement ? 'Výrok si novináři zapamatují' : undefined, opts.promise ? `Slib: ${opts.promise.text} (do ${opts.promise.until.split('-').reverse().join('. ')})` : undefined].filter(Boolean).join('. ');
  return { id, label, hint: effectHint(effect, opts.player?.lastName, extra), effect, statement: opts.statement, promise: opts.promise, closes: opts.closes };
}

interface Candidate {
  priority: number;
  q: Omit<PressQuestion, 'id' | 'asker'>;
}

/** Možné otázky z fakt zápasu a sezóny, seřazené podle závažnosti. */
export function pressCandidates(state: GameState, m: OwnMatchFacts, s: SeasonFacts): Candidate[] {
  const out: Candidate[] = [];
  const P = (id?: string) => (id ? state.players[id] : undefined);
  const coach = coachOf(state, state.owner.clubId);
  const coachName = coach ? coach.lastName : 'trenér';
  const pos = ownPosition(state);
  const goal = goalWord(state);
  const score = `${m.gf}:${m.ga}`;

  // Dřívější výrok majitele, který teď neplatí.
  const said = openStatements(state).find((x) => x.source === 'majitel' && (x.kind === 'cil' || x.kind === 'ambice') && x.target && x.season === state.season);
  if (said && pos && pos.position > (said.target ?? 99) + 2 && said.seen >= 2) {
    out.push({
      priority: 9,
      q: {
        topic: 'vyrok',
        text: `${agoText(said.date, state.date)[0].toUpperCase()}${agoText(said.date, state.date).slice(1)} jste řekl: „${said.quote}“. Teď jste ${pos.position}. Platí to ještě?`,
        fact: `Výrok z ${said.date.split('-').reverse().join('. ')}, nyní ${pos.position}. místo.`,
        defaultAnswer: 'priznat',
        answers: [
          answer('trvam', 'Trvám na tom, sezóna je dlouhá', { media: -2, team: 1 }),
          answer('priznat', 'Přecenil jsem to, plán upravujeme', { media: 1, fans: -1, team: 1 }, { closes: said.id }),
        ],
      },
    });
  }

  // Červená karta.
  const red = m.reds[0];
  const rp = P(red?.playerId);
  if (red && rp) {
    out.push({
      priority: 8,
      q: {
        topic: 'cervena',
        text: `${fullName(rp)} dostal v ${red.minute}. minutě červenou kartu a tým dohrával v deseti. Jak to hodnotíte?`,
        fact: `Červená karta ${red.minute}. min (${m.scoreline}).`,
        playerId: rp.id,
        defaultAnswer: 'stojime',
        answers: [
          answer('interne', 'Hráče potrestáme interně', { player: -6, media: 1, league: 1 }, { player: rp }),
          answer('rozhodci', 'Rozhodčí to výrazně přehnal', { fans: 3, league: -4, fineRisk: 0.5 }, { statement: { source: 'majitel', origin: 'tiskovka', kind: 'stiznost', quote: 'Rozhodčí to výrazně přehnal.' } }),
          answer('stojime', 'Byla to chyba, ale stojíme za ním', { player: 4, team: 1, media: -1 }, { player: rp }),
        ],
      },
    });
  }

  // V4: neproměněná penalta v zápase bez výhry.
  const mp = m.missedPenalty;
  const mpp = P(mp?.playerId);
  if (mp && mpp && m.outcome !== 'V') {
    out.push({
      priority: 6,
      q: {
        topic: 'penalta',
        text: `${fullName(mpp)} v ${mp.minute}. minutě neproměnil penaltu${mp.saved ? ', brankář ji chytil' : ', šla mimo branku'}. Bude penalty kopat dál?`,
        fact: `Neproměněná penalta ${mp.minute}. min (${m.scoreline}).`,
        playerId: mpp.id,
        defaultAnswer: 'trener',
        answers: [
          answer('duvera', 'Má naši plnou důvěru, kopat bude dál', { player: 5, media: -1 }, { player: mpp }),
          answer('trener', 'O exekutorovi rozhodne trenér', { coach: 1 }),
        ],
      },
    });
  }

  // Sporný moment z přenosu velkého zápasu.
  const bm = state.bigMatch && state.bigMatch.date === m.date ? state.bigMatch : undefined;
  const sporny = (bm?.moments ?? []).map((x) => x.match(/(Neuznaný gól|sporném verdiktu)[^(]*\((\d+)\. min\)/)).find(Boolean);
  if (sporny) {
    const minute = sporny[2];
    out.push({
      priority: 8,
      q: {
        topic: 'sporny',
        text: `V ${minute}. minutě rozhodčí ${sporny[1] === 'Neuznaný gól' ? 'neuznal váš gól' : 'rozhodl sporně'}. Podáte stížnost komisi rozhodčích?`,
        fact: `Sporný moment v ${minute}. min (${m.scoreline}).`,
        defaultAnswer: 'klid',
        answers: [
          answer('stiznost', 'Ano, posíláme stížnost komisi rozhodčích', { fans: 3, league: -3, media: 1 }, { statement: { source: 'majitel', origin: 'tiskovka', kind: 'stiznost', quote: 'Posíláme stížnost komisi rozhodčích.' } }),
          answer('klid', 'Rozhodčí rozhodují, my to řešit nebudeme', { league: 2, fans: -2 }),
        ],
      },
    });
  }

  // Vysoká prohra.
  if (m.ga - m.gf >= 3) {
    out.push({
      priority: 7,
      q: {
        topic: 'debakl',
        text: `Po porážce ${m.scoreline}: co vzkážete fanouškům?`,
        fact: m.scoreline,
        defaultAnswer: 'omluva',
        answers: [
          answer('omluva', 'Omlouvám se fanouškům, tohle nebyl náš klub', { fans: 3, team: -2, media: 1 }),
          answer('klid', 'Jeden zápas nic nemění', { coach: 2, fans: -2 }),
          answer('ultimatum', 'Takhle to dál nejde, čekám reakci', { team: -3, coach: -4, media: 2, fans: 1 }, { statement: { source: 'majitel', origin: 'tiskovka', kind: 'ultimatum', quote: 'Takhle to dál nejde, čekám reakci.' } }),
        ],
      },
    });
  }

  // Brzké střídání.
  const es = m.earlySub;
  const ep = P(es?.playerId);
  if (es && ep && ep.clubId === state.owner.clubId) {
    out.push({
      priority: 7,
      q: {
        topic: 'stridani',
        text: `Proč šel ${fullName(ep)} ze hřiště už ve ${es.minute}. minutě?${coach ? ` Rozhodl o tom trenér ${fullName(coach)}.` : ''}`,
        fact: `Střídání ${es.minute}. min (${m.scoreline}).`,
        playerId: ep.id,
        defaultAnswer: 'trener',
        answers: [
          answer('trener', 'Je to trenérova věc, má mou podporu', { coach: 3, player: -2 }, { player: ep }),
          answer('prekvapeni', 'Taky mě to překvapilo, probereme to', { coach: -4, player: 3, media: 1 }, { player: ep }),
          answer('vykon', `${ep.lastName} musí podávat lepší výkony`, { player: -6, media: 1 }, { player: ep, statement: { source: 'majitel', origin: 'tiskovka', kind: 'kritika-hrace', playerId: ep.id, quote: `${ep.lastName} musí podávat lepší výkony.` } }),
        ],
      },
    });
  }

  // Série bez výhry.
  if (s.winless >= 3 && m.outcome !== 'V' && goal) {
    const answers = [
      answer('cil', `Cíl „${goal.label}“ platí, věřím kádru`, { team: 2, media: -1 }, { statement: { source: 'majitel', origin: 'tiskovka', kind: 'cil', quote: `Cíl „${goal.label}“ platí, věřím kádru.`, target: goal.target, label: goal.label } }),
      answer('snizit', 'Teď jde hlavně o body, cíl přehodnotíme', { fans: -2, media: 1, team: 1 }),
    ];
    if (coach && !coach.interim) {
      answers.push(
        answer('trener', `Trenér ${coachName} má mou plnou podporu`, { coach: 5, media: -1 }, {
          statement: { source: 'majitel', origin: 'tiskovka', kind: 'podpora-trenera', quote: `Trenér ${coachName} má mou plnou podporu.`, coachId: coach.id },
          promise: { kind: 'podpora-trenera', text: `Trenér ${fullName(coach)} zůstane ve funkci aspoň 6 týdnů`, metric: 'coachKept', target: 1, until: addDays(state.date, 42), staffId: coach.id, stake: 'trener', source: 'tiskovka' },
        }),
      );
    }
    out.push({
      priority: 7 + Math.min(2, s.winless - 3),
      q: {
        topic: 'serie',
        text: `Už ${matchesWord(s.winless)} bez výhry${pos ? ` a ${pos.position}. místo` : ''}. Můžete ještě mluvit o cíli „${goal.label}“?`,
        fact: `Forma: ${s.form.slice(-s.winless).join(' ')}.`,
        defaultAnswer: 'snizit',
        answers,
      },
    });
  }

  // Sucho útočníka, který hrál.
  const backed = new Set(openStatements(state).filter((x) => x.source === 'majitel' && x.playerId).map((x) => x.playerId));
  const dr = s.droughts.find((d) => d.games >= 5 && P(d.playerId) && !backed.has(d.playerId) && !m.scorers.some((x) => x.playerId === d.playerId));
  const nearWindow = daysTo(state.date, windowEnd(state.date)) <= 50;
  const dp = P(dr?.playerId);
  if (dr && dp) {
    const winEnd = windowEnd(state.date);
    out.push({
      priority: 6,
      q: {
        topic: 'sucho',
        text: `${fullName(dp)} už ${matchesWord(dr.games)} nedal gól. Je to pořád váš útočník číslo jedna?`,
        fact: `${dr.games} zápasů bez gólu, v sezóně ${dr.seasonGoals} gólů.`,
        playerId: dp.id,
        defaultAnswer: 'konkurence',
        answers: [
          answer('verim', 'Věřím mu, góly přijdou', { player: 5, media: -1 }, { player: dp, statement: { source: 'majitel', origin: 'tiskovka', kind: 'podpora-hrace', playerId: dp.id, quote: `Věřím mu, góly přijdou.`, base: dr.games } }),
          answer('konkurence', 'Konkurence v kádru je otevřená', { player: -3, coach: 1, team: 1 }, { player: dp }),
          nearWindow
            ? answer('posila', 'Hledáme posilu do útoku', { player: -6, fans: 2, media: 1 }, { player: dp, promise: { kind: 'posila', text: 'Přivést posilu do útoku do konce přestupního okna', metric: 'signing', position: 'FW', target: 1, until: winEnd, stake: 'fanousci', source: 'tiskovka' } })
            : answer('lavicka', 'Možná mu pomůže chvíle na lavičce', { player: -6, coach: -1, fans: 1, media: 1 }, { player: dp, statement: { source: 'majitel', origin: 'tiskovka', kind: 'kritika-hrace', playerId: dp.id, quote: `Možná mu pomůže chvíle na lavičce`, base: dr.games } }),
        ],
      },
    });
  }

  // Nejistý brankář.
  const kp = P(s.shakyKeeper?.playerId);
  if (kp && m.ga >= 2 && !backed.has(kp.id)) {
    out.push({
      priority: 6,
      q: {
        topic: 'brankar',
        text: `Je ${fullName(kp)} po dalším slabém zápase pořád jednička?`,
        fact: `Brankář dvakrát po sobě pod známkou 5,5; dnes ${m.ga} inkasované góly.`,
        playerId: kp.id,
        defaultAnswer: 'trener',
        answers: [
          answer('verim', `Ano, ${kp.lastName} je naše jednička`, { player: 5, media: -1 }, { player: kp, statement: { source: 'majitel', origin: 'tiskovka', kind: 'podpora-brankare', playerId: kp.id, quote: `${kp.lastName} je naše jednička.` } }),
          answer('trener', 'O brankáři rozhoduje trenér', { coach: 2, player: -1 }, { player: kp }),
          ...(nearWindow ? [answer('posila', 'Brankáře posílíme', { player: -7, fans: 1 }, { player: kp, promise: { kind: 'posila', text: 'Přivést brankáře do konce přestupního okna', metric: 'signing', position: 'GK', target: 1, until: windowEnd(state.date), stake: 'fanousci', source: 'tiskovka' } })] : []),
        ],
      },
    });
  }

  // Hattrick.
  const hp = P(m.hattrick?.playerId);
  if (hp) {
    const longDeal = hp.contractUntil >= state.season + 3;
    out.push({
      priority: 6,
      q: {
        topic: 'hattrick',
        text: longDeal ? `${fullName(hp)} dal hattrick. Je na prodej, když se ozvou kluby zvenku?` : `${fullName(hp)} dal hattrick a smlouvu má do ${hp.contractUntil}. Dostane novou?`,
        fact: `Hattrick (${m.scoreline}).`,
        playerId: hp.id,
        defaultAnswer: 'tym',
        answers: [
          longDeal
            ? answer('neprodejny', 'Je neprodejný', { player: 3, fans: 3, media: 1 }, { player: hp })
            : answer('smlouva', 'Ano, začneme jednat o prodloužení', { player: 6, fans: 2 }, { player: hp, promise: { kind: 'smlouva', text: `Prodloužit smlouvu s hráčem ${fullName(hp)}`, metric: 'contractSigned', playerId: hp.id, target: 1, until: addDays(state.date, 45), stake: 'hrac', source: 'tiskovka' } }),
          answer('tym', 'Bavme se o týmu, ne o jednotlivcích', { team: 2, player: -2 }, { player: hp }),
        ],
      },
    });
  }

  // Gól odchovance.
  const ap = P(m.academyScorer?.playerId);
  if (ap && playerAge(ap, state.season) <= 23) {
    const target = Math.max(300, Math.round((s.youthMinutes + 200) / 50) * 50);
    out.push({
      priority: 5,
      q: {
        topic: 'odchovanec',
        text: `Gól odchovance ${fullName(ap)}. Dostanou mladí víc prostoru? Za posledních 5 zápasů odehráli hráči do 21 let ${s.youthMinutes} minut.`,
        fact: `Gól odchovance, minuty mladých ${s.youthMinutes} za 5 zápasů.`,
        playerId: ap.id,
        defaultAnswer: 'pochvala',
        answers: [
          answer('slib', 'Ano, mladí dostanou víc minut', { fans: 3, coach: -2 }, { promise: { kind: 'mladi', text: `Mladí do 21 let aspoň ${target} minut v příštích 5 zápasech`, metric: 'youthMinutes', target, matches: 5, until: addDays(state.date, 42), stake: 'fanousci', source: 'tiskovka' } }),
          answer('trener', 'Sestavu určuje trenér', { coach: 2, fans: -1 }),
          answer('pochvala', 'Jsme na něj pyšní, ale nebudeme ho přechvalovat', { player: 3, media: 1 }, { player: ap }),
        ],
      },
    });
  }

  // Šňůra výher nebo vysoká výhra.
  const winStreak = s.streak.kind === 'V' ? s.streak.length : 0;
  if (winStreak >= 3 || m.gf - m.ga >= 3) {
    const higher = pos && pos.position <= 3 ? 'titul' : 'pohárové příčky';
    const target = higher === 'titul' ? 1 : 3;
    out.push({
      priority: winStreak >= 4 ? 6 : 5,
      q: {
        topic: 'serie-vyher',
        text: winStreak >= 3 ? `To je ${winStreak}. výhra v řadě${pos ? ` a ${pos.position}. místo` : ''}. Myslíte teď na ${higher}?` : `Po výhře ${m.scoreline}: myslíte teď na ${higher}?`,
        fact: winStreak >= 3 ? `${winStreak} výhry v řadě.` : m.scoreline,
        defaultAnswer: 'zem',
        answers: [
          answer('ambice', 'Ano, chceme výš', { team: 2, fans: 2, media: 1 }, { statement: { source: 'majitel', origin: 'tiskovka', kind: 'ambice', quote: `Chceme výš, myslíme na ${higher}.`, target, label: higher } }),
          answer('zem', 'Zůstáváme nohama na zemi', { coach: 2 }),
          answer('tym', 'Zásluhy patří trenérovi a hráčům', { team: 3, coach: 1 }),
        ],
      },
    });
  }

  // Otočka nebo gól v závěru.
  if (m.comeback === 'nase' || (m.lateDecider?.own && m.outcome !== 'P')) {
    const late = m.lateDecider?.own ? ` v ${m.lateDecider.minute}. minutě` : '';
    out.push({
      priority: 5,
      q: {
        topic: 'otocka',
        text: m.comeback === 'nase' ? `Otočka na ${score}${late} (${m.scoreline}). Co jste řekl hráčům?` : `Gól${late} rozhodl zápas ${m.scoreline}. Je to síla, nebo štěstí?`,
        fact: m.scoreline,
        defaultAnswer: 'charakter',
        answers: [
          answer('charakter', 'Tým ukázal charakter', { team: 3 }),
          answer('trener', 'Zásluhu má trenér a jeho střídání', { coach: 3, team: 1 }),
        ],
      },
    });
  }

  // Sliby majitele, kterým se blíží termín.
  const promise = activePromises(state).find((p) => p.until >= state.date && p.until <= addDays(state.date, 14));
  if (promise) {
    const days = Math.max(1, Math.round((new Date(`${promise.until}T00:00:00Z`).getTime() - new Date(`${state.date}T00:00:00Z`).getTime()) / 86_400_000));
    out.push({
      priority: 6,
      q: {
        topic: 'slib',
        text: `Slíbil jste: „${promise.text}“. Do termínu zbývá ${days} ${days === 1 ? 'den' : days < 5 ? 'dny' : 'dní'}. Platí to?`,
        fact: `Slib do ${promise.until.split('-').reverse().join('. ')}.`,
        defaultAnswer: 'plati',
        answers: [
          answer('plati', 'Slib platí, pracujeme na tom', { media: 1 }, { note: 'Nesplněný slib pak bolí víc' }),
          answer('odklad', 'Potřebujeme víc času', { media: -2, fans: -1 }),
        ],
      },
    });
  }

  // V4: evropský zápas – otázka z jeho dění.
  if (m.fixtureId.startsWith('eu-')) {
    const what = m.outcome === 'V' ? 'výhra' : m.outcome === 'P' ? 'prohra' : 'remíza';
    out.push({
      priority: 5,
      q: {
        topic: 'evropa',
        text: `${m.competition}: ${what} ${m.scoreline}${m.xgFor !== undefined && m.xgAgainst !== undefined ? ` při xG ${m.xgFor.toFixed(1)} : ${m.xgAgainst.toFixed(1)}` : ''}. Na co se Evropa u vás hraje?`,
        fact: `${m.competition}, ${m.scoreline}.`,
        defaultAnswer: 'krok',
        answers: [
          answer('ambice', 'Chceme jít co nejdál, Evropa je priorita', { fans: 2, media: 1, team: -1 }),
          answer('krok', 'Zápas od zápasu, liga má přednost', { team: 1 }),
        ],
      },
    });
  }

  // Velký zápas (derby, čelo, záchrana, pohár) – obecná otázka.
  const x = allFixtures(state).find((y) => y.fixture.id === m.fixtureId);
  const stakes = x ? matchStakes(state, x.fixture, x.cup) : [];
  if (stakes.length) {
    const what = m.outcome === 'V' ? 'výhra' : m.outcome === 'P' ? 'prohra' : 'remíza';
    out.push({
      priority: 4,
      q: {
        topic: 'velky-zapas',
        text: `Co pro klub znamená ${what} ${score} – ${stakes[0].label}?`,
        fact: `${stakes.map((y) => y.label).join(', ')}.`,
        defaultAnswer: 'dalsi',
        answers: [
          answer('fanousci', m.outcome === 'P' ? 'Fanouškům dlužíme odvetu' : 'Je to pro fanoušky', { fans: 2, team: m.outcome === 'P' ? -1 : 1 }),
          answer('tym', m.outcome === 'P' ? 'Hráči dnes nechali na hřišti všechno' : 'Zásluha týmu', { team: 2 }),
          answer('dalsi', 'Soustředíme se na další zápas', { coach: 1 }),
        ],
      },
    });
  }

  // Doplňková otázka o cíli sezóny (jen jako třetí otázka): když je klub výrazně nad nebo pod cílem
  // a majitel o cíli zatím nic neřekl.
  const saidGoal = openStatements(state).some((x) => x.source === 'majitel' && (x.kind === 'cil' || x.kind === 'ambice'));
  if (pos && goal && pos.played >= 5 && !saidGoal && (pos.position > goal.target || pos.position <= goal.target - 4)) {
    const above = pos.position <= goal.target - 4;
    out.push({
      priority: 1,
      q: {
        topic: 'cil',
        text: above ? `Jste ${pos.position}. po ${zapasech(pos.played)}, cíl byl „${goal.label}“. Nezvednete laťku?` : `Jste ${pos.position}. po ${zapasech(pos.played)}, cíl je „${goal.label}“. Kam to letos dotáhnete?`,
        fact: `${pos.position}. místo, cíl ${goal.label} (do ${goal.target}. místa).`,
        defaultAnswer: 'skromne',
        answers: [
          above
            ? answer('cil', 'Ano, chceme výš než jen splnit cíl', { team: 1, fans: 2, media: 1 }, { statement: { source: 'majitel', origin: 'tiskovka', kind: 'ambice', quote: 'Chceme víc než jen splnit cíl', target: Math.max(1, pos.position), label: `${pos.position}. místo a výš` } })
            : answer('cil', `Splníme cíl „${goal.label}“`, { team: 1, fans: 1 }, { statement: { source: 'majitel', origin: 'tiskovka', kind: 'cil', quote: `Splníme cíl „${goal.label}“`, target: goal.target, label: goal.label } }),
          answer('skromne', 'Jdeme zápas od zápasu', { coach: 1 }),
        ],
      },
    });
  }
  return out.sort((a, b) => b.priority - a.priority);
}

/** Vybere 2–3 otázky (jiná témata, nejvýš jedna otázka o stejném hráči). */
function pickQuestions(m: OwnMatchFacts, cands: Candidate[]): PressQuestion[] {
  const picked: Candidate[] = [];
  const players = new Set<string>();
  const topics = new Set<string>();
  for (const c of cands) {
    if (picked.length >= 3) break;
    if (topics.has(c.q.topic) || (c.q.playerId && players.has(c.q.playerId))) continue;
    if (c.priority < 3 && picked.length < 2 && picked.length > 0 && cands.filter((x) => x.priority >= 3).length > picked.length) continue;
    picked.push(c);
    topics.add(c.q.topic);
    if (c.q.playerId) players.add(c.q.playerId);
  }
  const start = Math.floor(((m.fixtureId.length * 7 + m.gf * 3 + m.ga) % ASKERS.length));
  return picked.map((c, i) => ({ ...c.q, id: `q${i + 1}`, asker: ASKERS[(start + i * 2) % ASKERS.length] }));
}

/** Je zápas dost výrazný na tiskovku? Vrací otázky, nebo nic. */
export function pressQuestionsFor(state: GameState, m: OwnMatchFacts): PressQuestion[] {
  const asked = state.press?.asked ?? {};
  const cands = pressCandidates(state, m, seasonFacts(state)).filter((c) => {
    const last = asked[`${c.q.topic}:${c.q.playerId ?? ''}`];
    return !last || addDays(last, TOPIC_COOLDOWN_DAYS) <= state.date;
  });
  const top = cands[0]?.priority ?? 0;
  const big = cands.some((c) => c.q.topic === 'velky-zapas');
  if (top < 6 && !(big && top >= 4)) return [];
  const qs = pickQuestions(m, cands);
  return qs.length >= 2 ? qs : [];
}

export function pressState(state: GameState): PressState {
  state.press ??= {};
  return state.press;
}

/**
 * Denně po odehrání zápasů: navazující příběhy a případná tisková konference k dnešnímu zápasu
 * klubu majitele (nejvýš jedna za týden).
 */
export function dailyPress(state: GameState): void {
  if (state.gameOver) return;
  const m = freshOwnMatch(state, 0);
  if (!m || m.date !== state.date) return;
  if (state.narrative?.lastFixture === m.fixtureId) return;
  narrativeAfterMatch(state, m);
  maybePressConference(state, m);
}

export function maybePressConference(state: GameState, m: OwnMatchFacts): PressConference | undefined {
  if (state.owner.ousted || state.events.some((e) => e.template === PRESS_TEMPLATE)) return undefined;
  const ps = pressState(state);
  const last = ps.lastDate ?? state.eventLog?.[PRESS_TEMPLATE];
  if (last && addDays(last, COOLDOWN_DAYS) > state.date) return undefined;
  const questions = pressQuestionsFor(state, m);
  if (!questions.length) return undefined;
  const urgent = questions.some((q) => q.topic === 'vyrok' || q.topic === 'cervena' || q.topic === 'sporny');
  if (!urgent && last && addDays(last, CALM_COOLDOWN_DAYS) > state.date) return undefined;
  // Týdenní limit rozhodnutí (engine/situations.ts): tiskovka je jedno rozhodnutí. Méně naléhavá
  // tiskovka jen v týdnu, kdy ještě žádné jiné rozhodnutí nebylo.
  const left = decisionBudgetLeft(state);
  if (left < 1 || (questions.every((q) => q.topic !== 'vyrok' && q.topic !== 'cervena' && q.topic !== 'sporny' && q.topic !== 'serie') && left < weeklyDecisionLimit(state))) return undefined;
  const verdict = m.outcome === 'V' ? 'výhře' : m.outcome === 'P' ? 'prohře' : 'remíze';
  const event: GameEvent = {
    id: `e${++state.nextId}`,
    template: PRESS_TEMPLATE,
    date: state.date,
    expires: addDays(state.date, EXPIRES_DAYS),
    title: `Tisková konference po ${verdict}: ${m.scoreline}`,
    text: `Novináři mají ${questions.length === 2 ? 'dvě otázky' : 'tři otázky'}: ${questions.map((q) => q.topic === 'vyrok' ? 'váš dřívější výrok' : q.fact.replace(/\.$/, '')).join('; ')}. Když nerozhodnete, odpoví mluvčí podle výchozích odpovědí.`,
    options: [
      { id: 'odpovedi', label: 'Odpovědět na otázky', hint: 'Vaše odpovědi, jinak výchozí.' },
      { id: 'mluvci', label: 'Poslat jen tiskového mluvčího', hint: 'Žádné výroky ani sliby. Média −2.' },
    ],
    defaultOption: 'odpovedi',
    playerId: questions.find((q) => q.playerId)?.playerId,
  };
  state.events.push(event);
  state.eventLog ??= {};
  state.eventLog[PRESS_TEMPLATE] = state.date;
  ps.lastDate = state.date;
  ps.asked = Object.fromEntries(Object.entries({ ...(ps.asked ?? {}), ...Object.fromEntries(questions.map((q) => [`${q.topic}:${q.playerId ?? ''}`, state.date])) }).filter(([, d]) => addDays(d, 60) > state.date));
  ps.current = { eventId: event.id, fixtureId: m.fixtureId, date: state.date, title: event.title, questions };
  return ps.current;
}

function applyEffect(state: GameState, e: PressEffect, playerId: string | undefined, key: string): string | undefined {
  const own = state.owner.clubId;
  if (e.media) media(state, e.media);
  if (e.coach) state.owner.trust.trener = easeAdd(state.owner.trust.trener, e.coach);
  if (e.team) for (const p of squadOf(state, own)) p.morale = clamp(p.morale + e.team, 0, 100);
  if (e.fans) state.clubs[own].fanMood = clamp(state.clubs[own].fanMood + e.fans, 0, 100);
  if (e.league) league(state, e.league);
  const p = playerId ? state.players[playerId] : undefined;
  if (e.player && p) p.morale = clamp(p.morale + e.player, 0, 100);
  if (e.fineRisk && hash01(key) < e.fineRisk) {
    const amount = fine(state, 120_000, 'Pokuta za výroky na tiskové konferenci');
    return `Svaz udělil pokutu ${(amount / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} mil. Kč.`;
  }
  return undefined;
}

/**
 * Vyřízení tiskovky (volá šablona situace). `answers` = volby majitele po otázkách,
 * chybějící doplní výchozí odpovědi.
 */
export function resolvePressConference(state: GameState, e: GameEvent, option: string, answers: Record<string, string> = {}): string {
  const ps = pressState(state);
  const conf = ps.current?.eventId === e.id ? ps.current : undefined;
  ps.current = undefined;
  if (!conf) return 'Tisková konference proběhla bez větších titulků.';
  if (option === 'mluvci') {
    media(state, -2);
    ps.history = [{ date: conf.date, title: conf.title, lines: ['Za klub mluvil jen tiskový mluvčí.'] }, ...(ps.history ?? [])].slice(0, 10);
    return 'Za klub mluvil jen tiskový mluvčí. Novináři píšou, že se majitel schovává.';
  }
  const lines: string[] = [];
  for (const q of conf.questions) {
    const a = q.answers.find((x) => x.id === answers[q.id]) ?? q.answers.find((x) => x.id === q.defaultAnswer) ?? q.answers[0];
    const fineNote = applyEffect(state, a.effect, q.playerId, `${e.id}-${q.id}-${a.id}`);
    if (a.statement) recordStatement(state, a.statement);
    if (a.closes) {
      const st = state.narrative?.statements.find((x) => x.id === a.closes);
      if (st) {
        st.done = true;
        st.outcome = 'Majitel na tiskovce přiznal, že cíl přecenil.';
      }
    }
    if (a.promise) addPromise(state, a.promise);
    lines.push(`„${a.label}.“${fineNote ? ` ${fineNote}` : ''}`);
  }
  ps.history = [{ date: conf.date, title: conf.title, lines: conf.questions.map((q, i) => `${q.text} → ${lines[i]}`) }, ...(ps.history ?? [])].slice(0, 10);
  return lines.join(' ');
}

/** Akce UI: majitel odpoví na otázky (chybějící doplní výchozí). */
export function answerPressConference(prev: GameState, answers: Record<string, string>, option: 'odpovedi' | 'mluvci' = 'odpovedi'): ActionResult {
  const conf = prev.press?.current;
  const event = conf ? prev.events.find((x) => x.id === conf.eventId) : undefined;
  if (!conf || !event) return { state: prev, ok: false, message: 'Tisková konference už skončila.' };
  const state = structuredClone(prev);
  const ev = state.events.find((x) => x.id === event.id)!;
  const message = resolvePressConference(state, ev, option, answers);
  state.events = state.events.filter((x) => x.id !== ev.id);
  addNews(state, { kind: 'info', title: `${ev.title}: ${option === 'mluvci' ? 'mluvil jen mluvčí' : 'majitel odpověděl'}`, text: message, fixtureId: conf.fixtureId });
  return { state, ok: true, message };
}
