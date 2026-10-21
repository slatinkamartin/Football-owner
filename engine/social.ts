import { addDays, seasonLabel } from './calendar';
import { allFixtures } from './competitions';
import { europeRun } from './europe';
import { annualCosts, book, defaultTicketPrice } from './finance';
import { changeSponsorRelation } from './finplus';
import { league, media } from './grey';
import { rivalsOf } from './league';
import { changeAgentRelation, agentOf } from './market';
import { squadOf } from './players';
import { createRng } from './rng';
import { topRivals, touchRival } from './rivals';
import { changeCity, changeUltras } from './surroundings';
import { generateStaff, staffAbility, type ActionResult } from './staff';
import { upcomingBigMatch, type BigMatch, type BigMatchKind } from './bigmatch';
import type { GameEvent, GameState, Player } from './types';
import { computeTable } from './standings';
import { addNews, clamp, clubLabel, competitionOf, FREE, hash01, isForeign, plural, tierOf } from './world';

/**
 * Sociální sítě klubu a majitele, krok „Po zápase“ a paměť rivality.
 * Fanoušci v komentářích jsou vždy vymyšlení (přezdívky), nikdy skutečné osoby.
 * Situace (kauzy, příspěvky hráčů, ohlášení posily) vznikají jen z háčku dailySocial.
 */

// ---------- Typy ----------

export type SocialTone = 'sympaticky' | 'profesionalni' | 'kontroverzni';

export const TONE_LABEL: Record<SocialTone, { label: string; hint: string }> = {
  sympaticky: { label: 'sympatický', hint: 'Lidský obsah a zákulisí. Fanoušci a město +, sledující rostou pomalu, ale jistě.' },
  profesionalni: { label: 'profesionální', hint: 'Čistá prezentace pro partnery. Vztahy se sponzory měsíčně +1, menší dosah.' },
  kontroverzni: { label: 'kontroverzní', hint: 'Rýpance a provokace. Nejvíc sledujících a dosahu, ale horší vztah se svazem a vedeními soupeřů, sponzoři −1.' },
};

const TONE_GROWTH: Record<SocialTone, number> = { sympaticky: 0.006, profesionalni: 0.003, kontroverzni: 0.016 };
const TONE_REACH: Record<SocialTone, number> = { sympaticky: 6, profesionalni: 0, kontroverzni: 14 };

export interface SocialComment {
  /** Vymyšlená přezdívka fanouška. */
  name: string;
  text: string;
}

export interface SocialPost {
  id: string;
  date: string;
  /** Kdo příspěvek zveřejnil (klub, majitel, správce, hráč). */
  author: string;
  text: string;
  likes: number;
  comments: SocialComment[];
  mood: 'pos' | 'neg' | 'mix';
}

export interface RivalGame {
  date: string;
  gf: number;
  ga: number;
  home: boolean;
  comp: string;
}

export interface RivalMemory {
  w: number;
  d: number;
  l: number;
  /** Posledních až 8 vzájemných zápasů (nejnovější první). */
  games: RivalGame[];
  /** Legendární momenty (vysoké výhry, otočky, góly v nastavení, debakly). */
  legends: { date: string; text: string; good: boolean }[];
}

export type PostMatchKind = BigMatchKind | 'trofej';

export interface PostMatchPending {
  id: string;
  date: string;
  /** Do kdy majitel rozhoduje; potom platí výchozí volby. */
  until: string;
  kind: PostMatchKind;
  label: string;
  result: 'V' | 'R' | 'P';
  score: string;
  opponentName?: string;
  opponentId?: string;
  headlines: { paper: string; title: string }[];
  hero?: { playerId?: string; name: string; goals: number };
  /** Příjem z dresů hrdiny (připíše se při potvrzení). */
  jerseys: number;
  moments: string[];
}

export interface SocialState {
  followers: number;
  /** Dosah (zapojení) 0–100. */
  reach: number;
  tone: SocialTone;
  posts: SocialPost[];
  hashtag?: { tag: string; date: string };
  /** Sledující na začátku měsíců (posledních 12). */
  history: { date: string; followers: number }[];
  pending?: PostMatchPending;
  /** Velký zápas, který se hraje zítra (pro rozpoznání po zápase). */
  watch?: BigMatch;
  trophiesSeen?: number;
  transfersSeen?: string[];
  lastScandal?: string;
  lastPostMatch?: string;
  playerPosts?: { season: number; count: number; last?: string };
  lastPrice?: number;
  rivalry: Record<string, RivalMemory>;
  /** Podrobnosti otevřených situací ze sítí. */
  eventInfo?: Record<string, { playerId?: string; reason?: string; fee?: number; anonymous?: boolean; topic?: string }>;
  /** Jen pro výpis: příjem ze sítí za poslední měsíc. */
  lastIncome?: number;
}

// ---------- Pomocné ----------

const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;
const round = (v: number, step = 10_000) => Math.max(step, Math.round(v / step) * step);
const own = (s: GameState) => s.clubs[s.owner.clubId];
const roll = (s: GameState, key: string) => hash01(`${s.seed}-${s.date}-social-${key}`);

function scale(state: GameState): number {
  const club = own(state);
  return Math.max(0.15, annualCosts(club, tierOf(state, club.id)) / 70_000_000);
}

function fans(state: GameState, delta: number): void {
  const club = own(state);
  club.fanMood = clamp(club.fanMood + delta, 0, 100);
}

function teamMorale(state: GameState, delta: number): void {
  for (const p of squadOf(state, state.owner.clubId)) p.morale = clamp(p.morale + delta, 0, 100);
}

function startFollowers(state: GameState): number {
  const rep = own(state).reputation;
  return Math.round((1500 + rep * rep * 22) / 100) * 100;
}

/** Profil na sítích (bez uloženého stavu výchozí podle pověsti klubu). */
export function socialOf(state: GameState): SocialState {
  return state.social ?? { followers: startFollowers(state), reach: 22, tone: 'sympaticky', posts: [], history: [], rivalry: {} };
}

function ensure(state: GameState): SocialState {
  state.social ??= socialOf(state);
  return state.social;
}

/** Schopnosti správce sociálních sítí (undefined = klub ho nemá). */
export function socialManager(state: GameState): number | undefined {
  return staffAbility(state, 'site');
}

function grow(state: GameState, pct: number): void {
  const s = ensure(state);
  s.followers = Math.max(300, Math.round(s.followers * (1 + pct)));
}

const tagOf = (state: GameState) => own(state).shortName.replace(/[^\p{L}\p{N}]/gu, '');

// ---------- Vymyšlení fanoušci ----------

const HANDLES = [
  'kotel_navzdy', 'petr_z_tribuny', 'jana_fanynka', 'deda_ze_sektoru_C', 'zelena_trava77', 'ultras_junior', 'mama_utocnika',
  'fotbal_v_srdci', 'martin.permanentka', 'sever_buraci', 'lucka_na_vyjezdu', 'starej_permanentkar', 'kluk_z_akademie',
  'hlas_z_ochozu', 'pivni_expert', 'taktik_z_gauce', 'babicka_v_sale', 'honza_od_stanku', 'vlajkonos_12', 'sobotni_fanda',
];

