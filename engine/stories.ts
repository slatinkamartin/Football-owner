import { addDays } from './calendar';
import { media } from './grey';
import { FOREIGN_CLUBS } from './names';
import { squadOf } from './players';
import { dressingRoom } from './atmosphere';
import { createRng } from './rng';
import { dramaFactor } from './settings';
import { coachOf, ensureInterimStaff, fireStaff, goalTarget } from './staff';
import { computeTable } from './standings';
import { playerName, playerValue } from './transfers';
import type { GameEvent, GameState, Story, StoryKind } from './types';
import { addNews, clamp, competitionOf, FOREIGN_PREFIX, hash01, transferWindow } from './world';

/**
 * Příběhy sezóny: dějové linky na několik týdnů. Každý krok je situace k rozhodnutí,
 * mezi kroky se čeká na zápasy nebo na přestupní okno. Výsledek se propíše do nálady,
 * médií, kabiny, důvěry i peněz.
 */

const COOLDOWN: Record<StoryKind, number> = { krize: 100, hvezda: 200, media: 200, kabina: 120, hodnoceni: 300 };
const STORY_LABEL: Record<StoryKind, string> = { krize: 'Krize výsledků', hvezda: 'Hvězda chce odejít', media: 'Tlak médií', kabina: 'Spor v kabině', hodnoceni: 'Hodnocení trenéra po podzimu' };
export { STORY_LABEL };

const own = (s: GameState) => s.clubs[s.owner.clubId];
const squad = (s: GameState) => squadOf(s, s.owner.clubId);

function ownRow(s: GameState) {
  const comp = competitionOf(s, s.owner.clubId);
  return comp ? computeTable(comp, s).find((r) => r.clubId === s.owner.clubId) : undefined;
}

function ownPositionNow(s: GameState): { position: number; target: number; played: number } | undefined {
  const comp = competitionOf(s, s.owner.clubId);
  if (!comp) return undefined;
  const table = computeTable(comp, s);
  const i = table.findIndex((r) => r.clubId === s.owner.clubId);
  return { position: i + 1, target: goalTarget(s.owner.seasonGoal, comp), played: table[i]?.played ?? 0 };
}

export function activeStories(state: GameState): Story[] {
  return (state.stories ?? []).filter((s) => !s.done);
}

/** Příběhy aktuální sezóny (rozjeté i uzavřené). */
export function seasonStories(state: GameState): Story[] {
  return (state.stories ?? []).filter((s) => s.started >= `${state.season}-07-01` || !s.done);
}

function maxActive(state: GameState): number {
  return { klid: 1, bezne: 2, drama: 3 }[state.settings?.drama ?? 'bezne'];
}

function startStory(state: GameState, kind: StoryKind, title: string, extra: Partial<Story> = {}): Story {
  const story: Story = { id: `pb${++state.nextId}`, kind, title, started: state.date, step: 0, data: {}, log: [], ...extra };
  state.stories = [...(state.stories ?? []), story].slice(-30);
  state.eventLog ??= {};
  state.eventLog[`pribeh-${kind}`] = state.date;
  return story;
}

function ask(state: GameState, story: Story, body: Pick<GameEvent, 'title' | 'text' | 'options' | 'defaultOption'> & { playerId?: string }): void {
  story.waiting = 'rozhodnuti';
  state.events.push({ ...body, id: `e${++state.nextId}`, template: 'pribeh', storyId: story.id, date: state.date, expires: addDays(state.date, 10) });
}

function finish(state: GameState, story: Story, outcome: Story['outcome'], text: string): void {
  story.done = true;
  story.outcome = outcome;
  story.waiting = undefined;
  story.log.push(text);
  addNews(state, { kind: outcome === 'spatne' ? 'varovani' : 'info', title: `${story.title}: ${outcome === 'dobre' ? 'dobrý konec' : outcome === 'spatne' ? 'špatný konec' : 'uzavřeno'}`, text });
}

