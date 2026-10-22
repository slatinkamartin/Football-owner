import { addDays, dayOfWeek, formatShortDate } from './calendar';
import { freshOwnMatch, goalsAgainstLast, lastAwayWin, playerSpell, type OwnMatchFacts, type SeasonFacts } from './facts';
import { handleOf, lastName, seasonFactsCached, vMin, ordWin, pickVoices, sinceMonth, type Persona } from './fanvoice';
import { media } from './grey';
import { playerAge, squadOf } from './players';
import { coachOf, goalLabel, goalTarget, type ActionResult } from './staff';
import { changeUltras } from './surroundings';
import type { GameState, Player } from './types';
import { addNews, clamp, competitionOf, hash01, plural, transferWindow } from './world';
import { addPromise, type PromiseInput } from './situations';

/**
 * R2: fanouškovské fórum. Vlákna vznikají a vyvíjejí se jen z dat hry (minuty mladých, posila bez gólu,
 * série venku, chyby brankáře, série bez výhry, odchod opory, sucho střelce, tabulka). Každé vlákno má
 * náladu, počet příspěvků a poslední komentáře vymyšlených fanoušků. Majitel může do vlákna jednou
 * odpovědět (uklidnit / slíbit / razantně) s dopadem na data; slib se registruje jako slib majitele.
 * Běží jen v den zápasu klubu a v pondělí, nejvýš 4 otevřená vlákna.
 */

export type ForumTopic = 'mladi' | 'posila' | 'venku' | 'brankar' | 'trener' | 'chvala' | 'odchod' | 'tabulka' | 'strelec';

export interface ForumPost {
  /** Vymyšlená přezdívka fanouška, nebo „Majitel klubu“. */
  name: string;
  persona: Persona | 'majitel';
  text: string;
  date: string;
}

export interface ForumThread {
  id: string;
  /** Klíč tématu (např. „strelec-p123“) – jedno vlákno na téma. */
  key: string;
  topic: ForumTopic;
  title: string;
  opened: string;
  updated: string;
  /** Nálada vlákna 0–100 (0 = bouře, 100 = nadšení). */
  mood: number;
  posts: number;
  /** Poslední příspěvky, nejnovější první (max 5). */
  last: ForumPost[];
  subjectId?: string;
  subjectName?: string;
  /** Jak moc téma hoří (pořadí a vytlačování méně žhavých vláken). */
  heat: number;
  /** Otisk faktů z poslední aktualizace (bez nových faktů se vlákno nemění). */
  fingerprint: string;
  /** Odpověď majitele (nejvýš jedna na vlákno). */
  reply?: { option: ReplyId; date: string; text: string; promise?: boolean };
  closed?: string;
  /** Jak téma skončilo (pro navazující příběhy). */
  resolution?: string;
}

export interface ForumState {
  threads: ForumThread[];
  /** Uzavřená vlákna (posledních 12) pro navazující příběhy. */
  archive: ForumThread[];
}

export type ReplyId = 'uklidnit' | 'slib' | 'razantne';

/** Slib z fóra = slib majitele přes R1 (engine/situations.ts). */
export type ForumPromise = PromiseInput;

export interface ReplyOption {
  id: ReplyId;
  label: string;
  /** Co majitel napíše do vlákna. */
  text: string;
  hint: string;
  promise?: ForumPromise;
}

const MAX_OPEN = 4;

// ---------- Pomocné ----------

const own = (s: GameState) => s.clubs[s.owner.clubId];
const pname = (p: Pick<Player, 'firstName' | 'lastName'>) => `${p.firstName} ${p.lastName}`;
const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;
const gwords = (n: number) => plural(n, 'gól', 'góly', 'gólů');
const mwords = (n: number) => plural(n, 'zápas', 'zápasy', 'zápasů');

function ensure(state: GameState): ForumState {
  state.forum ??= { threads: [], archive: [] };
  return state.forum;
}

/** Nálada vlákna slovy. */
export function forumMoodLabel(mood: number): { label: string; tone: 'bad' | 'warn' | 'neutral' | 'good' } {
  if (mood < 25) return { label: 'bouře', tone: 'bad' };
  if (mood < 45) return { label: 'kritická', tone: 'bad' };
  if (mood < 60) return { label: 'rozpačitá', tone: 'warn' };
  if (mood < 75) return { label: 'klidná', tone: 'neutral' };
  return { label: 'nadšená', tone: 'good' };
}

/** Konec nejbližšího (nebo právě otevřeného) přestupního okna. */
function windowEnd(date: string): string {
  const y = Number(date.slice(0, 4));
  const md = date.slice(5);
  const w = transferWindow(date);
  if (w === 'leto') return `${y}-08-31`;
  if (w === 'zima') return `${y}-02-14`;
  return md < '07-01' ? `${y}-08-31` : `${y + 1}-02-14`;
}

/** Konec aktuální části sezóny (podzim / jaro). */
function halfEnd(state: GameState): { until: string; label: string } {
  const m = Number(state.date.slice(5, 7));
  return m >= 7 ? { until: `${state.season}-12-15`, label: 'do konce podzimu' } : { until: `${state.season + 1}-05-31`, label: 'do konce sezóny' };
}

// ---------- Kandidáti vláken z faktů ----------

type Lines = Partial<Record<Persona, string[]>>;

