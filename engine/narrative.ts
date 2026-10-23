import { liveFixture } from './euromatch'; // V4
import { matchesWord, ownMatchesSince, seasonFacts, type OwnMatchFacts } from './facts';
import { forumMemory } from './forum';
import { media } from './grey';
import { coachOf, goalTarget, ownPosition } from './staff';
import type { GameState, Player } from './types';
import { addNews, clamp, competitionOf } from './world';

/**
 * Navazující příběhy: hra si pamatuje výroky (majitele z tiskovek, novinářů a fanoušků), sliby
 * a podporu z příběhů sezóny. Po dalších zápasech na ně naváže titulkem s fakty
 * („Kdo říkal, že Krobot nedává góly?“, „Slíbená podpora trenérovi vydržela jen dva zápasy“).
 */

export type StatementKind =
  | 'kritika-hrace'
  | 'kritika-brankare'
  | 'podpora-hrace'
  | 'podpora-brankare'
  | 'cil'
  | 'ambice'
  | 'podpora-trenera'
  | 'ultimatum'
  | 'stiznost';

export type StatementSource = 'majitel' | 'novinari' | 'fanousci';

export interface Statement {
  id: string;
  date: string;
  source: StatementSource;
  kind: StatementKind;
  /** Výrok tak, jak zazněl (cituje se v titulcích). */
  quote: string;
  /** Odkud výrok je (tiskovka, příběh sezóny, fórum, noviny). */
  origin?: 'tiskovka' | 'pribeh' | 'forum' | 'noviny';
  playerId?: string;
  coachId?: string;
  /** Cílová pozice v tabulce (cíl, ambice) a krátký popis („Evropa“). */
  target?: number;
  label?: string;
  /** Kolik zápasů klubu majitele od výroku proběhlo. */
  seen: number;
  /** Výchozí čísla (např. zápasy bez gólu v době výroku). */
  base?: number;
  season: number;
  done?: boolean;
  /** Jak to dopadlo (pro přehled výroků). */
  outcome?: string;
}

export interface Headline {
  date: string;
  title: string;
  text: string;
  fixtureId?: string;
  statementId?: string;
}

export interface NarrativeState {
  statements: Statement[];
  headlines: Headline[];
  /** Poslední zápas, na který už příběhy navázaly. */
  lastFixture?: string;
  /** Příběhy sezóny, ze kterých se už výrok zapsal. */
  storiesSeen?: string[];
}

const MAX_STATEMENTS = 40;
/** Nejvýš tolik navazujících titulků po jednom zápase (aby zprávy nezahltily). */
const MAX_HEADLINES = 2;

export function narrativeState(state: GameState): NarrativeState {
  state.narrative ??= { statements: [], headlines: [] };
  return state.narrative;
}

const fullName = (p: Pick<Player, 'firstName' | 'lastName'>) => `${p.firstName} ${p.lastName}`;

/** Zapíše výrok, na který mohou navázat další zápasy. Stejný otevřený výrok se nezdvojuje. */
export function recordStatement(state: GameState, st: Omit<Statement, 'id' | 'date' | 'seen' | 'season'> & { date?: string }): Statement | undefined {
  const n = narrativeState(state);
  const dup = n.statements.find((x) => !x.done && x.kind === st.kind && x.playerId === st.playerId && x.source === st.source);
  if (dup) return undefined;
  const full: Statement = { ...st, quote: st.quote.replace(/[.!]+$/, '').replace(/„([^“]*)“/g, '‚$1‘'), id: `vy${++state.nextId}`, date: st.date ?? state.date, seen: 0, season: state.season };
  n.statements = [...n.statements, full].slice(-MAX_STATEMENTS);
  return full;
}

/** Otevřené výroky (na které ještě může něco navázat). */
export function openStatements(state: GameState): Statement[] {
  return (state.narrative?.statements ?? []).filter((s) => !s.done);
}

/** Výroky majitele v aktuální sezóně (nejnovější první) – pro přehled „Co jste řekl médiím“. */
export function ownerStatements(state: GameState): Statement[] {
  return (state.narrative?.statements ?? []).filter((s) => s.source === 'majitel' && s.season === state.season).reverse();
}

export function recentHeadlines(state: GameState, limit = 5): Headline[] {
  return (state.narrative?.headlines ?? []).slice(0, limit);
}

