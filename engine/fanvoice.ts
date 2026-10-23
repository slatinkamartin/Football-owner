import { allFixtures } from './competitions';
import { matchFacts, seasonFacts, type OwnMatchFacts, type SeasonFacts } from './facts';
import type { Fixture, GameState } from './types';
import { hash01, plural } from './world';

/**
 * R2: hlasy vymyšlených fanoušků a texty z faktů (zprávy po zápase, příspěvky klubu, komentáře).
 * Fanoušci mají jen vymyšlené přezdívky a povahu; skutečná jména hráčů se objevují jen u toho,
 * co se stalo na hřišti (góly, karty, známky, minuty).
 */

export type Persona = 'optimista' | 'kritik' | 'statistik' | 'pametnik' | 'ultras';

export const PERSONA_LABEL: Record<Persona, string> = {
  optimista: 'optimista',
  kritik: 'kritik',
  statistik: 'statistik',
  pametnik: 'pamětník',
  ultras: 'kotel',
};

const HANDLES: Record<Persona, string[]> = {
  optimista: ['jana_fanynka', 'zelena_trava77', 'sobotni_fanda', 'mama_utocnika', 'vecny_optimista', 'fotbal_v_srdci'],
  kritik: ['pivni_expert', 'taktik_z_gauce', 'hlas_z_ochozu', 'martin.permanentka', 'honza_od_stanku', 'nespokojeny_z_B'],
  statistik: ['xg_kalkulacka', 'cisla_nelzou', 'excel_z_tribuny', 'tabulkovy_pavel', 'statistik_sektor_D'],
  pametnik: ['deda_ze_sektoru_C', 'starej_permanentkar', 'pametnik_od_73', 'babicka_v_sale', 'veteran_z_valu'],
  ultras: ['kotel_navzdy', 'sever_buraci', 'vlajkonos_12', 'ultras_junior', 'lucka_na_vyjezdu', 'bubenik_kotle'],
};

export interface Voice {
  name: string;
  persona: Persona;
  text: string;
}

/** Vymyšlená přezdívka fanouška dané povahy. */
export function handleOf(state: GameState, persona: Persona, key: string): string {
  const list = HANDLES[persona];
  return `@${list[Math.floor(hash01(`${state.seed}-${key}-${persona}`) * list.length)]}`;
}

const pick = <T>(state: GameState, key: string, list: T[]): T => list[Math.floor(hash01(`${state.seed}-${key}`) * list.length)];

/** „v 12. minutě“ / „ve 4. minutě“ (ve před 4, 14 a 40–49). */
export const vMin = (n: number) => `${/^4|^14$/.test(String(n)) ? 've' : 'v'} ${n}. minutě`;
/** Tečka na konec věty bez zdvojení („87.“ + „.“). */
export const endDot = (t: string) => (t.endsWith('.') ? t : `${t}.`);
export const lastName = (name: string) => name.split(' ').slice(1).join(' ') || name;
export const dec = (v: number) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ORD_F = ['', 'První', 'Druhá', 'Třetí', 'Čtvrtá', 'Pátá', 'Šestá', 'Sedmá', 'Osmá', 'Devátá', 'Desátá'];
/** „Čtvrtá výhra v řadě“ / „11. výhra v řadě“. */
export const ordWin = (n: number) => (n < ORD_F.length ? `${ORD_F[n]} výhra v řadě` : `${n}. výhra v řadě`);
const MONTH_GEN = ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
/** „od září“ podle data. */
export const sinceMonth = (iso: string) => `od ${MONTH_GEN[Number(iso.slice(5, 7)) - 1]}`;

/** Střelci ve tvaru „Krobot 12., 67. (pen.), Novák 80.“. */
export function scorersText(m: OwnMatchFacts, short = true): string {
  const by = new Map<string, { name: string; mins: string[] }>();
  for (const s of m.scorers) {
    const e = by.get(s.playerId) ?? { name: short ? lastName(s.name) : s.name, mins: [] };
    e.mins.push(`${s.minute}.${s.penalty ? ' (pen.)' : ''}`);
    by.set(s.playerId, e);
  }
  return [...by.values()].map((e) => `${e.name} ${e.mins.join(', ')}`).join(', ');
}