const COMMENTS: Record<'pos' | 'neg' | 'mix', string[]> = {
  pos: ['Tohle je náš klub! ❤️', 'Husí kůže, díky kluci!', 'Kotel zpíval celou cestu domů.', 'Takhle se to hraje!', 'Jsem hrdej, že tam chodím od malička.', 'Dres už objednanej 😎', 'Konečně radost!', 'Příště jedu taky!'],
  neg: ['Takhle ne, pánové.', 'Za tohle platíme vstupný?', 'Chceme slyšet vysvětlení.', 'Smutnej večer.', 'Vedení by se mělo zamyslet.', 'Hlavně se z toho poučit.', 'Já to nevzdám, ale tohle bolí.', 'Kde byla bojovnost?'],
  mix: ['Hlavně držet spolu.', 'Uvidíme v neděli.', 'Mohlo to bejt lepší, mohlo to bejt horší.', 'Aspoň že jsme byli slyšet.', 'Chce to klid.', 'Zajímavý...', 'Komentáře jsou zase zábava 😅', 'Kdy bude nový dres?'],
};

function comments(state: GameState, key: string, mood: SocialPost['mood'], n = 3): SocialComment[] {
  const out: SocialComment[] = [];
  const used = new Set<number>();
  for (let i = 0; i < n; i++) {
    const hi = Math.floor(hash01(`${state.seed}-${key}-h${i}`) * HANDLES.length);
    if (used.has(hi)) continue;
    used.add(hi);
    const pool = COMMENTS[i === 2 && mood !== 'mix' ? 'mix' : mood];
    out.push({ name: `@${HANDLES[hi]}`, text: pool[Math.floor(hash01(`${state.seed}-${key}-c${i}`) * pool.length)] });
  }
  return out;
}

function addPost(state: GameState, author: string, text: string, mood: SocialPost['mood'], boost = 1): SocialPost {
  const s = ensure(state);
  const id = `sp${++state.nextId}`;
  const likes = Math.max(5, Math.round(s.followers * (s.reach / 100) * 0.35 * boost * (0.6 + hash01(`${state.seed}-${id}-likes`) * 0.8)));
  const post: SocialPost = { id, date: state.date, author, text, likes, comments: comments(state, id, mood), mood };
  s.posts = [post, ...s.posts].slice(0, 12);
  return post;
}

function setHashtag(state: GameState, tag: string): void {
  ensure(state).hashtag = { tag: tag.startsWith('#') ? tag : `#${tag}`, date: state.date };
}

/** Trendující hashtag (platí dva týdny). */
export function trendingHashtag(state: GameState): string | undefined {
  const h = state.social?.hashtag;
  return h && addDays(h.date, 14) >= state.date ? h.tag : undefined;
}

// ---------- Výsledek vlastního zápasu ----------

interface OwnResult {
  id: string;
  gf: number;
  ga: number;
  pens?: [number, number];
  ours: { playerId: string; minute: number }[];
  theirs: number[];
  home: boolean;
  opponentId?: string;
  opponentName: string;
  comp: string;
  score: string;
}

function fixtureResult(state: GameState, id: string): OwnResult | undefined {
  const x = allFixtures(state).find((f) => f.fixture.id === id);
  const f = x?.fixture;
  const ownId = state.owner.clubId;
  if (!f?.result || (f.homeId !== ownId && f.awayId !== ownId)) return undefined;
  const home = f.homeId === ownId;
  const r = f.result;
  const opp = home ? f.awayId : f.homeId;
  return {
    id,
    gf: home ? r.homeGoals : r.awayGoals,
    ga: home ? r.awayGoals : r.homeGoals,
    pens: r.penalties ? (home ? r.penalties : [r.penalties[1], r.penalties[0]]) : undefined,
    ours: r.scorers.filter((g) => g.clubId === ownId).map((g) => ({ playerId: g.playerId, minute: g.minute })),
    theirs: r.scorers.filter((g) => g.clubId !== ownId).map((g) => g.minute),
    home,
    opponentId: opp,
    opponentName: clubLabel(state, opp),
    comp: x!.name,
    score: `${clubLabel(state, f.homeId)} – ${clubLabel(state, f.awayId)} ${r.homeGoals}:${r.awayGoals}${r.penalties ? ` (pen. ${r.penalties[0]}:${r.penalties[1]})` : ''}`,
  };
}

function euroResult(state: GameState, id: string): OwnResult | undefined {
  const m = europeRun(state)?.matches.find((x) => x.id === id);
  if (!m?.result) return undefined;
  const r = m.result;
  const us = own(state).shortName;
  const home = m.home && !m.neutral;
  const [h, a] = home ? [r.own, r.opp] : [r.opp, r.own];
  return {
    id,
    gf: r.own,
    ga: r.opp,
    pens: r.penalties,
    ours: r.scorers,
    theirs: r.oppMinutes,
    home,
    opponentName: m.opponent.name,
    comp: m.stage,
    score: `${home ? us : m.opponent.name} – ${home ? m.opponent.name : us} ${h}:${a}${r.penalties ? ` (pen. ${home ? r.penalties[0] : r.penalties[1]}:${home ? r.penalties[1] : r.penalties[0]})` : ''}`,
  };
}

function ownResult(state: GameState, id: string): OwnResult | undefined {
  return id.startsWith('eu-') ? euroResult(state, id) : fixtureResult(state, id);
}

function outcome(r: OwnResult): 'V' | 'R' | 'P' {
  if (r.gf !== r.ga) return r.gf > r.ga ? 'V' : 'P';
  if (r.pens) return r.pens[0] > r.pens[1] ? 'V' : 'P';
  return 'R';
}

/** Průběh: otočka, ztracené vedení, rozhodující gól a pozdní vyrovnání. */
function analyse(r: OwnResult): { comeback: boolean; blown: boolean; decisive?: number; lateEqualizer?: number } {
  const goals = [...r.ours.map((g) => ({ m: g.minute, d: 1 })), ...r.theirs.map((m) => ({ m, d: -1 }))].sort((a, b) => a.m - b.m || b.d - a.d);
  let diff = 0;
  let min = 0;
  let max = 0;
  let decisive: number | undefined;
  let lastLevel: number | undefined;
  for (const g of goals) {
    const before = diff;
    diff += g.d;
    min = Math.min(min, diff);
    max = Math.max(max, diff);
    if (before === 0 && diff !== 0) decisive = g.m;
    if (diff === 0) {
      decisive = undefined;
      lastLevel = g.m;
    }
  }
  return { comeback: min < 0 && diff > 0, blown: max > 0 && diff < 0, decisive, lateEqualizer: diff === 0 && lastLevel !== undefined && lastLevel >= 85 ? lastLevel : undefined };
}

// ---------- Paměť rivality ----------