/** „před týdnem“, „před 12 dny“… */
export function agoText(from: string, to: string): string {
  const d = Math.max(0, Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000));
  if (d <= 1) return 'včera';
  if (d < 7) return `před ${d} dny`;
  if (d < 14) return 'před týdnem';
  if (d < 31) return `před ${Math.round(d / 7)} týdny`;
  if (d < 60) return 'před měsícem';
  return `před ${Math.round(d / 30)} měsíci`;
}

function sourceText(st: Statement, date: string): string {
  const ago = agoText(st.date, date);
  if (st.source === 'majitel') return `${ago[0].toUpperCase()}${ago.slice(1)} jste ${st.origin === 'pribeh' ? 'veřejně prohlásil' : st.origin === 'forum' ? 'fanouškům na fóru napsal' : 'na tiskové konferenci řekl'}: „${st.quote}“`;
  if (st.source === 'fanousci') return `Fanoušci na fóru ${ago} psali: „${st.quote}“`;
  return `Noviny ${ago} psaly: „${st.quote}“`;
}

const zapasech = (n: number) => (n === 1 ? 'jednom zápase' : n === 2 ? 'dvou zápasech' : n === 3 ? 'třech zápasech' : n === 4 ? 'čtyřech zápasech' : `${n} zápasech`);
const zapasy = (n: number) => (n === 0 ? 'ani jeden zápas' : n === 1 ? 'jediný zápas' : n === 2 ? 'dva zápasy' : n === 3 ? 'tři zápasy' : n === 4 ? 'čtyři zápasy' : matchesWord(n));

/** Hrál hráč v daném zápase? */
export function playedIn(state: GameState, fixtureId: string, playerId: string): boolean {
  const d = liveFixture(state, fixtureId)?.result?.detail; // V4: i evropské zápasy
  if (!d) return false;
  return [...d.home.lineup, ...d.home.bench, ...d.away.lineup, ...d.away.bench].some((l) => l.id === playerId && l.minutes > 0);
}

interface FollowUp {
  st: Statement;
  priority: number;
  title: string;
  text: string;
  apply: () => void;
  outcome: string;
}

const morale = (p: Player | undefined, d: number) => {
  if (p) p.morale = clamp(p.morale + d, 0, 100);
};
const fans = (state: GameState, d: number) => {
  const c = state.clubs[state.owner.clubId];
  c.fanMood = clamp(c.fanMood + d, 0, 100);
};