const morale = (state: GameState, id: string | undefined, delta: number) => {
  const p = id ? state.players[id] : undefined;
  if (p) p.morale = clamp(p.morale + delta, 0, 100);
};
const teamMorale = (state: GameState, delta: number) => squad(state).forEach((p) => (p.morale = clamp(p.morale + delta, 0, 100)));
const fans = (state: GameState, delta: number) => (own(state).fanMood = clamp(own(state).fanMood + delta, 0, 100));
const trust = (state: GameState, role: 'trener' | 'reditel', delta: number) => (state.owner.trust[role] = clamp(state.owner.trust[role] + delta, 0, 100));

// ---------- Spuštění ----------

function recent(state: GameState, kind: StoryKind): boolean {
  const last = state.eventLog?.[`pribeh-${kind}`];
  return !!last && addDays(last, COOLDOWN[kind]) > state.date;
}

function tryStart(state: GameState, kind: StoryKind, roll: number): boolean {
  if (recent(state, kind) || activeStories(state).some((s) => s.kind === kind)) return false;
  const f = dramaFactor(state);
  const club = own(state);
  if (kind === 'krize') {
    const row = ownRow(state);
    if (!row || row.form.slice(-3).join('') !== 'PPP' || roll > 0.8 * f) return false;
    const coach = coachOf(state, club.id);
    const story = startStory(state, 'krize', 'Krize: tři prohry v řadě');
    story.log.push('Tým prohrál tři zápasy po sobě, fanoušci jsou nervózní.');
    ask(state, story, {
      title: 'Krize: tři prohry v řadě',
      text: `Média spekulují o konci trenéra${coach ? ` ${coach.firstName} ${coach.lastName}` : ''}. Jak se k tomu postavíte? Rozhodnutí se vyhodnotí po dalších třech ligových zápasech.`,
      defaultOption: 'mlcet',
      options: [
        { id: 'podpora', label: 'Veřejně podpořit trenéra', hint: 'Důvěra trenéra +6. Když se tým nezlepší, padá to i na vás (média −6).' },
        { id: 'ultimatum', label: 'Ultimátum: tři zápasy na zlepšení', hint: 'Hráči se vzchopí (morálka +3), důvěra trenéra −4. Bez zlepšení ho budete muset odvolat.' },
        { id: 'mlcet', label: 'Nekomentovat', hint: 'Média −3, fanoušci −2.' },
      ],
    });
    return true;
  }
  if (kind === 'hvezda') {
    const m = Number(state.date.slice(5, 7));
    if (![3, 4, 5, 11, 12].includes(m) || roll > 0.06 * f) return false;
    const star = [...squad(state)].sort((a, b) => b.overall - a.overall).slice(0, 3).find((p) => p.overall >= 62 && state.season - p.birthYear <= 29 && !p.loan);
    if (!star) return false;
    const story = startStory(state, 'hvezda', `${playerName(star)} chce do zahraničí`, { playerId: star.id });
    story.log.push(`${playerName(star)} dal přes agenta najevo, že chce odejít do silnější ligy.`);
    ask(state, story, {
      title: `${playerName(star)} chce do zahraničí`,
      text: 'Agent tvrdí, že o hráče stojí kluby z ciziny. Hráč čeká, jak se zachováte.',
      playerId: star.id,
      defaultOption: 'odmitnout',
      options: [
        { id: 'slib', label: 'Slíbit odchod za férovou nabídku', hint: 'Morálka hráče +10. V nejbližším okně přijde nabídka ze zahraničí; když ji odmítnete, hráč i média to vezmou zle.' },
        { id: 'smlouva', label: 'Nabídnout lepší smlouvu', hint: 'Plat +30 %, smlouva o 2 roky delší, morálka +8.' },
        { id: 'odmitnout', label: 'Odmítnout', hint: 'Morálka hráče −20, může se to projevit na výkonu.' },
      ],
    });
    return true;
  }
  if (kind === 'media') {
    const pos = ownPositionNow(state);
    const bad = state.owner.media < 35 || (!!pos && pos.played >= 8 && pos.position > pos.target + 3);
    if (!bad || roll > 0.07 * f) return false;
    const story = startStory(state, 'media', 'Tlak médií');
    story.log.push('Novináři píšou o chaosu v klubu a ptají se, kam majitel klub vede.');
    ask(state, story, {
      title: 'Média: „V klubu vládne chaos“',
      text: 'Kritické články se množí. Jak zareagujete?',
      defaultOption: 'ignorovat',
      options: [
        { id: 'tiskovka', label: 'Svolat tiskovou konferenci', hint: 'Když klub v dalších 4 týdnech boduje (aspoň 1,3 bodu na zápas), média +6; jinak −3.' },
        { id: 'rozhovor', label: 'Exkluzivní rozhovor o plánech', hint: 'Média +5 hned, trenér −2 (mluvíte za něj).' },
        { id: 'ignorovat', label: 'Nekomentovat', hint: 'Média −4.' },
      ],
    });
    return true;
  }
  if (kind === 'hodnoceni') {
    // Zimní pauza: po posledním podzimním zápase majitel hodnotí trenéra.
    const comp = competitionOf(state, state.owner.clubId);
    const coach = coachOf(state, club.id);
    if (!comp || !coach || coach.interim) return false;
    const mine = comp.fixtures.filter((f) => f.homeId === club.id || f.awayId === club.id);
    const autumn = mine.filter((f) => f.date < `${state.season + 1}-01-01`);
    if (!autumn.length || autumn.some((f) => !f.result) || state.date >= `${state.season + 1}-01-01` || state.date < `${state.season}-10-01`) return false;
    const pos = ownPositionNow(state)!;
    const story = startStory(state, 'hodnoceni', `Hodnocení trenéra ${coach.firstName} ${coach.lastName} po podzimu`);
    story.log.push(`Po podzimu je klub na ${pos.position}. místě, cíl je do ${pos.target}. místa.`);
    const good = pos.position <= pos.target;
    ask(state, story, {
      title: `Hodnocení trenéra po podzimu: ${pos.position}. místo (cíl do ${pos.target}.)`,
      text: good ? 'Podzim vyšel podle plánu. Jak trenéra ohodnotíte?' : 'Podzim za plánem zaostal. Média i fanoušci čekají, co uděláte.',
      defaultOption: 'pokracovat',
      options: [
        { id: 'pokracovat', label: good ? 'Pochválit a pokračovat' : 'Vyjádřit důvěru a pokračovat', hint: good ? 'Důvěra trenéra +5, média +1.' : 'Důvěra trenéra +4. Když jaro nevyjde, padá to i na vás.' },
        { id: 'ultimatum', label: 'Ultimátum: 5 jarních zápasů, aspoň 8 bodů', hint: 'Důvěra trenéra −5, hráči se vzchopí (morálka +3). Bez 8 bodů ho budete muset odvolat.' },
        { id: 'odvolat', label: 'Odvolat trenéra v zimní pauze', hint: 'Odstupné podle smlouvy, nový trenér má na přípravu celou zimu.' },
      ],
    });
    return true;
  }
  if (kind === 'kabina') {
    const room = dressingRoom(state);
    if (room.morale >= 45 || roll > 0.3 * f) return false;
    const core = [...squad(state)].sort((a, b) => b.overall - a.overall).slice(0, 8);
    if (core.length < 2) return false;
    const a = core[Math.floor(hash01(`${state.date}a`) * core.length)];
    const b = core.find((p) => p.id !== a.id)!;
    const story = startStory(state, 'kabina', `Spor v kabině: ${playerName(a)} × ${playerName(b)}`, { playerId: a.id, data: { other: b.id } });
    story.log.push(`${playerName(a)} a ${playerName(b)} se pohádali na tréninku, kabina se dělí na dva tábory.`);
    ask(state, story, {
      title: `Hádka v kabině: ${playerName(a)} × ${playerName(b)}`,
      text: 'Spor dvou opor se přenáší do celé kabiny. Kdo ho vyřeší?',
      playerId: a.id,
      defaultOption: 'trener',
      options: [
        { id: 'trest', label: 'Potrestat oba pokutou', hint: 'Morálka obou −8, ostatních +2 (pořádek), důvěra trenéra +2.' },
        { id: 'kapitan', label: 'Nechat to na kapitánovi', hint: 'Asi 60% šance na usmíření (morálka všech +5), jinak se kabina rozdělí (−4).' },
        { id: 'trener', label: 'Nechat to na trenérovi', hint: 'Důvěra trenéra +3; úspěch podle jeho schopností.' },
      ],
    });
    return true;
  }
  return false;
}