function recordRivalry(state: GameState, r: OwnResult): void {
  if (!r.opponentId || isForeign(r.opponentId) || !state.clubs[r.opponentId]) return;
  const s = ensure(state);
  const mem = (s.rivalry[r.opponentId] ??= { w: 0, d: 0, l: 0, games: [], legends: [] });
  if (mem.games[0]?.date === state.date) return;
  mem.games = [{ date: state.date, gf: r.gf, ga: r.ga, home: r.home, comp: r.comp }, ...mem.games].slice(0, 8);
  if (r.gf > r.ga) mem.w++;
  else if (r.gf < r.ga) mem.l++;
  else mem.d++;
  const a = analyse(r);
  const season = seasonLabel(state.season);
  const legend = (text: string, good: boolean) => (mem.legends = [{ date: state.date, text, good }, ...mem.legends].slice(0, 5));
  if (r.gf - r.ga >= 3) legend(`Výhra ${r.gf}:${r.ga} (${season})`, true);
  else if (a.comeback) legend(`Otočka na ${r.gf}:${r.ga} (${season})`, true);
  else if (r.gf > r.ga && a.decisive && a.decisive >= 88) legend(`Vítězný gól v ${a.decisive}. minutě (${season})`, true);
  else if (r.ga - r.gf >= 3) legend(`Černý den: ${r.gf}:${r.ga} (${season})`, false);
}

/** Bilance a poslední zápasy s klubem za éry majitele. */
export function rivalryOf(state: GameState, clubId: string): RivalMemory | undefined {
  return state.social?.rivalry[clubId];
}

/**
 * Příběh do zápasu s klubem: „Odveta za podzimní 0:4“, série, bilance. Pro kartu odpočtu velkého zápasu.
 */
export function rivalryStory(state: GameState, clubId: string | undefined): string | undefined {
  if (!clubId) return undefined;
  const mem = rivalryOf(state, clubId);
  if (!mem?.games.length) return rivalsOf(state).some((r) => r.id === clubId) ? 'První vzájemný zápas vaší éry.' : undefined;
  const last = mem.games[0];
  const lastSeason = Number(last.date.slice(5, 7)) >= 7 ? Number(last.date.slice(0, 4)) : Number(last.date.slice(0, 4)) - 1;
  const when = lastSeason === state.season ? (Number(last.date.slice(5, 7)) >= 7 ? 'podzimní' : 'jarní') : 'loňské';
  let wins = 0;
  let winless = 0;
  for (const g of mem.games) {
    if (g.gf > g.ga && winless === 0) wins++;
    else break;
  }
  for (const g of mem.games) {
    if (g.gf <= g.ga && wins === 0) winless++;
    else break;
  }
  if (last.ga - last.gf >= 2) return `Odveta za ${when} ${last.gf}:${last.ga}.`;
  if (winless >= 3) return `Už ${plural(winless, 'zápas', 'zápasy', 'zápasů')} bez výhry. Je čas sérii zlomit.`;
  if (wins >= 3) return `Série ${wins} výher v řadě. Soupeř touží ji ukončit.`;
  if (last.gf - last.ga >= 2) return `Soupeř touží po odvetě za ${when} ${last.gf}:${last.ga}.`;
  return `Bilance vaší éry: ${plural(mem.w, 'výhra', 'výhry', 'výher')}, ${plural(mem.d, 'remíza', 'remízy', 'remíz')}, ${plural(mem.l, 'prohra', 'prohry', 'proher')}.`;
}

// ---------- Po zápase ----------

const KIND_LOC: Record<PostMatchKind, string> = {
  derby: 'derby',
  evropa: 'evropském večeru',
  titul: 'souboji o čelo',
  zachrana: 'zápase o záchranu',
  pohar: 'pohárové bitvě',
  baraz: 'baráži',
  trofej: 'sezóně',
};

const PAPERS = ['Fotbalový zpravodaj', 'Večerní listy', 'Tribuna online'];

function headlines(state: GameState, kind: PostMatchKind, res: 'V' | 'R' | 'P', r: OwnResult, hero: PostMatchPending['hero'], moments: string[]): PostMatchPending['headlines'] {
  const us = own(state).shortName;
  const a = analyse(r);
  const loc = KIND_LOC[kind];
  const sc = `${r.gf}:${r.ga}`;
  const moment = [...moments].reverse().find((m) => m.length < 90 && !m.startsWith('Vyprodáno'));
  const t: string[] = [];
  const shootout = !!r.pens && r.gf === r.ga;
  if (shootout) {
    const pens = `${r.pens![0]}:${r.pens![1]}`;
    t.push(res === 'V' ? `${us} postupuje po penaltách (${sc}, pen. ${pens})` : `Konec v ${loc}: penalty ${pens} pro soupeře`);
    t.push(res === 'V' ? 'Nervy na pokraji, ale slavíme!' : 'Penaltová loterie nevyšla');
    t.push(moment ? `Moment zápasu: ${moment}` : res === 'V' ? 'Kotel zpíval ještě hodinu po rozstřelu' : `${r.opponentName} jde dál, nám zbývá smutek`);
  } else if (res === 'V') {
    t.push(r.gf - r.ga >= 3 ? `Demolice! ${r.score}` : `${us} slaví výhru ${sc} v ${loc}`);
    t.push(
      a.comeback
          ? `Otočka jako z učebnice: z prohry výhra ${sc}`
          : a.decisive && a.decisive >= 85
            ? `Rozhodl gól v ${a.decisive}. minutě`
            : hero
              ? `Hrdina večera: ${hero.name}${hero.goals > 1 ? ` (${hero.goals} góly)` : ''}`
              : `Taktika vyšla, ${r.opponentName} bez šance`,
    );
    t.push(moment ? `Moment zápasu: ${moment}` : kind === 'derby' ? 'Město patří nám! Kotel zpíval ještě hodinu po zápase' : 'Kotel zpíval ještě hodinu po konečném hvizdu');
  } else if (res === 'P') {
    t.push(r.ga - r.gf >= 3 ? `Debakl ${sc} v ${loc}` : `Porážka ${sc} v ${loc}, slaví ${r.opponentName}`);
    t.push(a.blown ? 'Promarněné vedení stálo všechno' : a.decisive && a.decisive >= 85 ? `Krutá ${a.decisive}. minuta` : 'Kabina mlčí, fanoušci chtějí odpovědi');
    t.push(moment ? `Moment zápasu: ${moment}` : kind === 'derby' ? 'Město patří soupeři, aspoň do odvety' : 'Trenér: „Musíme se zvednout. Hned.“');
  } else {
    t.push(`Remíza ${sc} v ${loc}`);
    t.push(a.lateEqualizer ? `Vyrovnání v ${a.lateEqualizer}. minutě!` : 'Bitva bez vítěze, body napůl');
    t.push(moment ? `Moment zápasu: ${moment}` : 'Kotel: „Příště to bude naše.“');
  }
  return t.map((title, i) => ({ paper: PAPERS[i], title }));
}

function heroOf(state: GameState, r: OwnResult): PostMatchPending['hero'] {
  const count = new Map<string, number>();
  for (const g of r.ours) count.set(g.playerId, (count.get(g.playerId) ?? 0) + 1);
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  const p = best ? state.players[best[0]] : undefined;
  return p ? { playerId: p.id, name: `${p.firstName} ${p.lastName}`, goals: best![1] } : undefined;
}