/** Hlavní střelec zápasu (nejvíc gólů, při shodě rozhodující/poslední gól). */
export function heroOfMatch(m: OwnMatchFacts): { name: string; goals: number; minute: number } | undefined {
  if (!m.scorers.length) return undefined;
  const count = new Map<string, number>();
  for (const s of m.scorers) count.set(s.playerId, (count.get(s.playerId) ?? 0) + 1);
  const best = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  const goals = m.scorers.filter((s) => s.playerId === best[0]);
  return { name: goals[0].name, goals: best[1], minute: goals[goals.length - 1].minute };
}

/** Posun v tabulce: „skok na 3. místo“, „pád na 9. místo“ nebo undefined. */
export function tableMove(s: SeasonFacts): { text: string; up: boolean } | undefined {
  if (!s.position || !s.positionBefore || s.position === s.positionBefore) return undefined;
  const up = s.position < s.positionBefore;
  return { text: `${up ? 'skok' : 'pád'} na ${s.position}. místo`, up };
}

/** Jedna věta s fakty do zprávy o výsledku (střelci, karty, zranění, série). */
export function matchFactLine(m: OwnMatchFacts, s?: SeasonFacts): string {
  const parts: string[] = [];
  if (m.scorers.length) parts.push(endDot(`Góly: ${scorersText(m, false)}`));
  if (m.hattrick) parts.push(`Hattrick: ${m.hattrick.name}.`);
  if (m.comeback === 'nase') parts.push('Otočka z nepříznivého stavu.');
  if (m.comeback === 'jejich') parts.push('Ztracené vedení.');
  if (m.lateDecider) parts.push(m.lateDecider.own ? `Rozhodující gól ${vMin(m.lateDecider.minute)}.` : `Soupeř skóroval ${vMin(m.lateDecider.minute)}.`);
  for (const r of m.reds) parts.push(`Červená karta: ${r.name} (${r.minute}.).`);
  if (m.missedPenalty) parts.push(`Neproměněná penalta: ${m.missedPenalty.name} (${m.missedPenalty.minute}., ${m.missedPenalty.saved ? 'chytil brankář' : 'mimo branku'}).`); // V4
  if (m.oppMissedPenalty) parts.push(`Soupeř neproměnil penaltu (${m.oppMissedPenalty.minute}.).`); // V4
  if (m.earlySub) parts.push(`${m.earlySub.name} střídán už ${vMin(m.earlySub.minute)}.`);
  if (m.potm) parts.push(`Hráč zápasu: ${m.potm.name}.`);
  if (s && s.streak.length >= 3) {
    if (s.streak.kind === 'V') parts.push(`${ordWin(s.streak.length)}.`);
    else if (s.streak.kind === 'P') parts.push(`${s.streak.length}. porážka v řadě.`);
  } else if (s && s.winless >= 4) parts.push(`Už ${plural(s.winless, 'zápas', 'zápasy', 'zápasů')} bez výhry.`);
  return parts.join(' ');
}

/** Krátký text příspěvku klubu z faktů zápasu („Čtvrtá výhra v řadě a skok na 3. místo! …“). */
export function clubPostText(m: OwnMatchFacts, s: SeasonFacts | undefined, tag = ''): string {
  const sc = `${m.gf}:${m.ga}`;
  const hero = heroOfMatch(m);
  const move = s ? tableMove(s) : undefined;
  const t = tag ? ` ${tag}` : '';
  if (m.outcome === 'V') {
    const lead =
      s && s.streak.kind === 'V' && s.streak.length >= 2
        ? `${ordWin(s.streak.length)}${move?.up ? ` a ${move.text}` : ''}!`
        : move?.up
          ? `Výhra a ${move.text}!`
          : `VÍTĚZSTVÍ ${sc}!`;
    const who = m.hattrick ? `${lastName(m.hattrick.name)} hattrickem rozhodl` : hero ? `${lastName(hero.name)} ${hero.goals > 1 ? `${hero.goals}× ` : ''}rozhodl${m.lateDecider?.own ? ` ${vMin(m.lateDecider.minute)}` : ''}` : '';
    return `${lead} ${who ? `${who}: ${m.scoreline}.` : `${m.scoreline}.`} 💪${t}`;
  }
  if (m.outcome === 'R') return `Bod${m.home ? '' : ' z venku'}: ${m.scoreline}.${m.scorers.length ? ` ${endDot(`Skóroval${m.scorers.length > 1 ? 'i' : ''} ${scorersText(m)}`)}` : ''}${s?.position ? ` Jsme ${s.position}.` : ''}${t}`;
  return `${m.scoreline}. ${m.ga - m.gf >= 3 ? 'Tohle se nesmí opakovat.' : 'Body tentokrát nezůstaly u nás.'} Díky všem, kdo nás hnali${m.home ? '' : ' i na výjezdu'}. Zvedneme se.`;
}