interface Candidate {
  key: string;
  topic: ForumTopic;
  title: string;
  /** Nálada, ke které vlákno směřuje. */
  target: number;
  heat: number;
  fingerprint: string;
  lines: Lines;
  subjectId?: string;
  subjectName?: string;
}

const POS_TO: Record<string, string> = { GK: 'do brány', DF: 'do obrany', MF: 'do záložní řady', FW: 'do útoku' };

function candidates(state: GameState, s: SeasonFacts, m: OwnMatchFacts | undefined): Candidate[] {
  const ownId = state.owner.clubId;
  const squad = squadOf(state, ownId);
  const out: Candidate[] = [];
  const coach = coachOf(state, ownId);
  const coachName = coach ? pname(coach) : 'trenér';

  // Trenér ven? (4+ zápasů bez výhry)
  if (s.winless >= 4) {
    out.push({
      key: 'trener',
      topic: 'trener',
      title: coach ? `Trenér ${coachName} ven?` : 'Trenér ven?',
      target: clamp(30 - (s.winless - 4) * 5, 5, 40),
      heat: 85 + s.winless,
      fingerprint: `w${s.winless}`,
      lines: {
        statistik: [`${mwords(s.winless)} bez výhry, skóre posledních tří ${s.last3.gf}:${s.last3.ga}${s.position ? `, ${s.position}. místo` : ''}.`],
        kritik: m?.earlySub ? [`Střídání už ${vMin(m.earlySub.minute)}? Trenér sám neví, co chce.`] : ['Taktika žádná, střídání pozdě. Je čas na změnu.', `${mwords(s.winless)} bez výhry. Jinde by už trenér balil.`],
        optimista: ['Výměna trenéra uprostřed sezóny nic neřeší. Věřím mu.', 'Kabina za trenérem stojí, to je vidět.'],
        ultras: ['Chceme vidět bojovnost. Kotel čeká odpověď na hřišti.', `${mwords(s.winless)} bez výhry. Kotel už ztrácí trpělivost.`],
        pametnik: ['Trenérů jsem tu viděl dvacet. Vydrželi ti, co dostali čas.'],
      },
    });
  }
  // Věříme trenérovi (4+ výher v řadě)
  if (s.streak.kind === 'V' && s.streak.length >= 4) {
    out.push({
      key: 'chvala',
      topic: 'chvala',
      title: coach ? `Trenér ${coachName}: věříme mu!` : 'Věříme trenérovi!',
      target: clamp(78 + s.streak.length * 2, 0, 95),
      heat: 40 + s.streak.length,
      fingerprint: `v${s.streak.length}`,
      lines: {
        statistik: [`${ordWin(s.streak.length)}${s.position ? `, ${s.position}. místo` : ''}.`],
        optimista: ['Konečně trenér, co ví, jak na to.', 'Tahle parta má něco navíc.'],
        ultras: [`${coach ? lastName(coachName) : 'Trenére'}, kotel za tebou stojí!`],
        kritik: ['Nohy na zemi. Ještě jsme nic nevyhráli.'],
        pametnik: [`${ordWin(s.streak.length)}? Tohle tu dlouho nebylo.`],
      },
    });
  }
  // Brankář musí ven? (2 slabé známky po sobě)
  if (s.shakyKeeper) {
    const gk = state.players[s.shakyKeeper.playerId];
    const backup = squad.filter((p) => p.position === 'GK' && p.id !== s.shakyKeeper!.playerId).sort((a, b) => b.overall - a.overall)[0];
    const ln = lastName(s.shakyKeeper.name);
    const r = (gk?.recent ?? []).slice(-2).map((x) => x.toLocaleString('cs-CZ', { maximumFractionDigits: 1 }));
    const ga = goalsAgainstLast(state, 2);
    out.push({
      key: `brankar-${s.shakyKeeper.playerId}`,
      topic: 'brankar',
      title: 'Brankář musí ven?',
      target: 30,
      heat: 70,
      fingerprint: `${r.join('-')}-${ga}`,
      subjectId: s.shakyKeeper.playerId,
      subjectName: s.shakyKeeper.name,
      lines: {
        statistik: [`${ln}: poslední známky ${r.join(' a ')}, ve dvou zápasech ${plural(ga, 'inkasovaný gól', 'inkasované góly', 'inkasovaných gólů')}.`],
        kritik: [backup ? `Dva slabé zápasy po sobě. Ať chytá ${lastName(pname(backup))}.` : 'Dva slabé zápasy po sobě a pořádnou dvojku nemáme.'],
        optimista: [`Každý gólman má horší období. ${ln} nás už mnohokrát podržel.`],
        ultras: [`${ln}, hlavu nahoru, kotel za tebou stojí.`],
        pametnik: ['Gólman po chybě musí chytat dál a vrátit to. Tak to bylo vždycky.'],
      },
    });
  }
  // Nová posila zatím nic
  const since = addDays(state.date, -150);
  const signings = (state.transferLog ?? []).filter((t) => t.toId === ownId && t.kind !== 'odchod' && t.date >= since && state.players[t.playerId]?.clubId === ownId);
  const posilaIds = new Set<string>();
  for (const t of signings) {
    const p = state.players[t.playerId];
    const sp = playerSpell(state, t.playerId, t.date);
    const flop = sp.apps >= 5 && ((p.position === 'FW' && sp.goals === 0) || (sp.avgRating !== undefined && sp.avgRating < 6.2));
    if (!flop) continue;
    posilaIds.add(p.id);
    const ln = p.lastName;
    out.push({
      key: `posila-${p.id}`,
      topic: 'posila',
      title: `Nová posila ${pname(p)} zatím nic`,
      target: 35,
      heat: 55 + (t.fee > 0 ? 5 : 0),
      fingerprint: `${sp.apps}-${sp.goals}`,
      subjectId: p.id,
      subjectName: pname(p),
      lines: {
        statistik: [`${ln} od příchodu: ${mwords(sp.apps)}, ${gwords(sp.goals)}${sp.avgRating !== undefined ? `, průměrná známka ${sp.avgRating.toLocaleString('cs-CZ')}` : ''}.`],
        kritik: [t.fee > 0 ? `${mil(t.fee)} a tohle? ${mwords(sp.apps)}${sp.goals === 0 ? ' bez gólu' : ''}.` : `Tohle měla být posila? ${mwords(sp.apps)} a nic.`],
        optimista: [`${ln} potřebuje čas. Nový klub, noví spoluhráči.`],
        pametnik: ['Pamatuju posily, co se rozkoukávaly půl roku. Pak z nich byly legendy. Nebo taky ne.'],
        ultras: [`${ln}, ukaž, že ten dres chceš!`],
      },
    });
  }
  // Odchod opory: kdo přijde místo něj?
  const best = squad.map((p) => p.overall).sort((a, b) => b - a);
  const third = best[2] ?? 0;
  for (const t of (state.transferLog ?? []).filter((x) => x.fromId === ownId && x.kind !== 'hostovani' && x.date >= addDays(state.date, -21) && (x.overall ?? 0) >= third)) {
    const ln = lastName(t.playerName);
    const repl = (state.transferLog ?? []).find((x) => x.toId === ownId && x.date >= t.date && x.position === t.position);
    if (repl) continue;
    out.push({
      key: `odchod-${t.playerId}`,
      topic: 'odchod',
      title: `Odchod: ${t.playerName}. Kdo přijde místo něj?`,
      target: 35,
      heat: 75,
      fingerprint: `${t.date}`,
      subjectId: t.playerId,
      subjectName: t.playerName,
      lines: {
        statistik: [`${ln} odešel do ${t.toName}${t.fee > 0 ? ` za ${mil(t.fee)}` : ' zadarmo'}. Náhrada ${POS_TO[t.position ?? ''] ?? ''} zatím žádná.`],
        kritik: [`Pustit oporu ${transferWindow(state.date) ? 'a nemít náhradu' : 'po uzávěrce okna'}? Klasika.`],
        optimista: [t.fee > 0 ? 'Za ty peníze přivedeme někoho lepšího, uvidíte.' : 'Každý odchod je šance pro někoho jiného.'],
        ultras: [`${ln}, díky za všechno. Ale vedení: kdo teď?`],
        pametnik: ['Odchody opor k fotbalu patří. Nahradit je, to je umění.'],
      },
    });
  }
  // Sucho střelce (5+ zápasů), posila má vlastní vlákno
  const d = s.droughts.find((x) => !posilaIds.has(x.playerId) && (state.players[x.playerId]?.position === 'FW' || x.seasonGoals >= 3));
  if (d) {
    const ln = lastName(d.name);
    out.push({
      key: `strelec-${d.playerId}`,
      topic: 'strelec',
      title: `Kdy už dá ${d.name} gól?`,
      target: 40,
      heat: 55 + d.games,
      fingerprint: `${d.games}`,
      subjectId: d.playerId,
      subjectName: d.name,
      lines: {
        statistik: [`${ln}: ${mwords(d.games)} bez gólu, v sezóně ${gwords(d.seasonGoals)}.`],
        kritik: ['Útočník, co nedává góly, patří na lavičku.', `${mwords(d.games)} bez gólu. Kolik ještě?`],
        optimista: [`${ln} se trefí, až to nejvíc potřebujeme. Uvidíte.`, `${ln} pro tým maká, góly přijdou.`],
        ultras: [`${ln}, kotel věří! Jeden gól a sucho je pryč.`, `Až ${ln} dá gól, zpíváme jeho jméno celý zápas.`],
        pametnik: ['Každý kanonýr měl sucho. Prolomí ho jeden šťastný odraz.'],
      },
    });
  }
  // Venku bez výhry
  if (s.awayWinless >= 4) {
    const lw = lastAwayWin(state);
    const lastAway = m && !m.home ? m : undefined;
    out.push({
      key: 'venku',
      topic: 'venku',
      title: lw ? `Venku bez výhry ${sinceMonth(lw)}` : 'Venku letos bez výhry',
      target: clamp(36 - (s.awayWinless - 4) * 4, 10, 40),
      heat: 45 + s.awayWinless,
      fingerprint: `${s.awayWinless}`,
      lines: {
        statistik: [`Venku ${mwords(s.awayWinless)} bez výhry${lw ? `, naposledy jsme vyhráli ${formatShortDate(lw).replace(/\.$/, '')}` : ''}.`],
        ultras: lastAway ? [`Na výjezdu (${lastAway.scoreline}) jsme zase zpívali jen my.`] : ['Jezdíme za nima stovky kilometrů a dostáváme tohle.'],
        kritik: ['Venku hrajeme bez odvahy, jen nakopávané balony.', `${mwords(s.awayWinless)} venku bez výhry. Doma hrdinové, venku turisti.`],
        optimista: ['Ta série jednou skončí. Třeba hned příště.', 'Body venku přijdou, až se chytí obrana.'],
        pametnik: [`Venku se tu nikdy moc nevyhrávalo, ale ${mwords(s.awayWinless)} za sebou?`],
      },
    });
  }
  // Proč nehraje odchovanec?
  if (s.form.length >= 5 && s.youthMinutes < 120) {
    const top = [...squad].sort((a, b) => b.overall - a.overall).slice(0, 14);
    const avg = top.reduce((a, p) => a + p.overall, 0) / Math.max(1, top.length);
    const young = squad
      .filter((p) => playerAge(p, state.season) <= 21 && p.overall >= avg - 9 && !p.injuredUntil)
      .sort((a, b) => (b.academy ? 1 : 0) - (a.academy ? 1 : 0) || b.overall - a.overall)[0];
    if (young) {
      const ln = young.lastName;
      const age = playerAge(young, state.season);
      out.push({
        key: 'mladi',
        topic: 'mladi',
        title: young.academy ? 'Proč nehraje odchovanec?' : 'Proč nehrají mladí?',
        target: s.winless >= 2 ? 30 : 42,
        heat: 45,
        fingerprint: `${s.youthMinutes}-${young.minutes}`,
        subjectId: young.id,
        subjectName: pname(young),
        lines: {
          statistik: [`Hráči do 21 let za posledních 5 zápasů: ${s.youthMinutes} minut. ${ln} má v sezóně ${young.minutes} minut.`],
          pametnik: [young.academy ? `${ln} (${age}) je z naší akademie a sedí na tribuně. Dřív se hrálo s vlastníma.` : `Za nás dostávali mladí šanci. ${ln} (${age}) by si ji zasloužil.`],
          ultras: [`Chceme vidět kluky z akademie! ${ln} na hřiště!`],
          optimista: [`Trenér ví, co dělá. ${ln} svou šanci dostane.`],
          kritik: [s.winless >= 2 ? `Starší nevyhráli ${mwords(s.winless)}, tak ať to zkusí mladí.` : 'Pořád stejná jedenáctka dokola.'],
        },
      });
    }
  }
  // Tabulka: kam to dotáhneme?
  const comp = competitionOf(state, ownId);
  if (comp && s.position && s.played >= 6 && s.points !== undefined) {
    const target = goalTarget(state.owner.seasonGoal, comp);
    const goal = goalLabel(state.owner.seasonGoal, comp);
    const diff = target - s.position;
    out.push({
      key: 'tabulka',
      topic: 'tabulka',
      title: 'Tabulka: kam to dotáhneme?',
      target: clamp(55 + diff * 6, 10, 90),
      heat: 20,
      fingerprint: `${s.position}`,
      lines: {
        statistik: [`Po ${plural(s.played, 'zápasu', 'zápasech', 'zápasech')} ${s.position}. místo, ${plural(s.points, 'bod', 'body', 'bodů')}. Cíl vedení: ${goal}.`],
        optimista: [diff >= 0 ? `S touhle formou to na ${target}. místo dotáhneme.` : `Do konce je dost zápasů, ${target}. místo je pořád reálné.`],
        kritik: [diff < 0 ? `${goal}? Se ${s.position}. místem? Buďme realisti.` : 'Hlavně neusnout na vavřínech.'],
        pametnik: ['Tabulka se počítá až v létě, chlapci.', `${s.position}. místo po ${plural(s.played, 'zápasu', 'zápasech', 'zápasech')}? Pamatuju horší i lepší podzimy.`],
        ultras: [s.positionBefore && s.position < s.positionBefore ? `Skok na ${s.position}. místo! Jedeme!` : 'Ať jsme kdekoli, kotel bude plný.'],
      },
    });
  }
  // Fingerprint obsahuje i zápas, aby se vlákno po každém zápase pohnulo.
  return out.map((c) => ({ ...c, fingerprint: `${c.fingerprint}|${s.played}` }));
}

