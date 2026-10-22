import vedeni from '../data/cz-zaklad/vedeni.json';
import { addDays, SEASON_START } from './calendar';
import { allFixtures } from './competitions';
import { book } from './finance';
import { changeSponsorRelation } from './finplus';
import { media } from './grey';
import { ownerTypeOf, rivalsOf } from './league';
import { squadOf } from './players';
import { SLOT_LABEL } from './sponsors';
import type { GameEvent, GameState, Negotiation, SponsorSlot } from './types';
import { addNews, clamp, clubLabel, competitionOf, hash01, isForeign, transferWindow } from './world';
import { decisionBudgetLeft } from './situations'; // R1: týdenní limit rozhodnutí

/**
 * Majitelé soupeřů jako protivníci: každý klub má vedení s povahou, vztahem k vám a rivalitou.
 * Herní jednání (přebíjení nabídek, výroky, lákání sponzorů) se vždy připisuje vedení klubu,
 * nikdy skutečným osobám. Skutečné vedení (data/cz-zaklad/vedeni.json) je jen fakt na kartě klubu.
 */

// ---------- Skutečné vedení (jen fakt) ----------

export interface RealManagement {
  owner?: string;
  chairman?: string;
  source: string;
}

const REAL = new Map((vedeni as { vedeni: { klub: string; vlastnik: string | null; predseda: string | null; zdroj: string }[] }).vedeni.map((v) => [v.klub, v]));

/** Vlastník a předseda podle Wikipedie (jen pro zobrazení na kartě klubu). */
export function realManagement(clubId: string): RealManagement | undefined {
  const v = REAL.get(clubId);
  if (!v || (!v.vlastnik && !v.predseda)) return undefined;
  return { owner: v.vlastnik ?? undefined, chairman: v.predseda ?? undefined, source: v.zdroj };
}

// ---------- Povaha vedení ----------

export type RivalNature = 'rozhazovac' | 'setril' | 'populista' | 'investor' | 'patriot';

export const NATURE_LABEL: Record<RivalNature, { label: string; hint: string }> = {
  rozhazovac: { label: 'rozhazovač', hint: 'utrácí za posily víc, než klub vydělá, a rád přebíjí cizí nabídky' },
  setril: { label: 'šetřílek', hint: 'v krizi prodává opory levně, do přestupních válek se nežene' },
  populista: { label: 'populista', hint: 'po sérii proher vyhodí trenéra a rád si rýpne v médiích' },
  investor: { label: 'investor', hint: 'počítá každou korunu, v krizi prodává a láká cizí sponzory' },
  patriot: { label: 'patriot', hint: 'sází na akademii a odchovance, cizí hráče přebíjí málokdy' },
};

/** Jak moc vedení přebíjí nabídky, rýpe v médiích a láká sponzory. */
const NATURE_FACTOR: Record<RivalNature, { overbid: number; jab: number; poach: number }> = {
  rozhazovac: { overbid: 1.6, jab: 1.1, poach: 1.3 },
  setril: { overbid: 0.4, jab: 0.7, poach: 0.5 },
  populista: { overbid: 1, jab: 1.8, poach: 1 },
  investor: { overbid: 0.9, jab: 0.6, poach: 1.6 },
  patriot: { overbid: 0.6, jab: 1, poach: 0.6 },
};

/** Povaha navazuje na typ majitele z ligy (rozhazovačný, šetřílek, nervózní, akademie); část šetřílků jsou investoři. */
export function natureOf(clubId: string): RivalNature {
  const t = ownerTypeOf(clubId);
  if (t === 'rozhazovacny') return 'rozhazovac';
  if (t === 'nervozni') return 'populista';
  if (t === 'akademie') return 'patriot';
  return hash01(`investor-${clubId}`) < 0.5 ? 'investor' : 'setril';
}

// ---------- Vztahy a rivalita ----------

export interface RivalBoardEntry {
  /** Vztah vedení klubu k vám −100..100. */
  relation: number;
  /** Rivalita 0..100 (derby, souboje o hráče, výroky). */
  rivalry: number;
  /** Poslední střet. */
  last?: { date: string; text: string };
}

export interface RivalsState {
  clubs: Record<string, RivalBoardEntry>;
  lastJab?: string;
  lastOverbid?: string;
  /** Sezóna, ve které už soupeř zkoušel přetáhnout sponzora. */
  poachSeason?: number;
  /** Otevřené situace: o který klub (a sponzora) jde. */
  pending?: Record<string, { clubId: string; slot?: SponsorSlot }>;
}