function createPostMatch(state: GameState, bm: BigMatch, r: OwnResult): void {
  const s = ensure(state);
  const res = outcome(r);
  const moments = state.bigMatch?.id === bm.id ? state.bigMatch.moments ?? [] : [];
  const hero = res === 'V' ? heroOf(state, r) : undefined;
  // Prohrané derby rozjede vlnu kritiky.
  if (bm.kind === 'derby' && res === 'P' && r.ga - r.gf >= 2 && roll(state, 'derby-kauza') < 0.6) backlash(state, 'derby', `Po porážce ${r.gf}:${r.ga} v derby se sítě plní kritikou vedení i hráčů.`);
  // Hra má zůstat plynulá: derby a baráž mají krok po zápase vždy, ostatní velké zápasy (Evropa, pohár,
  // souboje o čelo a o záchranu) jen při výhře nebo prohře a nejvýš jednou za 4 týdny. Jinak jen titulky ve zprávách.
  const always = bm.kind === 'derby' || bm.kind === 'baraz';
  if (!always && ((s.lastPostMatch && addDays(s.lastPostMatch, 28) > state.date) || res === 'R')) {
    const h = headlines(state, bm.kind, res, r, hero, moments);
    addNews(state, { kind: 'info', title: `Titulky po zápase: ${h[0].title}`, text: h.slice(1).map((x) => `${x.paper}: ${x.title}`).join(' · '), fixtureId: bm.id.startsWith('eu-') ? undefined : bm.id });
    return;
  }
  const k = scale(state) * (bm.kind === 'derby' || bm.kind === 'evropa' ? 1.3 : 1);
  const jerseys = hero ? round(k * 240_000 * (hero.goals >= 2 ? 1.5 : 1), 1_000) : 0;
  s.pending = {
    id: bm.id,
    date: state.date,
    until: addDays(state.date, 2),
    kind: bm.kind,
    label: bm.label,
    result: res,
    score: r.score,
    opponentName: r.opponentName,
    opponentId: r.opponentId && state.clubs[r.opponentId] ? r.opponentId : undefined,
    headlines: headlines(state, bm.kind, res, r, hero, moments),
    hero,
    jerseys,
    moments,
  };
  s.lastPostMatch = state.date;
  if (res === 'V') setHashtag(state, bm.kind === 'derby' ? 'DerbyJeNaše' : bm.kind === 'evropa' ? `${tagOf(state)}VEvropě` : `${tagOf(state)}Slaví`);
}

function createTrophyStep(state: GameState, text: string): void {
  const s = ensure(state);
  if (s.pending) return;
  const top = [...squadOf(state, state.owner.clubId)].sort((a, b) => b.goals - a.goals)[0];
  const hero = top && top.goals > 0 ? { playerId: top.id, name: `${top.firstName} ${top.lastName}`, goals: top.goals } : undefined;
  const us = own(state).shortName;
  s.pending = {
    id: `trofej-${state.date}`,
    date: state.date,
    until: addDays(state.date, 2),
    kind: 'trofej',
    label: text,
    result: 'V',
    score: '',
    headlines: [
      { paper: PAPERS[0], title: `${text}!` },
      { paper: PAPERS[1], title: `Město slaví, ${us} píše historii` },
      { paper: PAPERS[2], title: hero ? `${hero.name}: ${plural(hero.goals, 'gól', 'góly', 'gólů')} v sezóně a teď i trofej` : 'Kotel: „Tohle si budeme pamatovat navždy.“' },
    ],
    hero,
    jerseys: hero ? round(scale(state) * 500_000, 1_000) : 0,
    moments: [],
  };
  setHashtag(state, `Šampioni${tagOf(state)}`);
}

/** Čeká majitele krok „Po zápase“ (po velkém zápase nebo trofeji)? */
export function pendingPostMatch(state: GameState): PostMatchPending | undefined {
  return state.social?.pending;
}

export interface PostMatchChoice {
  id: string;
  label: string;
  hint: string;
}

/** Volby kroku po zápase: co udělá majitel a jaký příspěvek klub zveřejní. */
export function postMatchOptions(state: GameState, p: PostMatchPending): { steps: PostMatchChoice[]; defaultStep: string; posts: PostMatchChoice[]; defaultPost: string } {
  const rival = !!p.opponentId;
  const k = state.social?.tone === 'kontroverzni' ? ' (váš kontroverzní tón: víc sledujících)' : '';
  if (p.result === 'P') {
    return {
      steps: [
        { id: 'kotel', label: 'Jít ke kotli vysvětlit', hint: 'Kotel +5, fanoušci +2. Po debaklu hrozí pískot (média −2).' },
        { id: 'odejit', label: 'Odejít bez komentáře', hint: 'Kotel −4, fanoušci −2, média −1.' },
      ],
      defaultStep: 'kotel',
      posts: [
        { id: 'podekovani', label: 'Díky za podporu, zvedneme se', hint: 'Fanoušci +2, sledující +1 %.' },
        { id: 'omluva', label: 'Omluva fanouškům', hint: 'Fanoušci +3, kotel +2, morálka týmu −1.' },
        { id: 'nic', label: 'Nic nepsat', hint: 'Fanoušci −1, sítě ovládnou kritici.' },
      ],
      defaultPost: 'podekovani',
    };
  }
  const win = p.result === 'V';
  return {
    steps: [
      { id: 'dekovacka', label: p.kind === 'trofej' ? 'Slavit s fanoušky na trávníku' : win ? 'Děkovačka s kotlem' : 'Poděkovat kotli', hint: win ? 'Kotel +6, fanoušci +3.' : 'Kotel +3, fanoušci +1.' },
      { id: 'kabina', label: win ? 'Oslava v kabině s hráči' : 'Za týmem do kabiny', hint: win ? 'Morálka týmu +4, důvěra trenéra +2.' : 'Morálka týmu +2.' },
    ],
    defaultStep: 'dekovacka',
    posts: [
      ...(win ? [{ id: 'oslava', label: 'Oslavný příspěvek', hint: 'Sledující +3 %, fanoušci +2.' }] : []),
      { id: 'podekovani', label: 'Poděkovat fanouškům', hint: 'Fanoušci +2, kotel +2, sponzoři +1.' },
      ...(rival ? [{ id: 'rypnuti', label: 'Rýpnout si do soupeře', hint: `Sledující +${win ? 6 : 3} %, fanoušci +${win ? 3 : 1}, rivalita +8, vztah s vedením soupeře −10, svaz −2${k}.` }] : []),
      { id: 'nic', label: 'Nic nepsat', hint: 'Bez dopadu.' },
    ],
    defaultPost: win ? 'oslava' : 'podekovani',
  };
}