// ---------- Uzavření vlákna (téma přestalo platit) ----------

function resolution(state: GameState, t: ForumThread, s: SeasonFacts, m: OwnMatchFacts | undefined): { text: string; mood: number; voice: Persona } {
  const ln = t.subjectName ? lastName(t.subjectName) : '';
  const scored = t.subjectId ? playerSpell(state, t.subjectId, t.opened).goals > 0 : false;
  const gone = t.subjectId && state.players[t.subjectId]?.clubId !== state.owner.clubId;
  switch (t.topic) {
    case 'strelec':
      if (scored) return { text: `Kdo říkal, že ${ln} nedává góly? Sucho je pryč!`, mood: 80, voice: 'optimista' };
      return { text: gone ? `${ln} už v klubu není, téma skončilo.` : `${ln} teď moc nehraje, diskuze utichla.`, mood: 50, voice: 'statistik' };
    case 'posila':
      if (gone) return { text: `${ln} už v klubu není. Posila, na kterou se zapomene.`, mood: 40, voice: 'kritik' };
      return scored ? { text: `${ln} se konečně trefil! Posila se rozjíždí.`, mood: 75, voice: 'optimista' } : { text: `${ln} se zlepšil, kritika ustala.`, mood: 60, voice: 'statistik' };
    case 'venku': {
      const lw = lastAwayWin(state);
      return lw && lw >= t.opened ? { text: `Konečně výhra venku${m && !m.home && m.outcome === 'V' ? ` (${m.scoreline})` : ''}! Série je u konce.`, mood: 80, voice: 'ultras' } : { text: 'Venkovní série skončila.', mood: 60, voice: 'statistik' };
    }
    case 'brankar':
      return gone ? { text: `${ln} už v klubu není.`, mood: 55, voice: 'statistik' } : { text: `${ln} se vrátil do formy. Kritici zmlkli.`, mood: 70, voice: 'optimista' };
    case 'trener': {
      const c = coachOf(state, state.owner.clubId);
      if (t.subjectName && c && !t.title.includes(pname(c))) return { text: `Trenér už je jiný. Nová kapitola.`, mood: 55, voice: 'pametnik' };
      return { text: m && m.outcome === 'V' ? `Výhra ${m.gf}:${m.ga} (${m.scoreline}). Trenér si oddechl, aspoň na týden.` : 'Série bez výhry skončila.', mood: 62, voice: 'optimista' };
    }
    case 'chvala':
      return { text: m ? `Série skončila (${m.scoreline}), ale věříme dál.` : 'Vítězná série skončila.', mood: 62, voice: 'optimista' };
    case 'odchod': {
      const repl = (state.transferLog ?? []).find((x) => x.toId === state.owner.clubId && x.date >= t.opened);
      return repl ? { text: `Přišel ${repl.playerName}. Snad za ${ln} bude náhradou.`, mood: 62, voice: 'optimista' } : { text: `Náhrada za ${ln} nepřišla, fanoušci si zvykli.`, mood: 40, voice: 'kritik' };
    }
    case 'mladi':
      return { text: `Mladí dostali šanci: ${s.youthMinutes} minut za posledních 5 zápasů.`, mood: 72, voice: 'pametnik' };
    case 'tabulka':
      return { text: s.position ? `Sezóna je u konce: ${s.position}. místo.` : 'Sezóna je u konce.', mood: 55, voice: 'statistik' };
  }
}