type Lines = Partial<Record<Persona, string[]>>;

/** Věty fanoušků ke konkrétnímu zápasu podle povahy. */
function matchLines(m: OwnMatchFacts, s: SeasonFacts | undefined): Lines {
  const sc = `${m.gf}:${m.ga}`;
  const hero = heroOfMatch(m);
  const move = s ? tableMove(s) : undefined;
  const late = m.oppScorers.filter((g) => g.minute >= 80).map((g) => `${g.minute}.`);
  const L: Required<Lines> = { optimista: [], kritik: [], statistik: [], pametnik: [], ultras: [] };
  if (m.outcome === 'V') {
    if (hero) L.optimista.push(`${lastName(hero.name)} ${vMin(hero.minute)}! Takhle vypadá útočník.`, `${lastName(hero.name)} je můj hráč sezóny.`);
    if (m.academyScorer) L.optimista.push(`Gól odchovance ${lastName(m.academyScorer.name)}! Tohle mě baví nejvíc.`);
    L.optimista.push(`${sc}! Tak se to dělá!`);
    if (m.oppScorers.length) L.kritik.push(`Výhra fajn, ale ${plural(m.oppScorers.length, 'gól', 'góly', 'gólů')} dostaný${late.length ? ` (i v ${late.join(', ')} min.)` : ''} – obrana pořád spí.`);
    if (m.xgFor !== undefined && m.xgAgainst !== undefined && m.xgAgainst > m.xgFor) L.kritik.push(`Body beru, ale xG ${dec(m.xgFor)} : ${dec(m.xgAgainst)}. Měli jsme kliku.`);
    if (m.comeback === 'nase') L.pametnik.push(`Takovou otočku (${sc}) jsem tu viděl naposledy ještě na škváře.`);
    if (m.hattrick) L.pametnik.push(`Hattrick! ${lastName(m.hattrick.name)} – to se tady nevidí každou sezónu.`);
    if (m.lateDecider?.own) L.ultras.push(`${m.lateDecider.minute}. minuta a kotel bouchl! 🔥`);
    L.ultras.push(`Celý zápas jsme je hnali a vyplatilo se. ${sc}!`);
  } else if (m.outcome === 'P') {
    L.optimista.push(m.ga - m.gf >= 3 ? 'Jeden černý den, hlavu vzhůru.' : `Hlavu vzhůru, ${m.gf ? 'gól jsme dali, ' : ''}příště to bude naše.`);
    if (s?.position) L.optimista.push(`Pořád jsme ${s.position}., žádná panika.`);
    for (const r of m.reds) L.kritik.push(`Červená pro ${lastName(r.name)} ${vMin(r.minute)} nás stála zápas.`);
    if (m.earlySub) L.kritik.push(`Střídat ${lastName(m.earlySub.name)} už ${vMin(m.earlySub.minute)}? Kdo to vymyslel?`);
    if (late.length) L.kritik.push(`Zase góly v závěru (${late.join(', ')} min.). Kondice nula.`);
    if (m.worst) L.kritik.push(`${lastName(m.worst.name)} dneska za ${dec(m.worst.rating)}. Takhle ne.`);
    if (m.comeback === 'jejich') L.kritik.push('Vedli jsme a stejně prohráli. Tohle bolí nejvíc.');
    L.kritik.push(`${sc}? ${m.home ? 'Doma' : 'Venku'} takhle? Chceme vidět bojovnost.`);
    if (m.ga - m.gf >= 3) L.ultras.push(`Za ${sc} chceme vysvětlení u plotu.`);
    L.ultras.push(m.home ? 'Zpívali jsme do konce, od hráčů čekáme totéž.' : 'Jeli jsme za nima přes půl republiky a tohle?');
    if (s && s.winless >= 4) L.pametnik.push(`${plural(s.winless, 'zápas', 'zápasy', 'zápasů')} bez výhry. Takovou krizi pamatuju jen ze sestupové sezóny.`);
    L.pametnik.push('Viděl jsem tu horší časy. Přežili jsme je.');
  } else {
    L.optimista.push(`Bod ${m.home ? 'doma' : 'venku'} se počítá.`);
    if (m.lateDecider?.own) L.ultras.push(`Vyrovnání ${vMin(m.lateDecider.minute)}, kotel šílel!`);
    if (m.lateDecider && !m.lateDecider.own) L.kritik.push(`Inkasovat ${vMin(m.lateDecider.minute)} a pustit dva body. Klasika.`);
    L.kritik.push(`${sc}. Zase jsme to nedotáhli.`);
    L.ultras.push('Byli jsme slyšet celých 90 minut.');
    L.pametnik.push('Remízy se kdysi braly jinak. Dneska je to málo.');
  }
  // V4: neproměněné penalty.
  const mp = m.missedPenalty;
  if (mp) {
    if (m.outcome === 'V') L.optimista.push(`I když ${lastName(mp.name)} penaltu ${mp.saved ? 'nedal' : 'poslal vedle'}, vyhráli jsme. Hlavu vzhůru, ${lastName(mp.name)}!`);
    else L.kritik.push(`Penalta ${vMin(mp.minute)} a ${lastName(mp.name)} ${mp.saved ? 'ji kopne brankáři do rukou' : 'ji pošle vedle'}. ${m.outcome === 'P' ? 'Tam se zápas zlomil.' : 'Dva body v háji.'}`);
    L.statistik.push(`Neproměněná penalta ${vMin(mp.minute)} (${mp.saved ? 'chytil brankář' : 'mimo branku'}).`);
  }
  if (m.oppMissedPenalty && m.outcome !== 'P') L.ultras.push(`${m.oppMissedPenalty.saved ? 'Chycená penalta' : 'Penalta soupeře vedle'} ${vMin(m.oppMissedPenalty.minute)} – kotel to brankáři odzpíval!`);
  if (m.xgFor !== undefined && m.xgAgainst !== undefined) L.statistik.push(`xG ${dec(m.xgFor)} : ${dec(m.xgAgainst)} – ${m.xgFor - m.xgAgainst >= 0.8 ? 'jasně lepší tým' : m.xgAgainst - m.xgFor >= 0.8 ? 'soupeř si šance vytvořil víc' : 'vyrovnaný zápas'}.`);
  if (s?.position && s.points !== undefined) L.statistik.push(`Po ${s.played}. zápase ${s.position}. místo, ${plural(s.points, 'bod', 'body', 'bodů')}${move ? ` (${move.text})` : ''}.`);
  if (s && s.streak.length >= 3) L.statistik.push(s.streak.kind === 'V' ? `${ordWin(s.streak.length)}.` : s.streak.kind === 'P' ? `${s.streak.length}. porážka v řadě.` : `${s.streak.length}. remíza v řadě.`);
  if (s && s.awayWinless >= 4 && !m.home && m.outcome !== 'V') L.statistik.push(`Venku už ${plural(s.awayWinless, 'zápas', 'zápasy', 'zápasů')} bez výhry.`);
  return L;
}