function applyPostMatch(state: GameState, p: PostMatchPending, step: string, post: string, auto: boolean): string {
  const s = ensure(state);
  const us = own(state).shortName;
  const opts = postMatchOptions(state, p);
  const st = opts.steps.some((x) => x.id === step) ? step : opts.defaultStep;
  const po = opts.posts.some((x) => x.id === post) ? post : opts.defaultPost;
  const out: string[] = [];
  const win = p.result === 'V';
  // Krok majitele
  if (st === 'kotel') {
    changeUltras(state, 5);
    fans(state, 2);
    const heavy = /(\d+):(\d+)/.exec(p.score);
    const whistle = heavy && Math.abs(Number(heavy[1]) - Number(heavy[2])) >= 3 && roll(state, 'piskot') < 0.5;
    if (whistle) media(state, -2);
    out.push(whistle ? 'U kotle vás vypískali, ale vztah s fanklubem se zlepšil.' : 'Kotel ocenil, že jste se nebáli přijít.');
  } else if (st === 'odejit') {
    changeUltras(state, -4);
    fans(state, -2);
    media(state, -1);
    out.push('Odchod bez komentáře fanoušky naštval.');
  } else if (st === 'dekovacka') {
    changeUltras(state, win ? 6 : 3);
    fans(state, win ? 3 : 1);
    out.push(win ? 'Děkovačka s kotlem: fotky obletěly sítě.' : 'Kotel poděkování ocenil.');
  } else {
    teamMorale(state, win ? 4 : 2);
    if (win) state.owner.trust.trener = clamp(state.owner.trust.trener + 2, 0, 100);
    out.push(win ? 'Oslava v kabině stmelila tým.' : 'Hráči ocenili, že jste za nimi stáli.');
  }
  // Dresy hrdiny
  if (p.jerseys > 0 && p.hero) {
    book(state, state.owner.clubId, 'fanshop', p.jerseys, `Dresy hrdiny: ${p.hero.name}`);
    out.push(`Dresy hrdiny (${p.hero.name}) vynesly ${mil(p.jerseys)}.`);
  }
  // Příspěvek
  const opp = p.opponentName ?? 'soupeř';
  if (po === 'oslava') {
    grow(state, 0.03);
    fans(state, 2);
    addPost(state, us, p.kind === 'trofej' ? `🏆 ${p.label}! Děkujeme všem, kdo s námi věřili. ${trendingHashtag(state) ?? ''}`.trim() : `VÍTĚZSTVÍ! ${p.score} 💪 ${trendingHashtag(state) ?? ''}`.trim(), 'pos', 1.6);
  } else if (po === 'podekovani') {
    grow(state, 0.01);
    fans(state, 2);
    if (p.result !== 'P') {
      changeUltras(state, 2);
      for (const c of own(state).sponsors ?? []) changeSponsorRelation(state, c.slot, 1);
    }
    addPost(state, us, p.result === 'P' ? `Díky, že jste s námi i v těžkých chvílích. Zvedneme se. (${p.score})` : `Díky za neskutečnou podporu! ${p.score}`, p.result === 'P' ? 'mix' : 'pos', 1.1);
  } else if (po === 'omluva') {
    fans(state, 3);
    changeUltras(state, 2);
    teamMorale(state, -1);
    addPost(state, us, `Omlouváme se. Takhle se reprezentovat nechceme. (${p.score})`, 'mix', 1.2);
  } else if (po === 'rypnuti') {
    const bonus = state.social?.tone === 'kontroverzni' ? 1.5 : 1;
    grow(state, (win ? 0.06 : 0.03) * bonus);
    fans(state, win ? 3 : 1);
    league(state, -2);
    if (p.opponentId) touchRival(state, p.opponentId, -10, 8, 'rýpnutí na sítích po zápase');
    setHashtag(state, win ? `${tagOf(state)}Vládne` : 'PříštěUvidíte');
    addPost(state, us, win ? `${opp}? Tak zase příště 😉 ${p.score}` : `Body napůl, ale hlasitější jsme byli my. ${p.score}`, 'mix', 2);
    out.push('Rýpnutí se šíří sítěmi, vedení soupeře zuří.');
  } else {
    if (p.result === 'P') fans(state, -1);
  }
  s.pending = undefined;
  if (state.bigMatch && state.bigMatch.id === p.id) state.bigMatch.after = { ...(state.bigMatch.after ?? {}), krok: st, prispevek: po };
  const label = opts.steps.find((x) => x.id === st)?.label ?? st;
  const postLabel = opts.posts.find((x) => x.id === po)?.label ?? po;
  addNews(state, {
    kind: 'info',
    title: `Po zápase: ${p.headlines[0].title}`,
    text: `${auto ? 'Bez rozhodnutí platí výchozí volby. ' : ''}${label}; příspěvek: ${postLabel}. ${out.join(' ')} Titulky: ${p.headlines.map((h) => h.title).join(' · ')}.`,
    fixtureId: p.id.startsWith('trofej') || p.id.startsWith('eu-') ? undefined : p.id,
  });
  return out.join(' ');
}

/** Potvrzení kroku po zápase (bez volby platí výchozí). */
export function resolvePostMatch(prev: GameState, step?: string, post?: string): ActionResult {
  const p = pendingPostMatch(prev);
  if (!p) return { state: prev, ok: false, message: 'Krok po zápase už není aktuální.' };
  const state = structuredClone(prev);
  const message = applyPostMatch(state, state.social!.pending!, step ?? '', post ?? '', false);
  return { state, ok: true, message };
}

// ---------- Situace ze sítí ----------

function canAsk(state: GameState, template: string): boolean {
  return !state.owner.ousted && !state.gameOver && state.events.length < 4 && !state.events.some((e) => e.template === template);
}

function pushEvent(state: GameState, template: string, body: Omit<GameEvent, 'id' | 'template' | 'date'>, info: NonNullable<SocialState['eventInfo']>[string]): GameEvent {
  const event: GameEvent = { ...body, id: `e${++state.nextId}`, template, date: state.date };
  state.events.push(event);
  state.eventLog ??= {};
  state.eventLog[template] = state.date;
  const s = ensure(state);
  s.eventInfo = { ...(s.eventInfo ?? {}), [event.id]: info };
  return event;
}

const KAUZA_TITLE: Record<string, string> = {
  ceny: 'Sítě zuří kvůli cenám vstupenek',
  derby: 'Po derby se na sítích valí kritika',
  prodej: 'Fanoušci na sítích kritizují prodej opory',
  jine: 'Vlna kritiky na sítích',
};

/**
 * Vlna kritiky na sítích (nejvýš jednou za 6 týdnů). Správce sítí ji uhasí sám rozumnou odpovědí.
 * Mohou ji volat i jiné moduly (např. po zdražení lístků na velký zápas).
 */