// ---------- Denní háček ----------

function voicesToPosts(state: GameState, key: string, lines: Lines, mood: number, n: number, used: ForumPost[] = []): ForumPost[] {
  // Co už ve vlákně zaznělo, se neopakuje: nové příspěvky nesou nová fakta (čísla) nebo jiný hlas.
  const said = new Set(used.map((p) => p.text));
  const fresh: Lines = {};
  for (const [k, v] of Object.entries(lines) as [Persona, string[]][]) fresh[k] = v.filter((x) => !said.has(x));
  return pickVoices(state, key, fresh, mood < 45 ? 'neg' : mood >= 70 ? 'pos' : 'mix', n).map((v) => ({ name: v.name, persona: v.persona, text: v.text, date: state.date }));
}

function growth(state: GameState, t: ForumThread, base: number): number {
  const fans = own(state).fanMood;
  return Math.round(base * (0.6 + hash01(`${state.seed}-${t.id}-${state.date}`) * 0.8) * (0.7 + t.heat / 100) * (fans < 40 ? 1.4 : 1));
}

/** Reakce fanoušků na odpověď majitele po dalším vývoji (drží slovo? zabralo to?). */
function replyEcho(t: ForumThread, c: Candidate): ForumPost | undefined {
  if (!t.reply || t.reply.date === t.updated) return undefined;
  const text =
    t.reply.option === 'slib'
      ? 'Majitel něco slíbil. Počítáme dny.'
      : t.reply.option === 'razantne'
        ? 'Majitel to řekl jasně. Uvidíme, jestli to pomůže.'
        : 'Uklidňovat umí každý. Chceme vidět změnu.';
  return { name: '@hlas_z_ochozu', persona: 'kritik', text: c.topic === 'tabulka' ? 'Majitel mluvil, tabulka mluví taky.' : text, date: '' };
}