/** Věty fanoušků k sezóně (bez čerstvého zápasu). */
function seasonLines(s: SeasonFacts): Lines {
  const L: Required<Lines> = { optimista: [], kritik: [], statistik: [], pametnik: [], ultras: [] };
  if (s.position && s.points !== undefined) L.statistik.push(`Aktuálně ${s.position}. místo, ${plural(s.points, 'bod', 'body', 'bodů')} z ${plural(s.played, 'zápasu', 'zápasů', 'zápasů')}.`);
  if (s.topScorer && s.topScorer.goals > 0) L.optimista.push(`${lastName(s.topScorer.name)} má už ${plural(s.topScorer.goals, 'gól', 'góly', 'gólů')}. Ten nás potáhne.`);
  if (s.droughts[0]) L.kritik.push(`${lastName(s.droughts[0].name)} je bez gólu ${plural(s.droughts[0].games, 'zápas', 'zápasy', 'zápasů')}. Kdy už?`);
  if (s.winless >= 3) L.kritik.push(`${plural(s.winless, 'zápas', 'zápasy', 'zápasů')} bez výhry a my tu řešíme tohle?`);
  if (s.streak.kind === 'V' && s.streak.length >= 2) L.ultras.push(`${ordWin(s.streak.length)}, kotel jede!`);
  if (s.awayWinless >= 4) L.ultras.push(`Na výjezd jedem i tak, i když venku ${plural(s.awayWinless, 'zápas', 'zápasy', 'zápasů')} bez výhry.`);
  L.pametnik.push('Za mých mladých let tohle nebylo. Ale fandím pořád.');
  L.optimista.push('Hlavně ať se daří!');
  L.ultras.push('V sobotu všichni na stadion!');
  return L;
}