export function backlash(state: GameState, reason: 'ceny' | 'derby' | 'prodej' | 'jine', text: string): boolean {
  const s = ensure(state);
  if (s.lastScandal && addDays(s.lastScandal, 42) > state.date) return false;
  if (state.owner.ousted || state.gameOver) return false;
  s.lastScandal = state.date;
  setHashtag(state, reason === 'ceny' ? 'DrahýFotbal' : reason === 'prodej' ? 'PročHoProdali' : 'ChcemeOdpovědi');
  addPost(state, '@fanousci', text, 'neg', 2);
  const ab = socialManager(state);
  if (ab !== undefined) {
    const msg = resolveKauza(state, reason, 'vysvetlit', ab);
    addNews(state, { kind: 'info', title: `${KAUZA_TITLE[reason]}: správce sítí to vyřešil`, text: `${text} Správce sítí rychle zveřejnil vysvětlení. ${msg}` });
    return true;
  }
  if (!canAsk(state, 'social-kauza')) {
    fans(state, -2);
    media(state, -1);
    addNews(state, { kind: 'varovani', title: KAUZA_TITLE[reason], text: `${text} Nikdo nereagoval, kritika sama vyšuměla. Fanoušci −2, média −1.` });
    return true;
  }
  pushEvent(
    state,
    'social-kauza',
    {
      expires: addDays(state.date, 7),
      title: KAUZA_TITLE[reason],
      text: `${text} Trenduje ${trendingHashtag(state)}. Jak zareagujete?`,
      defaultOption: 'vysvetlit',
      options: [
        { id: 'omluvit', label: 'Omluvit se', hint: 'Fanoušci +4, kotel +3, média −1 (vypadá to jako slabost).' },
        { id: 'vysvetlit', label: 'Vysvětlit rozhodnutí', hint: 'Většinou zabere: fanoušci +1, média +2. Když ne, fanoušci −2.' },
        { id: 'ignorovat', label: 'Ignorovat', hint: 'Fanoušci −5, kotel −4, média −2. Kauza aspoň přivede pár zvědavých sledujících.' },
      ],
    },
    { reason },
  );
  return true;
}

function resolveKauza(state: GameState, reason: string, option: string, manager?: number): string {
  if (option === 'omluvit') {
    fans(state, 4);
    changeUltras(state, reason === 'ceny' ? 5 : 3);
    media(state, -1);
    addPost(state, own(state).shortName, 'Slyšíme vás. Omlouváme se a bereme si to k srdci.', 'mix', 1.3);
    return 'Omluva uklidnila fanoušky, novináři píší o ústupku.';
  }
  if (option === 'ignorovat') {
    fans(state, -5);
    changeUltras(state, -4);
    media(state, -2);
    grow(state, 0.01);
    return 'Mlčení fanoušky rozzuřilo, kritika vydržela dlouho.';
  }
  const good = roll(state, `kauza-${reason}`) < (manager !== undefined ? 0.65 + manager / 400 : 0.65);
  if (good) {
    fans(state, 1);
    media(state, 2);
  } else fans(state, -2);
  addPost(state, own(state).shortName, reason === 'ceny' ? 'Proč se mění ceny? Vysvětlujeme, kam peníze jdou.' : reason === 'prodej' ? 'K odchodu opory: proč jsme se tak rozhodli.' : 'Rozumíme zklamání. Tady je náš pohled.', good ? 'mix' : 'neg', 1.2);
  return good ? 'Vysvětlení zabralo, kritika opadla.' : 'Vysvětlení nepřesvědčilo, fanoušci dál remcají.';
}

const PLAYER_TOPICS = [
  { id: 'party', text: 'zveřejnil fotku z večírku den před zápasem', anon: 'Fotka hráče z večírku den před zápasem' },
  { id: 'souper', text: 'na sítích zesměšnil soupeře', anon: 'Hráč A-týmu na sítích zesměšnil soupeře' },
  { id: 'trener', text: 'si na sítích postěžoval na málo minut', anon: 'Hráč A-týmu si na sítích postěžoval na málo minut' },
  { id: 'sazky', text: 'propagoval pochybnou sázkovou aplikaci', anon: 'Hráč A-týmu propagoval pochybnou sázkovou aplikaci' },
];

function maybePlayerPost(state: GameState): void {
  const s = ensure(state);
  const month = Number(state.date.slice(5, 7));
  if (month === 6 || !canAsk(state, 'social-hrac')) return;
  const pp = s.playerPosts?.season === state.season ? s.playerPosts : { season: state.season, count: 0 };
  if (pp.count >= 2 || (pp.last && addDays(pp.last, 45) > state.date)) return;
  const chance = socialManager(state) !== undefined ? 1 / 350 : 1 / 220;
  if (roll(state, 'hrac') >= chance) return;
  const squad = squadOf(state, state.owner.clubId);
  if (squad.length < 12) return;
  const young = [...squad].sort((a, b) => b.birthYear - a.birthYear || a.id.localeCompare(b.id)).slice(0, 10);
  const p: Player = young[Math.floor(roll(state, 'hrac-kdo') * young.length)];
  const topic = PLAYER_TOPICS[Math.floor(roll(state, 'hrac-co') * PLAYER_TOPICS.length)];
  // Se skutečnými soupiskami příspěvek nikomu jménem nepřipisujeme.
  const anonymous = !!state.realRosters;
  const who = anonymous ? topic.anon : `${p.firstName} ${p.lastName} ${topic.text}`;
  s.playerPosts = { season: state.season, count: pp.count + 1, last: state.date };
  addPost(state, anonymous ? 'hráč A-týmu' : `${p.firstName} ${p.lastName}`, anonymous ? `${topic.anon} (příspěvek už je smazaný).` : `Příspěvek: ${topic.text} (už smazaný).`, 'neg', 1.5);
  pushEvent(
    state,
    'social-hrac',
    {
      expires: addDays(state.date, 7),
      title: anonymous ? 'Nevhodný příspěvek hráče' : `Nevhodný příspěvek: ${p.firstName} ${p.lastName}`,
      text: `${who}. Příspěvek je smazaný, ale snímky obrazovky kolují. Kabina i fanoušci čekají, co uděláte.`,
      playerId: anonymous ? undefined : p.id,
      defaultOption: 'promluvit',
      options: [
        { id: 'potrestat', label: 'Potrestat pokutou', hint: 'Fanoušci +2, média +2, kabina +1 (pravidla platí). Morálka hráče −12.' },
        { id: 'podrzet', label: 'Podržet hráče', hint: 'Morálka hráče +8, kabina +2. Fanoušci −3, média −3.' },
        { id: 'promluvit', label: 'Promluvit si v soukromí', hint: 'Morálka hráče −3, média −1. Bez většího rozruchu.' },
      ],
    },
    { playerId: p.id, anonymous, topic: topic.id },
  );
}

function resolvePlayerPost(state: GameState, info: { playerId?: string; topic?: string }, option: string): string {
  const p = info.playerId ? state.players[info.playerId] : undefined;
  const morale = (d: number) => {
    if (p) p.morale = clamp(p.morale + d, 0, 100);
  };
  if (option === 'potrestat') {
    morale(-12);
    teamMorale(state, 1);
    fans(state, 2);
    media(state, 2);
    return 'Pokuta ukázala, že pravidla platí pro všechny.';
  }
  if (option === 'podrzet') {
    morale(8);
    teamMorale(state, 2);
    fans(state, -3);
    media(state, -3);
    if (info.topic === 'souper') league(state, -1);
    return 'Kabina oceňuje, že stojíte za hráči. Fanoušci a média méně.';
  }
  morale(-3);
  media(state, -1);
  return 'Rozhovor v soukromí, téma rychle vyšumělo.';
}