function followUp(state: GameState, st: Statement, m: OwnMatchFacts): FollowUp | 'done' | undefined {
  const p = st.playerId ? state.players[st.playerId] : undefined;
  if (st.playerId && (!p || p.clubId !== state.owner.clubId)) return 'done';
  const scored = p ? m.scorers.filter((s) => s.playerId === p.id) : [];
  const owner = st.source === 'majitel';
  const src = sourceText(st, m.date);
  if (st.kind === 'kritika-hrace' && p) {
    if (scored.length) {
      const min = scored.map((s) => `${s.minute}.`).join(' a ');
      return {
        st,
        priority: owner ? 9 : 7,
        title: `Kdo říkal, že ${p.lastName} nedává góly?`,
        text: `${fullName(p)} se trefil v ${min} minutě (${m.scoreline}). ${src}.${owner ? ' Hráč teď kritikům odpověděl na hřišti.' : ''}`,
        apply: () => {
          morale(p, owner ? 3 : 4);
          if (owner) media(state, -1);
          else fans(state, 1);
        },
        outcome: `${p.lastName} odpověděl gólem (${m.scoreline}).`,
      };
    }
    if (m.potm?.playerId === p.id) {
      return {
        st,
        priority: owner ? 8 : 6,
        title: `${p.lastName} odpověděl kritikům: hráč zápasu`,
        text: `${fullName(p)} byl nejlepším hráčem zápasu ${m.scoreline}. ${src}.`,
        apply: () => {
          morale(p, 3);
          if (owner) media(state, -1);
        },
        outcome: `${p.lastName} byl hráčem zápasu (${m.scoreline}).`,
      };
    }
    return st.seen >= 8 ? 'done' : undefined;
  }
  if ((st.kind === 'kritika-brankare' || st.kind === 'podpora-brankare') && p) {
    if (m.ga === 0 && playedIn(state, m.fixtureId, p.id)) {
      const backed = st.kind === 'podpora-brankare';
      return {
        st,
        priority: backed ? 7 : owner ? 8 : 6,
        title: backed ? `Majitel podržel brankáře ${p.lastName} – a ten vychytal nulu` : `${p.lastName} odpověděl kritikům čistým kontem`,
        text: `${m.scoreline}: ${fullName(p)} nedostal gól. ${src}.`,
        apply: () => {
          morale(p, 4);
          if (backed) media(state, 1);
          else if (owner) media(state, -1);
        },
        outcome: `Čisté konto proti ${m.opponentName}.`,
      };
    }
    if (st.kind === 'podpora-brankare' && m.ga >= 3 && playedIn(state, m.fixtureId, p.id) && st.seen <= 3) {
      return {
        st,
        priority: 6,
        title: `Podpora nepomohla: ${p.lastName} inkasoval ${m.ga} góly`,
        text: `${m.scoreline}. ${src}. Fanoušci se ptají, jestli majitel vsadil na správného brankáře.`,
        apply: () => {
          media(state, -1);
          fans(state, -1);
        },
        outcome: `Inkasoval ${m.ga} (${m.scoreline}).`,
      };
    }
    return st.seen >= 6 ? 'done' : undefined;
  }
  if (st.kind === 'podpora-hrace' && p) {
    if (scored.length) {
      return {
        st,
        priority: 8,
        title: `Majitel měl pravdu: ${p.lastName} prolomil střelecký půst`,
        text: `${fullName(p)} skóroval v ${scored[0].minute}. minutě (${m.scoreline}).${st.base ? ` V době výroku čekal na gól ${matchesWord(st.base)}.` : ''} ${src}.`,
        apply: () => {
          media(state, 1);
          morale(p, 3);
        },
        outcome: `Gól proti ${m.opponentName} – podpora vyšla.`,
      };
    }
    const drought = st.seen >= 4 && playedIn(state, m.fixtureId, p.id) ? seasonFacts(state).droughts.find((d) => d.playerId === p.id)?.games : undefined;
    if (drought) {
      return {
        st,
        priority: 6,
        title: `Podpora nepomohla: ${p.lastName} je bez gólu už ${matchesWord(drought)}`,
        text: `${src}. Od té doby ${p.lastName} dál čeká na gól, naposledy ${m.scoreline}.`,
        apply: () => media(state, -1),
        outcome: `Ani po podpoře gól nepřišel (${matchesWord(drought)} bez gólu).`,
      };
    }
    return st.seen >= 6 ? 'done' : undefined;
  }
  if ((st.kind === 'cil' || st.kind === 'ambice') && st.target) {
    if (st.season !== state.season) return 'done';
    const pos = ownPosition(state);
    if (!pos || pos.played < 3) return undefined;
    if (st.kind === 'ambice') {
      const since = ownMatchesSince(state, st.date);
      const losses = since.filter((r) => r.outcome === 'P').length;
      if (since.length >= 3 && losses >= 2) {
        return {
          st,
          priority: 7,
          title: `Majitel chtěl výš – a přišly ${losses === 2 ? 'dvě' : losses === 3 ? 'tři' : losses} porážky`,
          text: `${src}. Od té doby: ${since.map((r) => `${r.gf}:${r.ga}`).join(', ')}. Klub je ${pos.position}.`,
          apply: () => {
            media(state, -2);
            fans(state, -1);
          },
          outcome: `${losses} porážky z ${since.length} zápasů, ${pos.position}. místo.`,
        };
      }
      return st.seen >= 5 ? 'done' : undefined;
    }
    if (st.seen < 4) return undefined;
    if (pos.position > st.target + 2) {
      return {
        st,
        priority: owner ? 8 : 5,
        title: `Majitel řekl „${st.label ?? `${st.target}. místo`}“ – a teď ${pos.position}. místo`,
        text: `${src}. Po ${zapasech(st.seen)} od výroku je klub ${pos.position}. v tabulce, ${pos.position - st.target} míst za slibovaným cílem.`,
        apply: () => {
          media(state, -2);
          fans(state, -1);
        },
        outcome: `Po ${st.seen} zápasech ${pos.position}. místo (cíl ${st.target}.).`,
      };
    }
    if (pos.position <= st.target) {
      return {
        st,
        priority: 5,
        title: `Cíl „${st.label ?? `${st.target}. místo`}“ zatím platí: ${pos.position}. místo`,
        text: `${src}. Po ${zapasech(st.seen)} je klub ${pos.position}., v souladu s tím, co majitel slíbil.`,
        apply: () => media(state, 1),
        outcome: `Po ${st.seen} zápasech ${pos.position}. místo – v plánu.`,
      };
    }
    return st.seen >= 6 ? 'done' : undefined;
  }
  if (st.kind === 'podpora-trenera') {
    const coach = coachOf(state, state.owner.clubId);
    if (st.coachId && coach?.id !== st.coachId) {
      const old = state.staff[st.coachId];
      return {
        st,
        priority: 9,
        title: `Slíbená podpora trenérovi vydržela jen ${zapasy(st.seen)}`,
        text: `${src}. ${old ? `${old.firstName} ${old.lastName}` : 'Trenér'} už klub nevede. Novináři píšou, že slovo majitele neplatí dlouho.`,
        apply: () => {
          media(state, -3);
          state.owner.trust.reditel = clamp(state.owner.trust.reditel - 1, 0, 100);
        },
        outcome: `Trenér odešel po ${st.seen} zápasech.`,
      };
    }
    if (st.seen >= 6) {
      const since = ownMatchesSince(state, st.date);
      const pts = since.reduce((a, r) => a + (r.outcome === 'V' ? 3 : r.outcome === 'R' ? 1 : 0), 0);
      if (since.length && pts / since.length >= 1.5 && coach) {
        return {
          st,
          priority: 6,
          title: `Trenér ${coach.lastName} splatil majitelovu důvěru`,
          text: `${src}. Od té doby ${pts} b. z ${matchesWord(since.length)}.`,
          apply: () => {
            media(state, 1);
            state.owner.trust.trener = clamp(state.owner.trust.trener + 2, 0, 100);
          },
          outcome: `${pts} b. z ${since.length} zápasů – podpora se vyplatila.`,
        };
      }
      return 'done';
    }
    return undefined;
  }
  if (st.kind === 'ultimatum') {
    if (st.seen < 3) return undefined;
    const since = ownMatchesSince(state, st.date).slice(0, 3);
    const wins = since.filter((r) => r.outcome === 'V').length;
    const pts = since.reduce((a, r) => a + (r.outcome === 'V' ? 3 : r.outcome === 'R' ? 1 : 0), 0);
    const scores = since.map((r) => `${r.gf}:${r.ga}`).join(', ');
    if (wins >= 2) {
      return {
        st,
        priority: 7,
        title: `Majitelova slova zabrala: ${wins === 2 ? 'dvě' : 'tři'} výhry ze tří`,
        text: `${src}. Tým odpověděl: ${scores}.`,
        apply: () => media(state, 1),
        outcome: `Tým odpověděl (${scores}).`,
      };
    }
    if (pts <= 1) {
      return {
        st,
        priority: 7,
        title: `Ani tvrdá slova majitele nepomohla: ${pts === 1 ? '1 bod' : '0 bodů'} ze tří zápasů`,
        text: `${src}. Výsledky od té doby: ${scores}.`,
        apply: () => {
          media(state, -2);
          state.owner.trust.trener = clamp(state.owner.trust.trener - 2, 0, 100);
        },
        outcome: `Bez reakce (${scores}).`,
      };
    }
    return 'done';
  }
  if (st.kind === 'stiznost') return st.seen >= 2 ? 'done' : undefined;
  return st.seen >= 8 ? 'done' : undefined;
}