const ORDER: Record<'pos' | 'neg' | 'mix', Persona[]> = {
  pos: ['optimista', 'ultras', 'statistik', 'pametnik', 'kritik'],
  neg: ['kritik', 'ultras', 'statistik', 'pametnik', 'optimista'],
  mix: ['statistik', 'kritik', 'optimista', 'pametnik', 'ultras'],
};

/** Vybere až n komentářů od různých povah, s pořadím podle nálady příspěvku. */
export function pickVoices(state: GameState, key: string, lines: Lines, mood: 'pos' | 'neg' | 'mix', n = 3): Voice[] {
  const order = [...ORDER[mood]];
  // Trochu zamíchat (deterministicky), ať nezačíná pořád stejná povaha.
  if (hash01(`${state.seed}-${key}-ord`) < 0.4) [order[0], order[1]] = [order[1], order[0]];
  const out: Voice[] = [];
  for (const p of order) {
    const pool = lines[p];
    if (!pool?.length) continue;
    out.push({ name: handleOf(state, p, key), persona: p, text: pick(state, `${key}-${p}`, pool) });
    if (out.length >= n) break;
  }
  return out;
}

/** Komentáře fanoušků k zápasu (nebo k sezóně, když zápas chybí). */
export function factVoices(state: GameState, key: string, mood: 'pos' | 'neg' | 'mix', m: OwnMatchFacts | undefined, s: SeasonFacts | undefined, n = 3): Voice[] {
  if (m) return pickVoices(state, key, matchLines(m, s), mood, n);
  if (s && s.played > 0) return pickVoices(state, key, seasonLines(s), mood, n);
  return [];
}