/** Denní háček (v den zápasu klubu a v pondělí): otevře, posune a uzavře vlákna podle faktů. */
export function dailyForum(state: GameState): void {
  if (state.gameOver || state.owner.ousted) return;
  const m = freshOwnMatch(state, 0);
  if (!m && dayOfWeek(state.date) !== 1) return;
  const f = ensure(state);
  const s = seasonFactsCached(state);
  const cands = candidates(state, s, m);
  const byKey = new Map(cands.map((c) => [c.key, c]));
  // 1) Otevřená vlákna: posun nebo uzavření.
  for (const t of f.threads.filter((x) => !x.closed)) {
    const c = byKey.get(t.key);
    if (!c) {
      const r = resolution(state, t, s, m);
      t.closed = state.date;
      t.updated = state.date;
      t.resolution = r.text;
      t.mood = Math.round((t.mood + r.mood) / 2);
      t.posts += growth(state, t, 12);
      t.last = [{ name: handleOf(state, r.voice, `${t.id}-end`), persona: r.voice, text: r.text, date: state.date }, ...t.last].slice(0, 5);
      continue;
    }
    if (c.fingerprint === t.fingerprint) continue;
    t.title = c.title;
    t.heat = c.heat;
    t.fingerprint = c.fingerprint;
    t.mood = Math.round(t.mood + (c.target - t.mood) * 0.5);
    t.posts += growth(state, t, 18);
    const fresh = voicesToPosts(state, `${t.id}-${state.date}`, c.lines, t.mood, 2, t.last);
    const echo = replyEcho(t, c);
    t.updated = state.date;
    t.last = [...(echo ? [{ ...echo, date: state.date }] : []), ...fresh, ...t.last].slice(0, 5);
  }
  // 2) Nová vlákna (ne hned znovu to samé téma).
  const recent = new Set([...f.threads, ...f.archive].filter((t) => !t.closed || addDays(t.closed, 21) > state.date).map((t) => t.key));
  for (const c of cands.filter((x) => !recent.has(x.key)).sort((a, b) => b.heat - a.heat)) {
    const open = f.threads.filter((x) => !x.closed);
    if (open.length >= MAX_OPEN) {
      const coolest = [...open].sort((a, b) => a.heat - b.heat)[0];
      if (coolest.heat + 15 > c.heat) break;
      coolest.closed = state.date;
      coolest.resolution = 'Vlákno zapadlo, fanoušci řeší jiná témata.';
    }
    const id = `fv${++state.nextId}`;
    const mood = clamp(Math.round((c.target + 55) / 2), 0, 100);
    const t: ForumThread = {
      id,
      key: c.key,
      topic: c.topic,
      title: c.title,
      opened: state.date,
      updated: state.date,
      mood,
      posts: 0,
      last: voicesToPosts(state, `${id}-open`, c.lines, mood, 3),
      subjectId: c.subjectId,
      subjectName: c.subjectName,
      heat: c.heat,
      fingerprint: c.fingerprint,
    };
    t.posts = 6 + growth(state, t, 20);
    f.threads.push(t);
  }
  // 3) Úklid: uzavřená vlákna po 10 dnech do archivu.
  const old = f.threads.filter((t) => t.closed && addDays(t.closed, 10) <= state.date);
  if (old.length) {
    f.threads = f.threads.filter((t) => !old.includes(t));
    f.archive = [...old, ...f.archive].slice(0, 12);
  }
}