/** Výroky z příběhů sezóny (podpora trenéra v krizi, ultimátum) – zapíší se jednou. */
function statementsFromStories(state: GameState): void {
  const n = narrativeState(state);
  const seen = new Set(n.storiesSeen ?? []);
  const coach = coachOf(state, state.owner.clubId);
  for (const s of state.stories ?? []) {
    if (seen.has(s.id) || s.step < 1 || (s.kind !== 'krize' && s.kind !== 'hodnoceni')) continue;
    const choice = s.data.choice;
    if (s.kind === 'krize' && choice === 'podpora' && coach) {
      recordStatement(state, { source: 'majitel', origin: 'pribeh', kind: 'podpora-trenera', quote: `Trenér ${coach.lastName} má moji plnou podporu.`, coachId: coach.id });
    } else if (choice === 'ultimatum') {
      recordStatement(state, { source: 'majitel', origin: 'pribeh', kind: 'ultimatum', quote: 'Takhle to dál nejde, čekám okamžitou reakci.' });
    } else if (s.kind === 'hodnoceni' && s.done && coach && /pokračuje/.test(s.log.join(' '))) {
      recordStatement(state, { source: 'majitel', origin: 'pribeh', kind: 'podpora-trenera', quote: `Trenér ${coach.firstName} ${coach.lastName} zůstává, počítáme s ním i na jaře.`, coachId: coach.id });
    } else continue;
    seen.add(s.id);
  }
  n.storiesSeen = [...seen].slice(-40);
}