/** Titulky novin z faktů zápasu (pro krok „Po zápase“). Vrací kandidáty pro 2. a 3. titulek. */
export function factHeadlines(m: OwnMatchFacts, s: SeasonFacts | undefined, kindLoc: string): string[] {
  const out: string[] = [];
  const hero = heroOfMatch(m);
  const move = s ? tableMove(s) : undefined;
  if (m.outcome === 'V') {
    if (m.hattrick) out.push(`${lastName(m.hattrick.name)} hattrickem rozhodl ${kindLoc === 'derby' ? 'derby' : `o výhře ${m.gf}:${m.ga}`}`);
    else if (m.lateDecider?.own && hero) out.push(`${lastName(hero.name)} rozhodl ${vMin(m.lateDecider.minute)}`);
    else if (m.comeback === 'nase') out.push(`Otočka: z prohry výhra ${m.gf}:${m.ga}`);
    if (s && s.streak.kind === 'V' && s.streak.length >= 3) out.push(`${ordWin(s.streak.length)}${move?.up ? `, ${move.text}` : ''}`);
    else if (move?.up) out.push(`Výhra znamená ${move.text}`);
    if (m.academyScorer) out.push(`Odchovanec ${lastName(m.academyScorer.name)} se zapsal mezi střelce`);
  } else if (m.outcome === 'P') {
    if (m.reds[0]) out.push(`Červená pro ${lastName(m.reds[0].name)} ${vMin(m.reds[0].minute)} zlomila zápas`);
    if (m.missedPenalty) out.push(`${lastName(m.missedPenalty.name)} neproměnil penaltu ${vMin(m.missedPenalty.minute)}`); // V4
    if (m.comeback === 'jejich') out.push('Promarněné vedení stálo všechno');
    if (m.lateDecider && !m.lateDecider.own) out.push(`Krutá ${m.lateDecider.minute}. minuta`);
    if (s && s.winless >= 4) out.push(`Už ${plural(s.winless, 'zápas', 'zápasy', 'zápasů')} bez výhry`);
    if (move && !move.up) out.push(`Porážka znamená ${move.text}`);
  } else {
    if (m.lateDecider) out.push(m.lateDecider.own ? `Vyrovnání ${vMin(m.lateDecider.minute)}!` : `Gól ${vMin(m.lateDecider.minute)} vzal výhru`);
    if (m.missedPenalty) out.push(`Neproměněná penalta ${lastName(m.missedPenalty.name)} stála výhru`); // V4
  }
  if (m.xgFor !== undefined && m.xgAgainst !== undefined && Math.abs(m.xgFor - m.xgAgainst) >= 1) out.push(`xG ${dec(m.xgFor)} : ${dec(m.xgAgainst)}${(m.xgFor > m.xgAgainst) === (m.outcome === 'V') ? '' : ' – výsledek klame'}`);
  if (m.potm && out.length < 2) out.push(`Hráč zápasu: ${m.potm.name}`);
  return out;
}

/** Lehká série/bez výhry z výsledků sezóny (bez tabulky a statistik; volá se po každém zápase). */
function quickForm(state: GameState): Pick<SeasonFacts, 'streak' | 'winless'> {
  const own = state.owner.clubId;
  const res = allFixtures(state)
    .map((x) => x.fixture)
    .filter((f) => f.result && f.date >= `${state.season}-07-01` && (f.homeId === own || f.awayId === own))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((f) => {
      const r = f.result!;
      const home = f.homeId === own;
      const d = (home ? 1 : -1) * (r.homeGoals - r.awayGoals);
      if (d) return d > 0 ? 'V' : 'P';
      if (r.penalties) return (home ? r.penalties[0] > r.penalties[1] : r.penalties[1] > r.penalties[0]) ? 'V' : 'P';
      return 'R';
    });
  const kind = res[res.length - 1] ?? 'R';
  let length = 0;
  for (let i = res.length - 1; i >= 0 && res[i] === kind; i--) length++;
  let winless = 0;
  for (let i = res.length - 1; i >= 0 && res[i] !== 'V'; i--) winless++;
  return { streak: { kind, length }, winless };
}

/** Fakta do zprávy o výsledku: „ Góly: … Červená karta: … Čtvrtá výhra v řadě.“ (s mezerou na začátku, nebo prázdné). */
export function resultFactLine(state: GameState, f: Fixture, competition = ''): string {
  const m = matchFacts(state, f, competition);
  if (!m) return '';
  const line = matchFactLine(m, quickForm(state) as SeasonFacts);
  return line ? ` ${line}` : '';
}

const factsCache = new WeakMap<GameState, { key: string; facts: SeasonFacts }>();

/**
 * seasonFacts s krátkou pamětí v rámci jednoho dne (sítě, fórum a příspěvky ho volají několikrát
 * po sobě se stejným stavem). Klíč: datum a počet odehraných zápasů klubu.
 */
export function seasonFactsCached(state: GameState): SeasonFacts {
  const own = state.owner.clubId;
  const n = allFixtures(state).filter((x) => x.fixture.result && (x.fixture.homeId === own || x.fixture.awayId === own)).length;
  const key = `${state.date}|${n}`;
  const hit = factsCache.get(state);
  if (hit && hit.key === key) return hit.facts;
  const facts = seasonFacts(state);
  factsCache.set(state, { key, facts });
  return facts;
}