function bigSigning(state: GameState, playerId: string, name: string, fee: number): void {
  if (!canAsk(state, 'social-posila')) return;
  const sc = scale(state);
  const cost = round(sc * 120_000);
  const agent = agentOf(state, playerId);
  const leak = Math.round(leakChance(state, playerId) * 100);
  pushEvent(
    state,
    'social-posila',
    {
      expires: addDays(state.date, 5),
      title: `Jak ohlásit posilu: ${name}`,
      text: `${name} podepsal${fee > 0 ? ` (${mil(fee)})` : ''}. Velký přestup si zaslouží velké ohlášení. Agent ${agent.name} ale o dohodě ví.`,
      playerId,
      amount: cost,
      defaultOption: 'zprava',
      options: [
        { id: 'video', label: `Video s odpočtem (${mil(cost)})`, hint: `Zájem o dresy a permanentky, fanoušci +3, sledující +4 %. Riziko úniku přes agenta ${leak} % (pak jen polovina efektu).` },
        { id: 'zprava', label: 'Běžná tisková zpráva', hint: 'Fanoušci +1, sledující +1 %, malý zájem o dresy.' },
      ],
    },
    { playerId, fee },
  );
}

function leakChance(state: GameState, playerId: string): number {
  const a = agentOf(state, playerId);
  return clamp((a.style === 'chamtivy' ? 0.35 : 0.15) + (50 - a.relation) / 250, 0.05, 0.6);
}

function resolveSigning(state: GameState, e: GameEvent, info: { playerId?: string }, option: string): string {
  const sc = scale(state);
  const p = info.playerId ? state.players[info.playerId] : undefined;
  const name = p ? `${p.firstName} ${p.lastName}` : 'nová posila';
  const us = own(state).shortName;
  if (option === 'video') {
    book(state, state.owner.clubId, 'ostatni', -(e.amount ?? 0), `Video s ohlášením posily: ${name}`);
    const leaked = roll(state, `leak-${e.id}`) < leakChance(state, info.playerId ?? '');
    const k = leaked ? 0.5 : 1;
    book(state, state.owner.clubId, 'fanshop', round(sc * 500_000 * k, 1_000), `Dresy nové posily: ${name}`);
    book(state, state.owner.clubId, 'vstupne', round(sc * 300_000 * k, 1_000), 'Permanentky po ohlášení posily');
    fans(state, leaked ? 1 : 3);
    grow(state, leaked ? 0.02 : 0.04);
    setHashtag(state, `Vítej${tagOf(state)}`);
    addPost(state, us, `3… 2… 1… Vítej, ${name}! 🎬`, 'pos', leaked ? 1 : 2.2);
    if (leaked) {
      if (info.playerId) changeAgentRelation(state, info.playerId, -6);
      media(state, -1);
      return `Agent informaci vyzradil novinářům den před premiérou videa. Efekt poloviční, vztah s agentem se zhoršil.`;
    }
    return 'Video s odpočtem sledovaly desítky tisíc lidí. Dresy i permanentky jdou na dračku.';
  }
  book(state, state.owner.clubId, 'fanshop', round(sc * 120_000, 1_000), `Dresy nové posily: ${name}`);
  fans(state, 1);
  grow(state, 0.01);
  addPost(state, us, `Novou posilou je ${name}. Vítej!`, 'pos', 1);
  return 'Klasické ohlášení, fanoušci posilu přivítali.';
}

/** Šablony situací ze sítí (vznikají jen z háčku dailySocial). */
export function socialTemplates() {
  const none = { weight: () => 0, create: () => null };
  const take = (s: GameState, e: GameEvent) => {
    const info = s.social?.eventInfo?.[e.id] ?? {};
    if (s.social?.eventInfo) delete s.social.eventInfo[e.id];
    return info;
  };
  return {
    'social-kauza': { ...none, resolve: (s: GameState, e: GameEvent, o: string) => resolveKauza(s, take(s, e).reason ?? 'jine', o) },
    'social-hrac': { ...none, resolve: (s: GameState, e: GameEvent, o: string) => resolvePlayerPost(s, take(s, e), o) },
    'social-posila': { ...none, resolve: (s: GameState, e: GameEvent, o: string) => resolveSigning(s, e, take(s, e), o) },
  };
}

// ---------- Denní a měsíční háček ----------

function todaysResults(state: GameState): OwnResult[] {
  const ownId = state.owner.clubId;
  const out: OwnResult[] = [];
  for (const { fixture: f } of allFixtures(state)) {
    if (f.date === state.date && f.result && (f.homeId === ownId || f.awayId === ownId)) {
      const r = fixtureResult(state, f.id);
      if (r) out.push(r);
    }
  }
  for (const m of europeRun(state)?.matches ?? []) {
    if (m.date === state.date && m.result) {
      const r = euroResult(state, m.id);
      if (r) out.push(r);
    }
  }
  return out;
}

function checkTransfers(state: GameState): void {
  const s = ensure(state);
  const ownId = state.owner.clubId;
  const since = addDays(state.date, -3);
  const seen = new Set(s.transfersSeen ?? []);
  const fresh = (state.transferLog ?? []).filter((t) => t.date >= since && (t.toId === ownId || t.fromId === ownId) && !seen.has(`${t.playerId}-${t.date}`));
  if (!fresh.length) return;
  s.transfersSeen = [...fresh.map((t) => `${t.playerId}-${t.date}`), ...(s.transfersSeen ?? [])].slice(0, 30);
  const sc = scale(state);
  const squad = squadOf(state, ownId);
  for (const t of fresh) {
    const others = squad.filter((p) => p.id !== t.playerId).map((p) => p.overall).sort((a, b) => b - a);
    const third = others[2] ?? 0;
    const p = state.players[t.playerId];
    if (t.toId === ownId && t.kind !== 'hostovani' && p?.clubId === ownId && ((t.overall ?? 0) >= third || t.fee >= sc * 8_000_000)) {
      bigSigning(state, t.playerId, t.playerName, t.fee);
    } else if (t.fromId === ownId && t.toId !== FREE && (t.kind === 'prestup' || t.kind === 'zahranici') && ((t.overall ?? 0) >= third || t.fee >= sc * 10_000_000) && roll(state, `prodej-${t.playerId}`) < 0.6) {
      backlash(state, 'prodej', `Fanoušci nesou těžce odchod hráče ${t.playerName} (${t.toName}).`);
    }
  }
}

function checkPrices(state: GameState): void {
  const s = ensure(state);
  const club = own(state);
  const price = club.policy.ticketPrice;
  const last = s.lastPrice;
  s.lastPrice = price;
  if (last === undefined || price <= last * 1.15) return;
  if (price > defaultTicketPrice(tierOf(state, club.id)) * 1.1 && roll(state, 'ceny') < 0.7) backlash(state, 'ceny', `Klub zdražil vstupné na ${price.toLocaleString('cs-CZ')} Kč. Fanoušci mluví o zradě obyčejných lidí.`);
}