function baseEntry(state: GameState, clubId: string): RivalBoardEntry {
  const r = rivalsOf(state).find((x) => x.id === clubId);
  if (r?.kind === 'derby') return { relation: -15, rivalry: 40 };
  if (r) return { relation: -5, rivalry: 20 };
  return { relation: Math.round(-10 + hash01(`vztah-${state.seed}-${clubId}`) * 25), rivalry: Math.round(hash01(`rivalita-${state.seed}-${clubId}`) * 10) };
}

/** Vztah a rivalita s vedením klubu (bez záznamu výchozí podle derby a soupeřů). */
export function rivalBoard(state: GameState, clubId: string): RivalBoardEntry {
  return state.rivalBoards?.clubs[clubId] ?? baseEntry(state, clubId);
}

function boards(state: GameState): RivalsState {
  state.rivalBoards ??= { clubs: {} };
  return state.rivalBoards;
}

/** Změní vztah a rivalitu a zapíše poslední střet. */
export function touchRival(state: GameState, clubId: string, relation: number, rivalry: number, text?: string): void {
  if (!state.clubs[clubId] || clubId === state.owner.clubId) return;
  const b = boards(state);
  const e = { ...rivalBoard(state, clubId) };
  e.relation = clamp(Math.round(e.relation + relation), -100, 100);
  e.rivalry = clamp(Math.round(e.rivalry + rivalry), 0, 100);
  if (text) e.last = { date: state.date, text };
  b.clubs[clubId] = e;
}

export interface RivalRow extends RivalBoardEntry {
  clubId: string;
  nature: RivalNature;
}

/** Největší rivalové v kanceláři: kluby ze soutěže majitele a ti, s kým jste se střetli. */
export function topRivals(state: GameState, limit = 3): RivalRow[] {
  const own = state.owner.clubId;
  const ids = new Set<string>([...(competitionOf(state, own)?.clubIds ?? []), ...Object.keys(state.rivalBoards?.clubs ?? {})]);
  return [...ids]
    .filter((id) => id !== own && state.clubs[id] && !state.clubs[id].reserveOf)
    .map((id) => ({ clubId: id, nature: natureOf(id), ...rivalBoard(state, id) }))
    .sort((a, b) => b.rivalry - a.rivalry || a.relation - b.relation || a.clubId.localeCompare(b.clubId))
    .slice(0, limit);
}

/** Nepřátelství zvyšuje šanci na útoky soupeře, dobré vztahy ji tlumí. */
function hostility(e: RivalBoardEntry): number {
  return (1 + e.rivalry / 60) * (e.relation > 40 ? 0.25 : e.relation > 15 ? 0.6 : e.relation < -30 ? 1.4 : 1);
}

function pickWeighted<T>(items: { item: T; w: number }[], roll: number): T | undefined {
  const total = items.reduce((a, x) => a + x.w, 0);
  if (total <= 0) return undefined;
  let r = roll * total;
  for (const x of items) {
    r -= x.w;
    if (r <= 0) return x.item;
  }
  return items[items.length - 1]?.item;
}