// ---------- Odpověď majitele ----------

interface Effects {
  fans?: number;
  ultras?: number;
  media?: number;
  coachTrust?: number;
  teamMorale?: number;
  subjectMorale?: number;
  backupMorale?: number;
  youthFocus?: boolean;
  mood: number;
}

function effectHint(e: Effects, promise?: ForumPromise): string {
  const sgn = (v: number) => (v > 0 ? `+${v}` : `${v}`);
  const parts: string[] = [];
  if (promise) parts.push(`Slib: ${promise.text}`);
  if (e.fans) parts.push(`fanoušci ${sgn(e.fans)}`);
  if (e.ultras) parts.push(`kotel ${sgn(e.ultras)}`);
  if (e.media) parts.push(`média ${sgn(e.media)}`);
  if (e.coachTrust) parts.push(`důvěra trenéra ${sgn(e.coachTrust)}`);
  if (e.teamMorale) parts.push(`morálka týmu ${sgn(e.teamMorale)}`);
  if (e.subjectMorale) parts.push(`morálka hráče ${sgn(e.subjectMorale)}`);
  if (e.backupMorale) parts.push(`morálka náhradníka ${sgn(e.backupMorale)}`);
  if (e.youthFocus) parts.push('trenér dá víc prostoru mladým');
  parts.push(`nálada vlákna ${sgn(e.mood)}`);
  return parts.join(', ') + '.';
}