const ROUTINE_POSTS = ['Zákulisí tréninku: dnes se makalo 💪', 'Mládež klubu zase o krok dál. Jsme hrdí!', 'Nová kolekce ve fanshopu je venku.', 'Pozvánka na další domácí zápas. Přijďte nás hnát!', 'Hráči navštívili dětské oddělení nemocnice.', 'Den v kabině: kdo je největší vtipálek týmu?'];

function monthlySocial(state: GameState): void {
  const s = ensure(state);
  const club = own(state);
  const ab = socialManager(state);
  const recent = s.posts.filter((p) => addDays(p.date, 31) >= state.date).length;
  const mood = (club.fanMood - 50) / 50;
  const rate = 0.004 + mood * 0.008 + TONE_GROWTH[s.tone] + (ab !== undefined ? Math.max(0, ab - 30) * 0.00015 : 0) + Math.min(5, recent) * 0.001;
  grow(state, rate);
  const target = 18 + TONE_REACH[s.tone] + (ab !== undefined ? ab / 5 : 0) + Math.min(10, recent * 2);
  s.reach = clamp(Math.round(s.reach + (target - s.reach) * 0.4), 5, 85);
  const income = Math.round((s.followers * (s.reach / 100) * 2.5) / 1000) * 1000;
  s.lastIncome = income;
  if (income >= 1000) book(state, club.id, 'fanshop', income, 'Sociální sítě: e-shop a partnerské příspěvky');
  if (s.tone === 'profesionalni') for (const c of club.sponsors ?? []) changeSponsorRelation(state, c.slot, 1);
  else if (s.tone === 'sympaticky') {
    fans(state, 1);
    changeCity(state, 1);
  } else {
    league(state, -1);
    changeUltras(state, 1);
    for (const c of club.sponsors ?? []) changeSponsorRelation(state, c.slot, -1);
    for (const r of topRivals(state, 2)) touchRival(state, r.clubId, -3, 2);
  }
  if (ab !== undefined) {
    for (let i = 0; i < 2; i++) addPost(state, 'správce sítí', ROUTINE_POSTS[Math.floor(roll(state, `rutina${i}`) * ROUTINE_POSTS.length)], 'pos', 0.8);
  }
  s.history = [...s.history, { date: state.date, followers: s.followers }].slice(-12);
  const prev = s.history.length > 1 ? s.history[s.history.length - 2].followers : 0;
  for (const mark of [25_000, 50_000, 100_000, 250_000, 500_000]) {
    if (prev > 0 && prev < mark && s.followers >= mark) {
      addNews(state, { kind: 'info', title: `Sítě klubu: ${mark.toLocaleString('cs-CZ')} sledujících!`, text: 'Větší dosah znamená víc peněz z e-shopu a zájem partnerů.' });
      addPost(state, club.shortName, `Je nás ${mark.toLocaleString('cs-CZ')}! Děkujeme ❤️`, 'pos', 1.5);
    }
  }
}

/** Doplní volné kandidáty na správce sítí (role je nová, starší hry je nemají). */
function ensureCandidates(state: GameState): void {
  const free = Object.values(state.staff).filter((x) => x.role === 'site' && x.clubId === FREE).length;
  if (free >= 4) return;
  const rng = createRng(Math.floor(hash01(`${state.seed}-${state.date}-spravce`) * 2 ** 31));
  for (let i = free; i < 5; i++) {
    const st = generateStaff(rng, state, 'site', rng.int(30, 85), FREE);
    state.staff[st.id] = st;
  }
}

/** Denní háček (po zápasech dne): paměť rivality, krok po zápase, kauzy, příspěvky, měsíční vývoj. */
export function dailySocial(state: GameState): void {
  if (state.gameOver) return;
  const s = ensure(state);
  const today = todaysResults(state);
  for (const r of today) recordRivalry(state, r);
  // Série porážek rozjede kritiku na sítích.
  if (today.some((r) => outcome(r) === 'P')) {
    const comp = competitionOf(state, state.owner.clubId);
    const form = comp ? computeTable(comp, state).find((x) => x.clubId === state.owner.clubId)?.form ?? [] : [];
    if (form.length >= 4 && form.slice(-4).every((f) => f === 'P') && roll(state, 'serie') < 0.5) backlash(state, 'jine', 'Čtyři porážky v řadě. Na sítích se množí výzvy k odchodu trenéra i vedení.');
  }
  // Velký zápas, který se hrál dnes.
  const bm = s.watch && s.watch.date === state.date ? s.watch : undefined;
  if (bm && !s.pending) {
    const r = ownResult(state, bm.id);
    if (r) createPostMatch(state, bm, r);
  }
  if (!s.pending && state.bigMatch && state.bigMatch.date === state.date && bm?.id !== state.bigMatch.id) {
    const r = ownResult(state, state.bigMatch.id);
    if (r) createPostMatch(state, { id: r.id, date: state.date, kind: state.bigMatch.kind as BigMatchKind, home: r.home, opponentName: r.opponentName, opponentId: r.opponentId, label: r.opponentName, competition: r.comp }, r);
  }
  // Trofeje a postupy
  const trophies = (state.trophies ?? []).filter((t) => t.clubId === state.owner.clubId && ['titul', 'pohar', 'postup', 'evropa'].includes(t.kind));
  if (s.trophiesSeen === undefined) s.trophiesSeen = trophies.length;
  else if (trophies.length > s.trophiesSeen) {
    s.trophiesSeen = trophies.length;
    createTrophyStep(state, trophies[trophies.length - 1].text);
  }
  checkTransfers(state);
  checkPrices(state);
  maybePlayerPost(state);
  if (s.pending && s.pending.until <= state.date) applyPostMatch(state, s.pending, '', '', true);
  if (state.date.endsWith('-01')) monthlySocial(state);
  ensureCandidates(state);
  s.watch = upcomingBigMatch(state, 1);
}

/** Tón komunikace na sítích (měsíční dopady viz TONE_LABEL). */
export function setSocialTone(prev: GameState, tone: SocialTone): ActionResult {
  if (socialOf(prev).tone === tone) return { state: prev, ok: true, message: '' };
  const state = structuredClone(prev);
  ensure(state).tone = tone;
  return { state, ok: true, message: `Tón na sítích: ${TONE_LABEL[tone].label}. Projeví se při měsíčním vývoji.` };
}

/** Přehled pro kartu Sociální sítě. */
export function socialSummary(state: GameState) {
  const s = socialOf(state);
  const prev = s.history.length ? s.history[s.history.length - 1].followers : s.followers;
  const ab = socialManager(state);
  const income = s.lastIncome ?? Math.round((s.followers * (s.reach / 100) * 2.5) / 1000) * 1000;
  return {
    followers: s.followers,
    change: s.followers - prev,
    reach: s.reach,
    tone: s.tone,
    income,
    manager: ab,
    hashtag: trendingHashtag(state),
    posts: s.posts.slice(0, 5),
    sponsorEffect: s.tone === 'profesionalni' ? 1 : s.tone === 'kontroverzni' ? -1 : 0,
  };
}