const mil = (v: number) => `${(v / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;
const fmt = (v: number) => `${Math.round(v).toLocaleString('cs-CZ')} Kč`;
const roundTo = (v: number, step: number) => Math.max(step, Math.round(v / step) * step);

// ---------- (a) Přebití nabídky na hráče ----------

/**
 * Volá se z jednání (offerFee), když by prodávající vaši nabídku přijal. Vedení soupeře ji může přebít:
 * jednání pokračuje s konkurenční nabídkou, kterou musíte dorovnat (existující mechanika `rival`).
 * Vrací zprávu pro jednání, nebo undefined (nic se nestalo).
 */
export function rivalOverbid(state: GameState, neg: Negotiation, value: number): string | undefined {
  if (neg.rival || !neg.sellerId || isForeign(neg.sellerId) || !transferWindow(state.date)) return undefined;
  // Velkorysou nabídku (aspoň o čtvrtinu nad požadavkem) už nikdo nepřebíjí.
  if (value >= neg.askingFee * 1.25) return undefined;
  const b = state.rivalBoards;
  if (b?.lastOverbid && addDays(b.lastOverbid, 30) > state.date) return undefined;
  const own = state.owner.clubId;
  const p = state.players[neg.playerId];
  if (!p) return undefined;
  const top = squadOf(state, own).map((x) => x.overall).sort((a, c) => c - a).slice(0, 11);
  const level = top.length ? top.reduce((a, x) => a + x, 0) / top.length : 0;
  if (p.overall < level - 5) return undefined;
  const ownRep = state.clubs[own].reputation;
  const candidates = (competitionOf(state, own)?.clubIds ?? [])
    .filter((id) => id !== own && id !== neg.sellerId && !state.clubs[id].reserveOf && state.clubs[id].reputation >= ownRep - 10)
    .map((id) => ({ item: id, w: NATURE_FACTOR[natureOf(id)].overbid * hostility(rivalBoard(state, id)) }));
  const clubId = pickWeighted(candidates, hash01(`${state.seed}-${neg.playerId}-${state.date}-kdo-prebiji`));
  if (!clubId) return undefined;
  const nature = natureOf(clubId);
  const chance = Math.min(0.6, 0.22 * NATURE_FACTOR[nature].overbid * hostility(rivalBoard(state, clubId)));
  if (hash01(`${state.seed}-${neg.playerId}-${state.date}-prebiti`) >= chance) return undefined;
  const h = hash01(`${state.seed}-${neg.playerId}-prebiti-cena`);
  const fee = roundTo(value * (1.08 + 0.12 * h), 10_000);
  if (nature !== 'rozhazovac' && state.clubs[clubId].finance.balance < fee * 0.3) return undefined;
  const wage = roundTo(neg.minWage * (1.08 + 0.1 * h), 1_000);
  neg.rival = { clubId, fee, wage };
  neg.counter = roundTo(fee * 1.03, 10_000);
  boards(state).lastOverbid = state.date;
  const name = `${p.firstName} ${p.lastName}`;
  touchRival(state, clubId, -6, 8, `přebili vaši nabídku na ${name}`);
  addNews(state, {
    kind: 'varovani',
    title: `Vedení klubu ${clubLabel(state, clubId)} přebilo vaši nabídku na ${name}`,
    text: `Nabízí ${fmt(fee)} a plat ${fmt(wage)} měsíčně. Pokud o hráče stojíte, dorovnejte v jednání aspoň ${fmt(fee * 1.02)}.`,
    playerId: p.id,
  });
  return `${clubLabel(state, neg.sellerId)} už byl připraven nabídku přijmout, ale vedení klubu ${clubLabel(state, clubId)} ji přebilo (${fmt(fee)}). Musíte dorovnat.`;
}

// ---------- Denní háček: zápasy, výroky, sponzoři ----------

const JAB_COOLDOWN = 60;

/** Jednou denně: vzájemné zápasy zvedají rivalitu, po nich může přijít výrok; jednou za sezónu lákání sponzora. */
export function dailyRivals(state: GameState): void {
  if (state.date.slice(5) === SEASON_START && state.rivalBoards) decay(state);
  const own = state.owner.clubId;
  for (const { fixture: f } of allFixtures(state)) {
    if (f.date !== state.date || !f.result || (f.homeId !== own && f.awayId !== own)) continue;
    const other = f.homeId === own ? f.awayId : f.homeId;
    if (!state.clubs[other] || isForeign(other)) continue;
    const derby = rivalsOf(state).some((r) => r.id === other && r.kind === 'derby');
    const gf = f.homeId === own ? f.result.homeGoals : f.result.awayGoals;
    const ga = f.homeId === own ? f.result.awayGoals : f.result.homeGoals;
    const score = `${clubLabel(state, f.homeId)} – ${clubLabel(state, f.awayId)} ${f.result.homeGoals}:${f.result.awayGoals}`;
    touchRival(state, other, gf > ga ? -2 : 0, derby ? 5 : 2, `${derby ? 'derby' : 'zápas'} ${score}`);
    maybeJab(state, other, derby, gf, ga, score);
  }
  if (state.date.slice(8) === '10') maybePoach(state);
}

function decay(state: GameState): void {
  for (const [id, e] of Object.entries(state.rivalBoards!.clubs)) {
    if (!state.clubs[id]) continue;
    const base = baseEntry(state, id);
    e.rivalry = Math.round(base.rivalry + (e.rivalry - base.rivalry) * 0.75);
    e.relation = Math.round(base.relation + (e.relation - base.relation) * 0.8);
  }
}

function canAsk(state: GameState, template: string): boolean {
  // R1: výroky a lákání sponzorů soupeřů jsou rozhodnutí, respektují týdenní limit.
  return !state.owner.ousted && !state.gameOver && state.events.length < 4 && !state.events.some((e) => e.template === template) && decisionBudgetLeft(state) > 0;
}

function pushEvent(state: GameState, template: string, clubId: string, body: Omit<GameEvent, 'id' | 'template' | 'date'>, slot?: SponsorSlot): void {
  const event: GameEvent = { ...body, id: `e${++state.nextId}`, template, date: state.date };
  state.events.push(event);
  state.eventLog ??= {};
  state.eventLog[template] = state.date;
  const b = boards(state);
  b.pending = { ...(b.pending ?? {}), [event.id]: { clubId, slot } };
}

// ---------- (b) Mediální rýpnutí ----------

function maybeJab(state: GameState, clubId: string, derby: boolean, gf: number, ga: number, score: string): void {
  const b = state.rivalBoards;
  if (!canAsk(state, 'rival-vyrok') || (b?.lastJab && addDays(b.lastJab, JAB_COOLDOWN) > state.date)) return;
  const e = rivalBoard(state, clubId);
  if (!derby && e.rivalry < 25) return;
  const chance = Math.min(0.7, 0.2 * NATURE_FACTOR[natureOf(clubId)].jab * (derby ? 1.8 : 1) * hostility(e));
  if (hash01(`${state.seed}-${state.date}-${clubId}-vyrok`) >= chance) return;
  boards(state).lastJab = state.date;
  const club = clubLabel(state, clubId);
  const us = clubLabel(state, state.owner.clubId);
  const text =
    gf < ga
      ? `Vedení klubu ${club} po zápase ${score} prohlásilo, že „peníze body nekupují“ a že ${us} je projekt na efekt.`
      : gf > ga
        ? `Vedení klubu ${club} po porážce ${score} zpochybnilo rozhodčí a naznačilo, že ${us} má u svazu nadstandardní vztahy.`
        : `Vedení klubu ${club} po remíze ${score} prohlásilo, že ${us} hraje jen o přežití a sliby fanouškům jsou prázdné.`;
  const cost = roundTo(Math.max(20_000, state.clubs[state.owner.clubId].reputation * 2_000), 10_000);
  pushEvent(state, 'rival-vyrok', clubId, {
    expires: addDays(state.date, 7),
    title: `Klub ${club} si do vás rýpl v médiích`,
    text: `${text} Novináři čekají na vaši reakci.`,
    amount: cost,
    defaultOption: 'mlcet',
    options: [
      { id: 'odpovedet', label: 'Ostře odpovědět', hint: 'Fanoušci +4, média +3 nebo −2 podle ohlasu, rivalita +10, vztah −12.' },
      { id: 'mlcet', label: 'Mlčet', hint: 'Média −1. Rivalita trochu opadne.' },
      { id: 'vecere', label: 'Pozvat vedení na večeři', hint: `Z vašich peněz ${fmt(cost)}. Vztah +20, rivalita −10, kotel to nese nelibě (fanoušci −2). Lepší vztahy = méně přebíjení a lákání sponzorů.` },
    ],
  });
  touchRival(state, clubId, -3, 3, 'výrok v médiích');
}

// ---------- (c) Lákání sponzora ----------

function maybePoach(state: GameState): void {
  const month = Number(state.date.slice(5, 7));
  if (![9, 10, 11, 2, 3, 4].includes(month) || !canAsk(state, 'rival-sponzor')) return;
  const b = state.rivalBoards;
  if (b?.poachSeason === state.season) return;
  const own = state.owner.clubId;
  const club = state.clubs[own];
  const target = (club.sponsors ?? []).filter((c) => c.slot !== 'generalni' && c.untilSeason > state.season).sort((a, c) => c.annual - a.annual)[0];
  if (!target) return;
  const ownRep = club.reputation;
  const candidates = (competitionOf(state, own)?.clubIds ?? [])
    .filter((id) => id !== own && !state.clubs[id].reserveOf && state.clubs[id].reputation >= ownRep - 15)
    .map((id) => ({ item: id, w: NATURE_FACTOR[natureOf(id)].poach * hostility(rivalBoard(state, id)) }));
  const rival = pickWeighted(candidates, hash01(`${state.seed}-${state.date}-kdo-laka`));
  if (!rival) return;
  const chance = Math.min(0.6, 0.25 * NATURE_FACTOR[natureOf(rival)].poach * hostility(rivalBoard(state, rival)));
  if (hash01(`${state.seed}-${state.date}-laka`) >= chance) return;
  boards(state).poachSeason = state.season;
  const name = clubLabel(state, rival);
  const discount = roundTo(target.annual * 0.15, 10_000);
  const pocket = roundTo(target.annual * 0.25, 10_000);
  pushEvent(
    state,
    'rival-sponzor',
    rival,
    {
      expires: addDays(state.date, 10),
      title: `Klub ${name} láká vašeho sponzora ${target.name}`,
      text: `Vedení klubu ${name} nabídlo firmě ${target.name} (${SLOT_LABEL[target.slot]}, ${mil(target.annual)} ročně) lepší podmínky. Pokud nedorovnáte, sponzor odejde.`,
      amount: target.annual,
      defaultOption: 'odejit',
      options: [
        { id: 'sleva', label: 'Dorovnat slevou', hint: `Sponzor zůstane, ale do konce smlouvy platí o 15 % méně (−${mil(discount)} ročně).` },
        { id: 'kapsa', label: 'Dorovnat z vlastních peněz', hint: `Jednorázově ${mil(pocket)} z vaší peněženky. Sponzor zůstane za plnou cenu a vztah s ním se zlepší.` },
        { id: 'odejit', label: 'Nechat odejít', hint: `Přijdete o ${mil(target.annual)} ročně, místo se uvolní pro nové nabídky. Rivalita s klubem ${name} poroste.` },
      ],
    },
    target.slot,
  );
  touchRival(state, rival, -5, 4, `láká sponzora ${target.name}`);
}

// ---------- Vyřízení situací ----------

export function resolveRivalEvent(state: GameState, e: GameEvent, option: string): string {
  const info = state.rivalBoards?.pending?.[e.id];
  if (state.rivalBoards?.pending) delete state.rivalBoards.pending[e.id];
  if (!info || !state.clubs[info.clubId]) return '';
  const name = clubLabel(state, info.clubId);
  const own = state.clubs[state.owner.clubId];
  if (e.template === 'rival-vyrok') {
    if (option === 'odpovedet') {
      const good = hash01(`${state.seed}-${e.id}-ohlas`) < 0.6;
      own.fanMood = clamp(own.fanMood + 4, 0, 100);
      media(state, good ? 3 : -2);
      touchRival(state, info.clubId, -12, 10, 'přestřelka v médiích');
      return good ? `Vaše odpověď zabodovala, fanoušci jsou nadšení. Vztahy s klubem ${name} jsou ale na bodu mrazu.` : `Fanoušci tleskají, novináři ale píší o žabomyších válkách. Vztahy s klubem ${name} se zhoršily.`;
    }
    if (option === 'vecere') {
      const cost = e.amount ?? 0;
      if (state.owner.wallet >= cost) state.owner.wallet -= cost;
      else book(state, own.id, 'ostatni', -cost, `Večeře s vedením klubu ${name}`);
      own.fanMood = clamp(own.fanMood - 2, 0, 100);
      touchRival(state, info.clubId, 20, -10, 'společná večeře');
      return `Večeře s vedením klubu ${name} uklidnila vztahy. Kotel to nese nelibě.`;
    }
    media(state, -1);
    touchRival(state, info.clubId, 0, -3);
    return 'Nechali jste to být. Novináři se brzy chytili jiného tématu.';
  }
  if (e.template === 'rival-sponzor') {
    const contract = (own.sponsors ?? []).find((c) => c.slot === info.slot);
    if (!contract) return 'Sponzor už u klubu není.';
    const pocket = roundTo(contract.annual * 0.25, 10_000);
    if (option === 'kapsa' && state.owner.wallet >= pocket) {
      state.owner.wallet -= pocket;
      changeSponsorRelation(state, contract.slot, 10);
      touchRival(state, info.clubId, -3, 3, `neuspěli se sponzorem ${contract.name}`);
      return `Ze svého jste dorovnali ${mil(pocket)}. ${contract.name} zůstává a váží si toho.`;
    }
    if (option === 'sleva' || option === 'kapsa') {
      contract.annual = roundTo(contract.annual * 0.85, 10_000);
      touchRival(state, info.clubId, -3, 3, `neuspěli se sponzorem ${contract.name}`);
      return `${option === 'kapsa' ? 'Na dorovnání z vlastních peněz nemáte. ' : ''}${contract.name} zůstává se slevou, nově za ${mil(contract.annual)} ročně.`;
    }
    own.sponsors = (own.sponsors ?? []).filter((c) => c !== contract);
    changeSponsorRelation(state, contract.slot, -10);
    touchRival(state, info.clubId, -10, 10, `přetáhli sponzora ${contract.name}`);
    return `${contract.name} odchází ke klubu ${name}. Místo ${SLOT_LABEL[contract.slot]} je volné pro nové nabídky.`;
  }
  return '';
}

/** Šablony situací (vznikají jen z háčků tady, ne náhodným výběrem). */
export function rivalTemplates() {
  const none = { weight: () => 0, create: () => null };
  return {
    'rival-vyrok': { ...none, resolve: (s: GameState, e: GameEvent, o: string) => resolveRivalEvent(s, e, o) },
    'rival-sponzor': { ...none, resolve: (s: GameState, e: GameEvent, o: string) => resolveRivalEvent(s, e, o) },
  };
}