function options(state: GameState, t: ForumThread): (ReplyOption & { effects: Effects })[] {
  const ln = t.subjectName ? lastName(t.subjectName) : '';
  const coach = coachOf(state, state.owner.clubId);
  const coachLn = coach ? coach.lastName : 'trenér';
  const we = windowEnd(state.date);
  const weText = formatShortDate(we);
  const signing = (pos: Player['position'], label: string): ForumPromise => ({ kind: 'posila', text: `Posila ${POS_TO[pos] ?? ''} do ${weText}${label ? ` (${label})` : ''}`, metric: 'signing', position: pos, target: 1, until: we, source: 'forum' });
  const o = (id: ReplyId, label: string, text: string, effects: Effects, promise?: ForumPromise) => ({ id, label, text, hint: effectHint(effects, promise), promise, effects });
  switch (t.topic) {
    case 'mladi':
      return [
        o('uklidnit', 'Uklidnit', `Mladí dostanou šanci, až budou připravení. ${ln} na tom tvrdě pracuje.`, { fans: 1, mood: 8 }),
        o('slib', 'Slíbit víc minut', `Slibuji: mladí do 21 let dostanou v příštích pěti zápasech aspoň 270 minut. Řeknu to trenérovi.`, { fans: 3, ultras: 2, coachTrust: -2, youthFocus: true, mood: 18 }, { kind: 'mladi', text: 'Mladí do 21 let aspoň 270 minut v příštích 5 zápasech', metric: 'youthMinutes', target: 270, matches: 5, until: addDays(state.date, 35), source: 'forum' }),
        o('razantne', 'Razantně', 'Sestavu skládá trenér, ne fórum.', { fans: -2, ultras: -1, coachTrust: 3, mood: -10 }),
      ];
    case 'posila':
      return [
        o('uklidnit', 'Podržet posilu', `${ln} potřebuje čas. Věříme mu, přišel kvůli kvalitě.`, { subjectMorale: 6, mood: 6 }),
        o('slib', 'Slíbit další posilu', `Když to nepůjde, do ${weText} přivedeme další posilu.`, { fans: 2, subjectMorale: -4, mood: 12 }, signing(state.players[t.subjectId ?? '']?.position ?? 'FW', 'místo nevydařené posily')),
        o('razantne', 'Razantně', `Od ${ln} čekám víc. Kdo nepodává výkon, nehraje.`, { fans: 2, subjectMorale: -10, teamMorale: -1, mood: 8 }),
      ];
    case 'odchod':
      return [
        o('uklidnit', 'Vysvětlit', `${ln} chtěl jít dál a peníze investujeme do kádru.`, { fans: 1, mood: 6 }),
        o('slib', 'Slíbit náhradu', `Náhradu za ${ln} přivedeme do ${weText}. Máte moje slovo.`, { fans: 3, ultras: 1, mood: 15 }, signing(state.players[t.subjectId ?? '']?.position ?? 'MF', `náhrada za ${ln}`)),
        o('razantne', 'Razantně', 'Nikdo není nenahraditelný. Klub je víc než jeden hráč.', { fans: -3, ultras: -2, mood: -8 }),
      ];
    case 'venku':
      return [
        o('uklidnit', 'Uklidnit', 'Tým má kvalitu, venku to otočíme. Děkujeme všem, kdo jezdí.', { fans: 1, ultras: 1, mood: 6 }),
        o('slib', 'Slíbit výhru venku', 'Do měsíce vyhrajeme venku. Za to ručím.', { fans: 3, ultras: 3, teamMorale: 1, mood: 15 }, { kind: 'vyhra-venku', text: 'Výhra venku do měsíce', metric: 'awayWins', target: 1, until: addDays(state.date, 30), source: 'forum' }),
        o('razantne', 'Kritizovat hráče', 'Venku hrajeme bez srdce. Tohle hráčům řeknu do očí.', { fans: 2, ultras: 2, teamMorale: -4, mood: 10 }),
      ];
    case 'brankar':
      return [
        o('uklidnit', 'Podržet brankáře', `${ln} je naše jednička. Stojíme za ním.`, { subjectMorale: 10, coachTrust: 2, fans: -1, mood: -5 }),
        o('slib', 'Slíbit konkurenci', `Do ${weText} přivedeme do brány konkurenci.`, { fans: 2, subjectMorale: -6, mood: 12 }, signing('GK', 'konkurence do brány')),
        o('razantne', 'Ať chytá dvojka', 'Je na trenérovi, ale já bych dal šanci dvojce.', { subjectMorale: -10, backupMorale: 6, coachTrust: -3, mood: 10 }),
      ];
    case 'trener': {
      const h = halfEnd(state);
      return [
        o('uklidnit', 'Uklidnit', 'Chápu frustraci. Výsledky vyhodnotíme v klidu, ne po jednom zápase.', { fans: 1, mood: 4 }),
        o('slib', 'Podržet trenéra', `Trenér ${coachLn} má mou podporu ${h.label}.`, { coachTrust: 8, teamMorale: 2, fans: -1, mood: -4 }, { kind: 'podpora-trenera', text: `Trenér ${coachLn} zůstane ${h.label}`, metric: 'coachKept', target: 1, until: h.until, source: 'forum' }),
        o('razantne', 'Ultimátum', `Trenér ${coachLn} má na zlepšení dva zápasy.`, { coachTrust: -10, fans: 4, ultras: 2, media: 1, mood: 14 }),
      ];
    }
    case 'chvala':
      return [
        o('uklidnit', 'Nohy na zemi', 'Děkujeme, ale sezóna je dlouhá. Nohy na zemi.', { teamMorale: 1, mood: -2 }),
        o('razantne', 'Poděkovat trenérovi', `Trenér ${coachLn} odvádí skvělou práci. Přijďte to s námi slavit na stadion.`, { coachTrust: 4, fans: 2, mood: 6 }),
      ];
    case 'strelec':
      return [
        o('uklidnit', 'Podržet útočníka', `${ln} se trefí. Má naši plnou důvěru.`, { subjectMorale: 8, mood: 2 }),
        o('slib', 'Slíbit útočníka', `Do ${weText} přivedeme dalšího útočníka.`, { fans: 2, subjectMorale: -5, mood: 12 }, signing('FW', '')),
        o('razantne', 'Razantně', 'Kdo nedává góly, sedí na lavičce. To platí pro všechny.', { subjectMorale: -10, fans: 2, mood: 8 }),
      ];
    case 'tabulka': {
      const comp = competitionOf(state, state.owner.clubId);
      const target = comp ? goalTarget(state.owner.seasonGoal, comp) : 3;
      const goal = comp ? goalLabel(state.owner.seasonGoal, comp) : 'cíl sezóny';
      return [
        o('uklidnit', 'Krok za krokem', 'Krok za krokem. Účtovat budeme na konci sezóny.', { mood: 3 }),
        o('slib', `Slíbit ${target}. místo`, `Slibuji, že skončíme nejhůř ${target}.`, { fans: 3, media: 1, mood: 12 }, { kind: 'umisteni', text: `Konec sezóny nejhůř na ${target}. místě`, metric: 'position', target, until: `${state.season + 1}-05-31`, source: 'forum' }),
        o('razantne', 'Tlak na tým', `Cíl je jasný: ${goal}. Kdo ho nesplní, skončí.`, { coachTrust: -4, teamMorale: -2, fans: 1, mood: 6 }),
      ];
    }
  }
}