/** Kritika z fakt (sucho střelce, nejistý brankář) – zazní v novinách a na fóru. */
function statementsFromFacts(state: GameState): void {
  const f = seasonFacts(state);
  const d = f.droughts[0];
  if (d && d.games >= 5) {
    const p = state.players[d.playerId];
    if (p) recordStatement(state, { source: 'novinari', origin: 'noviny', kind: 'kritika-hrace', playerId: p.id, quote: `${p.lastName} zapomněl, kde stojí brána – ${matchesWord(d.games)} bez gólu`, base: d.games });
  }
  // R2: vlákna fanouškovského fóra o konkrétním hráči (střelec bez gólu, brankář) v bouřlivé náladě.
  for (const t of forumMemory(state)) {
    if (t.closed || !t.subjectId || (t.topic !== 'strelec' && t.topic !== 'brankar')) continue;
    const p = state.players[t.subjectId];
    if (!p || p.clubId !== state.owner.clubId) continue;
    if (t.reply?.option === 'uklidnit' && t.topic === 'strelec') {
      recordStatement(state, { source: 'majitel', origin: 'forum', kind: 'podpora-hrace', playerId: p.id, quote: t.reply.text.slice(0, 140), date: t.reply.date });
    } else if (t.mood < 45) {
      recordStatement(state, { source: 'fanousci', origin: 'forum', kind: t.topic === 'brankar' ? 'kritika-brankare' : 'kritika-hrace', playerId: p.id, quote: t.title });
    }
  }
  if (f.shakyKeeper) {
    recordStatement(state, { source: 'fanousci', origin: 'forum', kind: 'kritika-brankare', playerId: f.shakyKeeper.playerId, quote: `${state.players[f.shakyKeeper.playerId]?.lastName ?? 'Brankář'} musí z brány ven` });
  }
}

/**
 * Po zápase klubu majitele: navazující titulky na dřívější výroky a zapsání nové kritiky z fakt.
 * Volá se denně (po odehrání zápasů dne), na každý zápas jen jednou.
 */
export function narrativeAfterMatch(state: GameState, m: OwnMatchFacts): Headline[] {
  const n = narrativeState(state);
  if (n.lastFixture === m.fixtureId) return [];
  n.lastFixture = m.fixtureId;
  statementsFromStories(state);
  const candidates: FollowUp[] = [];
  for (const st of n.statements) {
    if (st.done || st.date >= m.date) continue;
    st.seen++;
    const r = followUp(state, st, m);
    if (r === 'done') st.done = true;
    else if (r) candidates.push(r);
  }
  candidates.sort((a, b) => b.priority - a.priority);
  const out: Headline[] = [];
  const players = new Set<string>();
  for (const c of candidates) {
    // Po jednom zápase nejvýš dva titulky a o jednom hráči jen jednou; ostatní počkají (nebo vyšumí).
    if (out.length >= MAX_HEADLINES || (c.st.playerId && players.has(c.st.playerId))) continue;
    c.apply();
    c.st.done = true;
    c.st.outcome = c.outcome;
    if (c.st.playerId) players.add(c.st.playerId);
    const h: Headline = { date: state.date, title: c.title, text: c.text, fixtureId: m.fixtureId, statementId: c.st.id };
    out.push(h);
    addNews(state, { kind: 'info', title: c.title, text: c.text, fixtureId: m.fixtureId, playerId: c.st.playerId && state.players[c.st.playerId] ? c.st.playerId : undefined });
  }
  // Výroky, ke kterým se zápas vázal, ale titulek nedostaly (limit), se uzavřou bez titulku.
  for (const c of candidates) if (!out.some((h) => h.statementId === c.st.id) && c.st.playerId && players.has(c.st.playerId)) c.st.done = true;
  n.headlines = [...out.reverse(), ...n.headlines].slice(0, 30);
  statementsFromFacts(state);
  return out;
}

/** Krátký popis cíle pro výrok („Evropa“, „horní polovina“…). */
export function goalWord(state: GameState): { label: string; target: number } | undefined {
  const comp = competitionOf(state, state.owner.clubId);
  if (!comp) return undefined;
  const goal = state.owner.seasonGoal;
  const target = goalTarget(goal, comp);
  const label = goal === 'titul' ? 'titul' : goal === 'postup' ? (comp.promote === 0 ? 'Evropa' : 'postup') : goal === 'horni' ? 'horní polovina' : goal === 'stred' ? 'klidný střed' : 'záchrana';
  return { label, target };
}