// ---------- Rozhodnutí ----------

export function resolveStoryEvent(state: GameState, event: GameEvent, option: string): string {
  const story = (state.stories ?? []).find((s) => s.id === event.storyId);
  if (!story || story.done) return '';
  story.waiting = undefined;
  const label = event.options.find((o) => o.id === option)?.label ?? option;
  story.log.push(`Rozhodnutí: ${label}.`);
  const row = ownRow(state);

  if (story.kind === 'krize' && story.step === 0) {
    story.data.choice = option;
    story.data.points = row?.points ?? 0;
    story.data.played = row?.played ?? 0;
    story.step = 1;
    story.waiting = 'zapasy';
    story.matchesLeft = 3;
    if (option === 'podpora') trust(state, 'trener', 6);
    if (option === 'ultimatum') {
      trust(state, 'trener', -4);
      teamMorale(state, 3);
    }
    if (option === 'mlcet') {
      media(state, -3);
      fans(state, -2);
    }
    return 'Uvidíme po dalších třech zápasech.';
  }
  if (story.kind === 'krize' && story.step === 1) {
    if (option === 'odvolat') {
      const r = fireStaff(state, 'trener');
      if (r.ok) Object.assign(state, r.state);
      ensureInterimStaff(state, createRng(state.rngState ^ state.nextId));
      fans(state, 3);
      media(state, 2);
      finish(state, (state.stories ?? []).find((s) => s.id === story.id)!, 'neutralni', 'Trenér byl odvolán, tým vede zastupující trenér. Nového najdete ve Vedení.');
      return 'Trenér odvolán.';
    }
    media(state, story.data.choice === 'ultimatum' ? -8 : -5);
    fans(state, -4);
    finish(state, story, 'spatne', story.data.choice === 'ultimatum' ? 'Ultimátum vypršelo a trenér zůstal. Média píšou, že nedržíte slovo.' : 'Trenér zůstává i přes krizi. Fanoušci jsou nespokojení.');
    return 'Trenér zůstává.';
  }

  if (story.kind === 'hodnoceni' && story.step === 0) {
    if (option === 'pokracovat') {
      trust(state, 'trener', 5);
      media(state, 1);
      finish(state, story, 'neutralni', 'Trenér pokračuje s vaší podporou.');
      return 'Trenér pokračuje.';
    }
    if (option === 'odvolat') {
      const r = fireStaff(state, 'trener');
      if (r.ok) Object.assign(state, r.state);
      ensureInterimStaff(state, createRng(state.rngState ^ state.nextId));
      finish(state, (state.stories ?? []).find((s) => s.id === story.id)!, 'neutralni', 'Trenér odvolán v zimní pauze. Nového najdete ve Vedení.');
      return 'Trenér odvolán.';
    }
    trust(state, 'trener', -5);
    teamMorale(state, 3);
    story.data.choice = 'ultimatum';
    story.data.points = row?.points ?? 0;
    story.data.played = row?.played ?? 0;
    story.data.need = 5;
    story.data.min = 8;
    story.step = 1;
    story.waiting = 'zapasy';
    story.matchesLeft = 5;
    return 'Ultimátum platí: 5 zápasů, aspoň 8 bodů.';
  }
  if (story.kind === 'hodnoceni' && story.step === 1) {
    story.kind = 'krize';
    return resolveStoryEvent(state, event, option);
  }

  if (story.kind === 'hvezda') {
    const p = story.playerId ? state.players[story.playerId] : undefined;
    if (!p || p.clubId !== state.owner.clubId) {
      finish(state, story, 'neutralni', 'Hráč už v klubu není.');
      return '';
    }
    if (option === 'slib') {
      morale(state, p.id, 10);
      story.step = 1;
      story.waiting = 'okno';
      return 'Hráč čeká na nabídku v přestupním okně.';
    }
    if (option === 'smlouva') {
      p.wage = Math.round((p.wage * 1.3) / 1_000) * 1_000;
      p.contractUntil = Math.max(p.contractUntil, state.season + 1) + 2;
      morale(state, p.id, 8);
      finish(state, story, 'neutralni', `${playerName(p)} podepsal lepší smlouvu do roku ${p.contractUntil} a zůstává.`);
      return 'Hráč zůstává za vyšší plat.';
    }
    morale(state, p.id, -20);
    finish(state, story, 'spatne', `${playerName(p)} musí zůstat a je nespokojený.`);
    return 'Hráč zůstává proti své vůli.';
  }

  if (story.kind === 'media') {
    if (option === 'tiskovka') {
      story.step = 1;
      story.waiting = 'tydny';
      story.until = addDays(state.date, 28);
      story.data.points = row?.points ?? 0;
      story.data.played = row?.played ?? 0;
      return 'Za čtyři týdny se ukáže, jestli jste slibovali oprávněně.';
    }
    if (option === 'rozhovor') {
      media(state, 5);
      trust(state, 'trener', -2);
      finish(state, story, 'neutralni', 'Rozhovor média uklidnil, trenér je trochu dotčený.');
      return 'Rozhovor vyšel.';
    }
    media(state, -4);
    finish(state, story, 'spatne', 'Mlčení média vzala jako nezájem.');
    return 'Bez komentáře.';
  }

  if (story.kind === 'kabina') {
    const a = story.playerId;
    const b = String(story.data.other ?? '');
    const coach = coachOf(state, state.owner.clubId);
    const luck = hash01(`${story.id}-${option}`);
    if (option === 'trest') {
      teamMorale(state, 2);
      morale(state, a, -10);
      morale(state, b, -10);
      trust(state, 'trener', 2);
    } else if (option === 'kapitan') {
      teamMorale(state, luck < 0.6 ? 5 : -4);
    } else {
      trust(state, 'trener', 3);
      teamMorale(state, luck < (coach?.ability ?? 40) / 100 ? 4 : -3);
    }
    story.step = 1;
    story.waiting = 'tydny';
    story.until = addDays(state.date, 14);
    return 'Za dva týdny se ukáže, jestli se kabina uklidnila.';
  }
  return '';
}