/** Volby odpovědi majitele do vlákna (prázdné, když už odpověděl nebo je vlákno uzavřené). */
export function forumReplyOptions(state: GameState, threadId: string): ReplyOption[] {
  const t = state.forum?.threads.find((x) => x.id === threadId);
  if (!t || t.closed || t.reply) return [];
  return options(state, t).map(({ effects: _e, ...rest }) => rest);
}

function applyEffects(state: GameState, t: ForumThread, e: Effects): void {
  const club = own(state);
  if (e.fans) club.fanMood = clamp(club.fanMood + e.fans, 0, 100);
  if (e.ultras) changeUltras(state, e.ultras);
  if (e.media) media(state, e.media);
  if (e.coachTrust) state.owner.trust.trener = clamp(state.owner.trust.trener + e.coachTrust, 0, 100);
  if (e.teamMorale) for (const p of squadOf(state, state.owner.clubId)) p.morale = clamp(p.morale + e.teamMorale, 0, 100);
  const subj = t.subjectId ? state.players[t.subjectId] : undefined;
  if (e.subjectMorale && subj && subj.clubId === state.owner.clubId) subj.morale = clamp(subj.morale + e.subjectMorale, 0, 100);
  if (e.backupMorale && subj) {
    const backup = squadOf(state, state.owner.clubId).filter((p) => p.position === subj.position && p.id !== subj.id).sort((a, b) => b.overall - a.overall)[0];
    if (backup) backup.morale = clamp(backup.morale + e.backupMorale, 0, 100);
  }
  if (e.youthFocus) {
    const c = coachOf(state, state.owner.clubId);
    if (c) c.youthFocus = true;
  }
  t.mood = clamp(t.mood + e.mood, 0, 100);
}

const REACTION: Record<ReplyId, { persona: Persona; name: string; text: string }[]> = {
  uklidnit: [
    { persona: 'optimista', name: '@jana_fanynka', text: 'Díky za odpověď, majitel s námi aspoň mluví.' },
    { persona: 'kritik', name: '@pivni_expert', text: 'Slova, slova. Chceme činy.' },
  ],
  slib: [
    { persona: 'ultras', name: '@kotel_navzdy', text: 'Bereme za slovo! Screenshot uložen. 📸' },
    { persona: 'statistik', name: '@excel_z_tribuny', text: 'Slib zapsán. Datum si pamatujeme.' },
  ],
  razantne: [
    { persona: 'pametnik', name: '@deda_ze_sektoru_C', text: 'Konečně někdo mluví na rovinu.' },
    { persona: 'kritik', name: '@hlas_z_ochozu', text: 'Tohle se fanouškům neříká.' },
  ],
};

/** Odpověď majitele do vlákna (jednou za vlákno). Slib se zaregistruje jako slib majitele. */
export function replyForum(prev: GameState, threadId: string, option: ReplyId): ActionResult {
  const pt = prev.forum?.threads.find((x) => x.id === threadId);
  if (!pt || pt.closed) return { state: prev, ok: false, message: 'Vlákno už není aktivní.' };
  if (pt.reply) return { state: prev, ok: false, message: 'Do tohoto vlákna jste už odpověděl.' };
  const state = structuredClone(prev);
  const t = state.forum!.threads.find((x) => x.id === threadId)!;
  const opt = options(state, t).find((x) => x.id === option);
  if (!opt) return { state: prev, ok: false, message: 'Neznámá odpověď.' };
  applyEffects(state, t, opt.effects);
  if (opt.promise) addPromise(state, opt.promise);
  t.reply = { option, date: state.date, text: opt.text, promise: !!opt.promise };
  const react = REACTION[option][(opt.effects.mood >= 0 ? 0 : 1) % 2];
  const posts: ForumPost[] = [
    { name: react.name, persona: react.persona, text: react.text, date: state.date },
    { name: 'Majitel klubu', persona: 'majitel', text: opt.text, date: state.date },
  ];
  t.last = [...posts, ...t.last].slice(0, 5);
  t.posts += 25 + Math.round(hash01(`${state.seed}-${t.id}-reply`) * 60);
  t.updated = state.date;
  const message = `Odpověděl jste ve vlákně „${t.title}“. ${opt.hint}`;
  addNews(state, { kind: 'info', title: `Fórum: odpověď majitele ve vlákně „${t.title}“`, text: `„${opt.text}“ ${opt.hint}` });
  return { state, ok: true, message };
}

// ---------- Výstupy pro UI a navazující příběhy ----------

/** Vlákna pro kartu na Přehledu: otevřená (nejžhavější první), pak čerstvě uzavřená; nejvýš 4. */
export function forumThreads(state: GameState, limit = 4): ForumThread[] {
  const ts = state.forum?.threads ?? [];
  const open = ts.filter((t) => !t.closed).sort((a, b) => b.heat - a.heat || (a.updated < b.updated ? 1 : -1));
  const closed = ts.filter((t) => t.closed).sort((a, b) => (a.closed! < b.closed! ? 1 : -1));
  return [...open, ...closed].slice(0, limit);
}

/** Paměť fóra pro navazující příběhy (R3): všechna vlákna včetně archivu, s odpověďmi majitele. */
export function forumMemory(state: GameState): ForumThread[] {
  return [...(state.forum?.threads ?? []), ...(state.forum?.archive ?? [])];
}