// ---------- Průběh ----------

/** Jednou týdně: posun rozjetých příběhů a možná nový příběh. */
export function weeklyStories(state: GameState, rng: { next(): number }): void {
  if (state.owner.ousted || state.gameOver) return;
  for (const story of activeStories(state)) advance(state, story);
  if (activeStories(state).length >= maxActive(state)) return;
  for (const kind of ['hodnoceni', 'krize', 'kabina', 'media', 'hvezda'] as StoryKind[]) {
    if (activeStories(state).length >= maxActive(state)) break;
    tryStart(state, kind, rng.next());
  }
}

function advance(state: GameState, story: Story): void {
  if (story.waiting === 'rozhodnuti') {
    // Situace propadla bez otevřené události (např. smazaná): uzavřít.
    if (!state.events.some((e) => e.storyId === story.id)) finish(state, story, 'neutralni', 'Příběh vyšuměl.');
    return;
  }
  const row = ownRow(state);
  if ((story.kind === 'krize' || story.kind === 'hodnoceni') && story.waiting === 'zapasy') {
    const need = Number(story.data.need ?? 3);
    const min = Number(story.data.min ?? 4);
    const played = (row?.played ?? 0) - Number(story.data.played ?? 0);
    story.matchesLeft = Math.max(0, need - played);
    if (played < need) return;
    const gained = (row?.points ?? 0) - Number(story.data.points ?? 0);
    if (gained >= min) {
      fans(state, 4);
      media(state, 3);
      if (story.data.choice === 'podpora') trust(state, 'trener', 3);
      finish(state, story, 'dobre', `Tým získal ${gained} bodů z ${need} zápasů, ${story.kind === 'krize' ? 'krize je zažehnaná' : 'ultimátum splnil'}.`);
      return;
    }
    if (story.data.choice === 'podpora') media(state, -6);
    story.log.push(`Za ${need} zápasy jen ${gained} ${gained === 1 ? 'bod' : gained < 5 && gained > 0 ? 'body' : 'bodů'}.`);
    ask(state, story, {
      title: story.kind === 'krize' ? 'Krize pokračuje' : 'Ultimátum nesplněno',
      text: `Tým za ${need} zápasy získal jen ${gained} b. ${story.data.choice === 'ultimatum' ? 'Ultimátum vypršelo.' : 'Tlak na změnu roste.'}`,
      defaultOption: 'podrzet',
      options: [
        { id: 'odvolat', label: 'Odvolat trenéra', hint: 'Odstupné podle smlouvy, fanoušci +3, média +2. Tým povede zastupující trenér.' },
        { id: 'podrzet', label: 'Ještě ho podržet', hint: story.data.choice === 'ultimatum' ? 'Média −8 (nedržíte slovo), fanoušci −4.' : 'Média −5, fanoušci −4.' },
      ],
    });
    return;
  }
  if (story.kind === 'hvezda') {
    const p = story.playerId ? state.players[story.playerId] : undefined;
    if (!p || p.clubId !== state.owner.clubId) {
      fans(state, -2);
      finish(state, story, 'dobre', `${p ? playerName(p) : 'Hráč'} odešel, slib jste dodrželi. Média to oceňují.`);
      media(state, 3);
      return;
    }
    if (story.waiting === 'okno' && transferWindow(state.date)) {
      const level = p.overall >= 72 ? 1 : 2;
      const buyers = FOREIGN_CLUBS.filter((c) => c.level === level);
      const buyer = buyers[Math.floor(hash01(story.id) * buyers.length)];
      const fee = Math.round((playerValue(state, p) * 1.15) / 100_000) * 100_000;
      state.market.offers = state.market.offers.filter((o) => o.playerId !== p.id);
      state.market.offers.push({ id: `o${++state.nextId}`, playerId: p.id, buyerId: FOREIGN_PREFIX + buyer.id, fee, expires: addDays(state.date, 14), advice: 'prijmout', note: 'Hráči jste odchod slíbil. Odmítnutí ho rozladí.' });
      addNews(state, { kind: 'info', title: `${buyer.name} nabízí za ${playerName(p)} ${(fee / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`, text: 'Hráči jste odchod slíbil. Nabídku najdete v Přestupech.', playerId: p.id });
      story.log.push(`Přišla nabídka z ${buyer.name}.`);
      story.step = 2;
      story.waiting = 'nabidka';
      story.until = addDays(state.date, 15);
      return;
    }
    if (story.waiting === 'nabidka' && story.until && state.date > story.until) {
      morale(state, p.id, -25);
      media(state, -3);
      finish(state, story, 'spatne', `Nabídku jste nepřijali, ${playerName(p)} se cítí podvedený.`);
    }
    return;
  }
  if (story.kind === 'media' && story.waiting === 'tydny' && story.until && state.date >= story.until) {
    const played = (row?.played ?? 0) - Number(story.data.played ?? 0);
    const gained = (row?.points ?? 0) - Number(story.data.points ?? 0);
    if (played > 0 && gained / played >= 1.3) {
      media(state, 6);
      finish(state, story, 'dobre', `Klub od tiskovky boduje (${gained} b. z ${played} zápasů), média vám dala za pravdu.`);
    } else {
      media(state, -3);
      finish(state, story, 'spatne', 'Sliby z tiskovky se nenaplnily, média přitvrdila.');
    }
    return;
  }
  if (story.kind === 'kabina' && story.waiting === 'tydny' && story.until && state.date >= story.until) {
    const room = dressingRoom(state);
    if (room.morale >= 50) {
      finish(state, story, 'dobre', 'Kabina se uklidnila, spor je zapomenutý.');
    } else {
      const loser = [story.playerId, String(story.data.other ?? '')].map((id) => (id ? state.players[id] : undefined)).filter((p) => p && p.clubId === state.owner.clubId).sort((x, y) => x!.morale - y!.morale)[0];
      if (loser && !state.market.listed.includes(loser.id)) state.market.listed.push(loser.id);
      finish(state, story, 'spatne', `Kabina zůstává rozdělená.${loser ? ` ${playerName(loser)} chce odejít, je nabídnutý k prodeji.` : ''}`);
    }
  }
}
