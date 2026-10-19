import { checkRecordSale, ultrasOnSale } from './surroundings';
import { ffpBlocksSigning } from './finplus';
import { AGENT_STYLE_LABEL, agentFeeFactor, agentOf, agentWageFactor, changeAgentRelation, closeDomino, deadlineDay, deadlineDiscount, releaseClauseFor, startDomino, tipDiscount } from './market';
import { crisisDiscount, noteTimeline } from './league';
import { book, ownerAccounting, playerWage, wageBudgetMonthly } from './finance';
import { schemeWageFactor, wageRoomFor, wageUsage } from './wages';
import { scheduleInstalments } from './financing';
import { logTransfer } from './transferlog';
import { FOREIGN_CLUBS } from './names';
import { directorForeignPick, directorSignForeign } from './foreign';
import { bestEleven, generatePlayer, marketValue, playerAge, SQUAD_SHAPE, squadOf, squadQualityForReputation } from './players';
import type { Rng } from './rng';
import { directorAbility, directorOf, scoutingError, severance, type ActionResult } from './staff';
import type { GameState, IncomingOffer, Negotiation, Player, Position, TransferProposal } from './types';
import { addNews, clamp, clubLabel, FOREIGN_PREFIX, FREE, hash01, isForeign, plural, tierOf, transferWindow } from './world';

const MIN_SQUAD = 18;
/** Velikost kádru, kterou drží sportovní ředitel. */
const SQUAD_TARGET = 22;
const MAX_FREE_AGENTS = 150;

export function playerName(p: Player): string {
  return `${p.firstName} ${p.lastName}`;
}

function roundMoney(v: number, step = 10_000): number {
  return Math.round(v / step) * step;
}

// ---------- Ceny, platy a zájem ----------

/** Transfermarkt hodnotí hráče nižších soutěží výrazně níž než stejně dobré hráče 1. ligy. */
export function leagueValueFactor(tier: number): number {
  return tier === 1 ? 1 : tier === 2 ? 0.4 : tier === 3 ? 0.2 : 0.3;
}

/** Tržní hodnota hráče v Kč podle jeho kvality, věku, potenciálu a soutěže, kde hraje. */
export function playerValue(state: GameState, p: Player): number {
  const v = marketValue(p, state.season) * leagueValueFactor(tierOf(state, p.clubId));
  const step = v >= 10_000_000 ? 1_000_000 : v >= 1_000_000 ? 100_000 : 10_000;
  return Math.max(10_000, Math.round(v / step) * step);
}

/** Tři nejlepší hráči každého klubu (klíčové hráče kluby prodávají dráž). */
export function keyPlayerIds(state: GameState): Set<string> {
  const byClub = new Map<string, Player[]>();
  for (const p of Object.values(state.players)) {
    if (p.clubId === FREE) continue;
    const list = byClub.get(p.clubId);
    if (list) list.push(p);
    else byClub.set(p.clubId, [p]);
  }
  const ids = new Set<string>();
  for (const list of byClub.values()) {
    list.sort((a, b) => b.overall - a.overall).slice(0, 3).forEach((p) => ids.add(p.id));
  }
  return ids;
}

/** Kolik si prodávající klub řekne. Volný hráč je zadarmo. Pro hromadný výpočet předejte keyPlayerIds. */
export function askingPrice(state: GameState, p: Player, keyPlayers?: Set<string>): number {
  if (p.clubId === FREE) return 0;
  const yearsLeft = p.contractUntil - (state.season + 1);
  const contractFactor = yearsLeft <= 0 ? 0.5 : yearsLeft === 1 ? 0.85 : 1;
  const isKey = keyPlayers
    ? keyPlayers.has(p.id)
    : squadOf(state, p.clubId).sort((a, b) => b.overall - a.overall).indexOf(p) < 3;
  const keyFactor = isKey ? 1.35 : 1;
  // Hráč, se kterým majitel potají jednal, tlačí na svůj klub, aby ho pustil levněji.
  const tapped = state.grey?.tapped?.includes(p.id) ? 0.75 : 1;
  // Šetřílek v krizi prodává levněji.
  return roundMoney(playerValue(state, p) * contractFactor * keyFactor * tapped * crisisDiscount(state, p.clubId) * tipDiscount(state, p.id) * deadlineDiscount(state, p.id));
}

/** Tržní plat hráče v daném klubu (kolik by klub jeho úrovně za takového hráče běžně platil). */
export function fairWage(state: GameState, p: Player, clubId: string): number {
  return playerWage(p.overall, state.clubs[clubId].reputation);
}

export function wageDemand(state: GameState, p: Player, clubId: string): number {
  // Volný hráč chce aspoň tržní plat; nárok z minulého klubu mu měsíc po měsíci klesá.
  const anchor = p.clubId === FREE ? p.wage : p.wage * 1.1;
  let demand = Math.max(anchor, fairWage(state, p, clubId));
  if (p.clubId !== FREE && tierOf(state, clubId) > tierOf(state, p.clubId)) demand *= 1.25;
  demand *= 0.95 + 0.2 * hash01(`${p.id}-${state.season}-plat`);
  demand *= schemeWageFactor(state, clubId);
  // Agent hráče (chamtivý tlačí výš, dobrý vztah s majitelem stahuje nároky).
  if (clubId === state.owner.clubId) demand *= agentWageFactor(state, p.id);
  return roundMoney(Math.max(demand, 5_000), 1_000);
}

export function interest(state: GameState, p: Player, clubId: string): { ok: boolean; reason: string } {
  const club = state.clubs[clubId];
  const gap = p.overall - squadQualityForReputation(club.reputation);
  // Vyšší mzdový rozpočet a tréninkový areál přilákají i hráče, kteří by jinak nepřišli.
  if (gap > 12 + (club.policy.wageMultiplier - 1) * 15 + (club.facilities?.complex ? 3 : 0)) return { ok: false, reason: `${playerName(p)} chce hrát ve vyšší úrovni a o přestup nemá zájem.` };
  return { ok: true, reason: '' };
}

/** Hodnocení hráče, jak ho vidí skauti klubu majitele. Vlastní hráče zná klub přesně. */
export function scouted(state: GameState, p: Player): { overall: number; potential: number; exact: boolean } {
  if (p.clubId === state.owner.clubId) return { overall: p.overall, potential: p.potential, exact: true };
  const err = scoutingError(state);
  const n1 = hash01(`${p.id}-${state.season}-o`) * 2 - 1;
  const n2 = hash01(`${p.id}-${state.season}-p`) * 2 - 1;
  const overall = Math.round(p.overall + n1 * err);
  return { overall, potential: Math.max(overall, Math.round(p.potential + n2 * err * 1.5)), exact: false };
}

export function budgetRemaining(state: GameState): number {
  const club = state.clubs[state.owner.clubId];
  const room = club.policy.transferBudget - state.market.spent + state.market.earned;
  // Minimální rezerva: pod ni se kvůli přestupům nejde.
  const reserve = club.policy.cashReserve ?? 0;
  const cash = reserve > 0 ? club.finance.balance - reserve : Infinity;
  return Math.max(0, Math.min(room, cash));
}

export function wageBill(state: GameState, clubId: string): number {
  return squadOf(state, clubId).reduce((s, p) => s + p.wage, 0);
}

/** Nejslabší hráč základní sestavy na dané pozici (podle toho, koho by postavil trenér). */
function weakestStarter(state: GameState, position: Position): number {
  const xi = bestEleven(squadOf(state, state.owner.clubId)).filter((p) => p.position === position);
  return xi.length ? Math.min(...xi.map((p) => p.overall)) : 0;
}

/** Posudek sportovního ředitele na hráče, kterého si vyhlédl majitel. */
export function directorOpinion(state: GameState, p: Player): { recommend: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const view = scouted(state, p);
  const starter = weakestStarter(state, p.position);
  const count = squadOf(state, state.owner.clubId).filter((x) => x.position === p.position).length;
  if (view.overall <= starter && count >= SQUAD_SHAPE[p.position]) reasons.push('Podle našich skautů není lepší než hráči, které máme.');
  const age = playerAge(p, state.season);
  if (age >= 31 && p.clubId !== FREE) reasons.push(`Je mu ${age} let, investice se nevrátí.`);
  if (askingPrice(state, p) > budgetRemaining(state)) reasons.push('Cena přesahuje rozpočet na přestupy.');
  const own = state.owner.clubId;
  const demand = wageDemand(state, p, own);
  if (demand > fairWage(state, p, own) * 1.3) reasons.push('Jeho platové nároky by narušily mzdovou strukturu kádru.');
  if (wageBill(state, own) + demand > wageBudgetMonthly(state.clubs[own])) reasons.push('S jeho platem překročíme mzdový rozpočet.');
  return { recommend: reasons.length === 0, reasons };
}

// ---------- Provedení přestupu ----------

export interface TransferOptions {
  /** Odstupné ve splátkách (polovina hned, čtvrtina za půl roku, čtvrtina za rok). */
  instalments?: boolean;
  /** Prodávající si vymíní podíl z dalšího prodeje (0–1). */
  sellOn?: number;
  /** Hostování (jen pro historii přestupů). */
  loan?: boolean;
}

export function executeTransfer(state: GameState, p: Player, toId: string, fee: number, wage: number, years: number, opts: TransferOptions = {}): void {
  const fromId = p.clubId;
  const own = state.owner.clubId;
  if (fee > 0) {
    // Podíl z dalšího prodeje pro bývalý klub.
    let toSeller = fee;
    if (p.sellOn && p.sellOn.clubId !== fromId && state.clubs[p.sellOn.clubId]) {
      const share = Math.round(fee * p.sellOn.pct);
      toSeller -= share;
      book(state, p.sellOn.clubId, 'prestupy', share, `Podíl z dalšího prodeje: ${playerName(p)}`);
      if (p.sellOn.clubId === own) {
        state.market.earned += share * 0.5;
        addNews(state, { kind: 'info', title: `Podíl z dalšího prodeje: ${playerName(p)}`, text: `Klub dostal ${share.toLocaleString('cs-CZ')} Kč z jeho dalšího přestupu (nový klub: ${clubLabel(state, toId)}).` });
      }
    }
    p.sellOn = undefined;
    const split = opts.instalments && !isForeign(toId) && fromId !== FREE && (toId === own || fromId === own);
    const now = split ? scheduleInstalments(state, toId, fromId, toSeller, `Splátka přestupu ${playerName(p)}`) : toSeller;
    if (fromId !== FREE) book(state, fromId, 'prestupy', now, `Prodej: ${playerName(p)}${split ? ' (1. splátka)' : ''}`);
    if (!isForeign(toId)) book(state, toId, 'prestupy', -(now + fee - toSeller), `Nákup: ${playerName(p)}${split ? ' (1. splátka)' : ''}`);
  }
  if (opts.sellOn && fromId === own) p.sellOn = { clubId: own, pct: opts.sellOn };
  if (toId === own) state.market.spent += fee;
  if (fromId === own) {
    state.market.earned += fee * 0.5;
    // Účetně: zisk = odstupné minus dosud neodepsaná hodnota registrace.
    ownerAccounting(state).saleProfit += fee - (p.bookValue ?? 0);
    p.bookValue = undefined;
    p.amortization = undefined;
  }
  p.transfers = [...(p.transfers ?? []), { date: state.date, from: clubLabel(state, fromId), to: clubLabel(state, toId), fee }];
  state.market.history.unshift({ date: state.date, playerName: playerName(p), fromId, toId, fee });
  state.market.history.length = Math.min(state.market.history.length, 100);
  logTransfer(state, p, fromId, toId, fee, opts.loan ? 'hostovani' : undefined);
  state.market.listed = state.market.listed.filter((id) => id !== p.id);
  state.market.offers = state.market.offers.filter((o) => o.playerId !== p.id);
  state.market.proposals = state.market.proposals.filter((o) => o.playerId !== p.id);

  if (isForeign(toId)) {
    // Hráč odchází do ciziny a z české simulace mizí.
    delete state.players[p.id];
    return;
  }
  p.clubId = toId;
  p.wage = wage;
  p.contractUntil = state.season + Math.max(1, years);
  if (toId === own && fee > 0) {
    p.bookValue = fee;
    p.amortization = fee / monthsUntilContractEnd(state.date, p.contractUntil);
  }
}

/** Počet měsíců do konce smlouvy (30. 6. roku contractUntil), nejméně 1. */
export function monthsUntilContractEnd(date: string, contractUntil: number): number {
  const [y, m] = date.split('-').map(Number);
  return Math.max(1, (contractUntil - y) * 12 + (6 - m) + 1);
}

// ---------- Vyjednávání majitele ----------

function negotiationPrices(state: GameState, p: Player) {
  const skill = directorAbility(state);
  const asking = askingPrice(state, p);
  const minFee = roundMoney(asking * (1.05 - (skill - 50) / 250) * (0.92 + 0.16 * hash01(`${p.id}-${state.date}-cena`)));
  const minWage = roundMoney(wageDemand(state, p, state.owner.clubId) * (1.02 - (skill - 50) / 400), 1_000);
  return { asking, minFee, minWage };
}

export function startNegotiation(prev: GameState, playerId: string): ActionResult {
  const p = prev.players[playerId];
  if (!p) return { state: prev, ok: false, message: 'Hráč neexistuje.' };
  if (!transferWindow(prev.date)) return { state: prev, ok: false, message: 'Přestupní okno je zavřené. Otevírá se 1. 7. a 8. 1.' };
  if (p.clubId === prev.owner.clubId) return { state: prev, ok: false, message: 'Hráč už hraje za váš klub.' };
  const want = interest(prev, p, prev.owner.clubId);
  if (!want.ok) return { state: prev, ok: false, message: want.reason };
  const ffp = p.clubId !== FREE ? ffpBlocksSigning(prev) : undefined;
  if (ffp) return { state: prev, ok: false, message: ffp };

  const state = structuredClone(prev);
  const { asking, minFee, minWage } = negotiationPrices(state, p);
  const opinion = directorOf(state, state.owner.clubId) ? directorOpinion(state, p) : { recommend: true, reasons: [] };
  const free = p.clubId === FREE;
  const negotiation: Negotiation = {
    playerId,
    sellerId: p.clubId,
    stage: free ? 'hrac' : 'klub',
    askingFee: asking,
    minFee: free ? 0 : minFee,
    agreedFee: 0,
    minWage,
    roundsLeft: 3,
    againstAdvice: !opinion.recommend,
    log: [
      free
        ? `${playerName(p)} je volný hráč. Jednáte rovnou o smlouvě.`
        : `${clubLabel(state, p.clubId)} si za hráče říká ${asking.toLocaleString('cs-CZ')} Kč.`,
    ],
  };
  if (!opinion.recommend) negotiation.log.push(`Sportovní ředitel přestup nedoporučuje: ${opinion.reasons.join(' ')}`);
  // Konkurence: o dobrého hráče se může přetahovat i jiný klub.
  const rival = rivalBidder(state, p);
  if (rival) {
    negotiation.rival = rival;
    negotiation.log.push(`O hráče usiluje i ${clubLabel(state, rival.clubId)}: nabízí ${rival.fee.toLocaleString('cs-CZ')} Kč a plat ${rival.wage.toLocaleString('cs-CZ')} Kč.`);
  }
  const agent = agentOf(state, p.id);
  negotiation.log.push(`Hráče zastupuje agent ${agent.name} (${AGENT_STYLE_LABEL[agent.style].label}, vztah ${Math.round(agent.relation)}).`);
  state.market.negotiation = negotiation;
  return { state, ok: true, message: negotiation.log.join(' ') };
}

/** Konkurenční klub, který o hráče usiluje taky (u lepších hráčů častěji). */
function rivalBidder(state: GameState, p: Player): Negotiation['rival'] {
  const own = state.owner.clubId;
  const level = bestEleven(squadOf(state, own)).reduce((a, x) => a + x.overall, 0) / 11;
  const chance = p.overall >= level ? 0.35 : p.overall >= level - 4 ? 0.15 : 0;
  if (hash01(`${p.id}-${state.date}-rival`) >= chance) return undefined;
  const ownRep = state.clubs[own].reputation;
  const comp = Object.values(state.competitions).find((c) => c.clubIds.includes(own));
  const clubs = (comp?.clubIds ?? []).filter((id) => id !== own && id !== p.clubId && state.clubs[id].reputation >= ownRep - 8 && !state.clubs[id].reserveOf);
  if (!clubs.length) return undefined;
  const clubId = clubs[Math.floor(hash01(`${p.id}-rivalclub`) * clubs.length)];
  const fee = p.clubId === FREE ? 0 : roundMoney(askingPrice(state, p) * (1 + 0.2 * hash01(`${p.id}-rivalfee`)));
  const wage = roundMoney(wageDemand(state, p, own) * (1.05 + 0.1 * hash01(`${p.id}-rivalwage`)), 1_000);
  return { clubId, fee, wage };
}

/** Jednání skončilo neúspěchem a hráče přetáhl konkurent. */
function loseToRival(state: GameState, neg: Negotiation): string {
  const p = state.players[neg.playerId];
  if (!neg.rival || !p || p.clubId === state.owner.clubId) return '';
  executeTransfer(state, p, neg.rival.clubId, neg.rival.fee, neg.rival.wage, 3);
  state.owner.trust.reditel = clamp(state.owner.trust.reditel - 1, 0, 100);
  addNews(state, { kind: 'info', title: `${playerName(p)} přestupuje jinam: ${clubLabel(state, neg.rival.clubId)}`, text: 'Souboj o hráče jsme prohráli.' });
  return ` Hráče přetáhl ${clubLabel(state, neg.rival.clubId)}.`;
}

export function cancelNegotiation(prev: GameState): GameState {
  if (!prev.market.negotiation) return prev;
  const state = structuredClone(prev);
  state.market.negotiation = undefined;
  return state;
}

export function offerFee(prev: GameState, fee: number, instalments = false, conditional = false): ActionResult {
  const n = prev.market.negotiation;
  if (!n || n.stage !== 'klub') return { state: prev, ok: false, message: 'Neprobíhá jednání s klubem.' };
  if (!Number.isFinite(fee) || fee < 0) return { state: prev, ok: false, message: 'Zadejte platnou částku.' };
  const value = roundMoney(fee);
  if (value > budgetRemaining(prev)) {
    return { state: prev, ok: false, message: 'Na tolik nemá sportovní ředitel schválený rozpočet. Navyšte ho ve Financích.' };
  }
  const state = structuredClone(prev);
  const neg = state.market.negotiation!;
  const seller = clubLabel(state, neg.sellerId);
  let message: string;
  // Splátky prodávající přijme jen s příplatkem 5 %, doplatek při postupu/Evropě počítá napůl.
  const effective = (instalments ? value / 1.05 : value) * (conditional ? 1.15 : 1);
  const required = Math.max(neg.minFee, neg.rival ? neg.rival.fee * 1.02 : 0);
  if (effective >= required) {
    neg.stage = 'hrac';
    neg.agreedFee = value;
    neg.instalments = instalments;
    neg.conditional = conditional;
    neg.counter = undefined;
    neg.roundsLeft = 3;
    message = `${seller} přijal nabídku ${value.toLocaleString('cs-CZ')} Kč. Teď je na řadě smlouva s hráčem.`;
  } else {
    neg.roundsLeft -= 1;
    if (neg.roundsLeft <= 0) {
      neg.stage = 'neuspech';
      message = `${seller} ukončil jednání.${loseToRival(state, neg)}`;
    } else if (neg.rival && effective >= neg.minFee) {
      neg.counter = roundMoney(neg.rival.fee * 1.03);
      message = `${seller} dává přednost nabídce ${clubLabel(state, neg.rival.clubId)} (${neg.rival.fee.toLocaleString('cs-CZ')} Kč). Musíte přeplatit.`;
    } else if (effective >= neg.minFee * 0.75) {
      neg.counter = roundMoney(Math.max(neg.minFee, (neg.askingFee + value) / 2));
      message = `${seller} nabídku odmítl a požaduje ${neg.counter.toLocaleString('cs-CZ')} Kč.`;
    } else {
      message = `${seller} nabídku ${value.toLocaleString('cs-CZ')} Kč odmítl jako nevážnou.`;
    }
  }
  neg.log.push(message);
  return { state, ok: neg.stage !== 'neuspech', message };
}

export function offerTerms(prev: GameState, wage: number, years: number, release = false): ActionResult {
  const n = prev.market.negotiation;
  if (!n || n.stage !== 'hrac') return { state: prev, ok: false, message: 'Neprobíhá jednání s hráčem.' };
  if (!Number.isFinite(wage) || wage < 0 || !Number.isFinite(years)) return { state: prev, ok: false, message: 'Zadejte platný plat a délku smlouvy.' };
  const state = structuredClone(prev);
  const neg = state.market.negotiation!;
  const p = state.players[neg.playerId];
  const value = roundMoney(wage, 1_000);
  let message: string;

  if (p.clubId !== neg.sellerId) {
    neg.stage = 'neuspech';
    message = `${playerName(p)} mezitím přestoupil jinam.`;
  } else if (value >= Math.max(neg.minWage * (release ? 0.9 : 1), neg.rival ? neg.rival.wage : 0)) {
    const own = state.owner.clubId;
    const sellerId = p.clubId;
    executeTransfer(state, p, own, neg.agreedFee, value, clamp(years, 1, 5), { instalments: neg.instalments });
    if (release) p.releaseClause = releaseClauseFor(state, p, neg.agreedFee);
    if (neg.conditional && neg.agreedFee > 0) {
      const tier = tierOf(state, own);
      state.conditionals = [...(state.conditionals ?? []), { playerId: p.id, playerName: playerName(p), sellerId, amount: roundMoney(neg.agreedFee * 0.3), season: state.season, kind: tier === 1 ? 'evropa' : 'postup' }];
    }
    const agentFee = Math.round(value * 2 * agentFeeFactor(state, p.id));
    changeAgentRelation(state, p.id, 4);
    book(state, own, 'prestupy', -agentFee, `Odměna agentovi: ${playerName(p)}`);
    ownerAccounting(state).agentFees += agentFee;
    neg.stage = 'hotovo';
    message = `${playerName(p)} podepsal smlouvu na ${plural(clamp(years, 1, 5), 'rok', 'roky', 'let')} za ${value.toLocaleString('cs-CZ')} Kč měsíčně.`;
    addNews(state, {
      kind: 'info',
      title: `Posila: ${playerName(p)}`,
      text: `${message} Odstupné ${neg.agreedFee.toLocaleString('cs-CZ')} Kč, odměna agentovi ${agentFee.toLocaleString('cs-CZ')} Kč.`,
    });
    if (neg.againstAdvice && directorOf(state, own)) {
      state.owner.trust.reditel = clamp(state.owner.trust.reditel - 8, 0, 100);
      addNews(state, { kind: 'varovani', title: 'Sportovní ředitel nesouhlasil s přestupem', text: 'Prosadil jste přestup proti jeho doporučení. Jeho důvěra ve vás klesla.' });
    }
  } else {
    neg.roundsLeft -= 1;
    if (neg.roundsLeft <= 0) {
      neg.stage = 'neuspech';
      changeAgentRelation(state, p.id, -2);
      message = `${playerName(p)} a jeho agent jednání ukončili.${loseToRival(state, neg)}`;
    } else if (neg.rival && value >= neg.minWage) {
      neg.counter = neg.rival.wage;
      message = `${clubLabel(state, neg.rival.clubId)} nabízí plat ${neg.rival.wage.toLocaleString('cs-CZ')} Kč. Agent chce aspoň tolik.`;
    } else if (value >= neg.minWage * (release ? 0.9 : 1) * 0.85) {
      neg.counter = roundMoney(neg.minWage * (release ? 0.9 : 1), 1_000);
      message = `Agent požaduje ${neg.counter.toLocaleString('cs-CZ')} Kč měsíčně.`;
    } else {
      message = 'Agent nabídku odmítl jako urážlivou.';
    }
  }
  neg.log.push(message);
  return { state, ok: neg.stage !== 'neuspech', message };
}

// ---------- Návrhy sportovního ředitele ----------

function positionNeeds(state: GameState): Position[] {
  const squad = squadOf(state, state.owner.clubId);
  return (Object.keys(SQUAD_SHAPE) as Position[])
    .map((pos) => {
      const missing = SQUAD_SHAPE[pos] - squad.filter((p) => p.position === pos).length;
      return { pos, score: missing * 10 - weakestStarter(state, pos) };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.pos);
}

export function generateProposals(state: GameState): void {
  const own = state.owner.clubId;
  if (!directorOf(state, own) || !transferWindow(state.date)) {
    state.market.proposals = [];
    return;
  }
  const budget = budgetRemaining(state);
  const fair = (p: Player) => fairWage(state, p, own);
  const wageRoom = wageBudgetMonthly(state.clubs[own]) * 1.05 - wageBill(state, own);
  const proposals: TransferProposal[] = [];
  const needs = positionNeeds(state);
  for (const pos of needs.slice(0, 2)) {
    const bar = weakestStarter(state, pos) + 2;
    const pool = Object.values(state.players)
      .filter((p) => p.position === pos && p.clubId !== own && playerAge(p, state.season) <= 31)
      .map((p) => ({ p, view: scouted(state, p) }))
      .filter((x) => x.view.overall >= bar && interest(state, x.p, own).ok)
      .sort((a, b) => b.view.overall - a.view.overall)
      .slice(0, 40)
      .map((x) => ({ ...x, fee: askingPrice(state, x.p) }))
      .filter((x) => x.fee <= budget)
      .filter((x) => {
        const demand = wageDemand(state, x.p, own);
        // V nižších soutěžích jsou platy blízko minima, a tak je povolená větší odchylka od férového platu.
        return demand <= fair(x.p) * (tierOf(state, own) >= 2 ? 2 : 1.4) && demand <= wageRoom;
      })
      .sort((a, b) => b.view.overall - a.view.overall - (b.fee - a.fee) / Math.max(budget, 1_000_000));
    for (const x of pool.slice(0, pos === needs[0] ? 2 : 1)) {
      if (proposals.length >= 3) break;
      proposals.push({
        id: `n${++state.nextId}`,
        playerId: x.p.id,
        estimatedFee: x.fee,
        estimatedWage: wageDemand(state, x.p, own),
        note:
          x.p.clubId === FREE
            ? `Volný hráč, posílil by ${({ GK: 'post brankáře', DF: 'obranu', MF: 'zálohu', FW: 'útok' } as const)[pos]}. Skauti ho hodnotí na ${x.view.overall}.`
            : `Současný klub: ${clubLabel(state, x.p.clubId)}. Skauti ho hodnotí na ${x.view.overall}, náš nejslabší člen základní sestavy na pozici má ${bar - 2}.`,
      });
    }
  }
  state.market.proposals = proposals;
}

/** Majitel schválil návrh: ředitel přestup dojedná sám. */
export function approveProposal(prev: GameState, proposalId: string): ActionResult {
  const proposal = prev.market.proposals.find((x) => x.id === proposalId);
  if (!proposal) return { state: prev, ok: false, message: 'Návrh už neplatí.' };
  const state = structuredClone(prev);
  state.market.proposals = state.market.proposals.filter((x) => x.id !== proposalId);
  const p = state.players[proposal.playerId];
  const own = state.owner.clubId;
  const { minFee, minWage } = negotiationPrices(state, p);
  const fee = p.clubId === FREE ? 0 : minFee;
  let message: string;
  if (!transferWindow(state.date)) message = 'Přestupní okno je zavřené.';
  else if (p.clubId === own) message = 'Hráč už je náš.';
  else if (!interest(state, p, own).ok) message = interest(state, p, own).reason;
  else if (fee > budgetRemaining(state)) message = `Klub ${clubLabel(state, p.clubId)} chce ${fee.toLocaleString('cs-CZ')} Kč, na to rozpočet nestačí.`;
  else if (wageRoomFor(state, p, minWage) < 0) {
    message = `${playerName(p)} chce ${minWage.toLocaleString('cs-CZ')} Kč měsíčně, to se nevejde do mzdového rozpočtu. Zvyšte ho ve Financích.`;
  }
  else {
    executeTransfer(state, p, own, fee, minWage, 3);
    book(state, own, 'prestupy', -minWage * 2, `Odměna agentovi: ${playerName(p)}`);
    ownerAccounting(state).agentFees += minWage * 2;
    state.owner.trust.reditel = clamp(state.owner.trust.reditel + 2, 0, 100);
    message = `Sportovní ředitel dotáhl přestup: ${playerName(p)} za ${fee.toLocaleString('cs-CZ')} Kč, plat ${minWage.toLocaleString('cs-CZ')} Kč měsíčně.`;
    addNews(state, { kind: 'info', title: `Posila: ${playerName(p)}`, text: message });
    return { state, ok: true, message };
  }
  addNews(state, { kind: 'varovani', title: `Přestup se nepovedl: ${playerName(p)}`, text: message });
  return { state, ok: false, message };
}

export function rejectProposal(prev: GameState, proposalId: string): GameState {
  const state = structuredClone(prev);
  state.market.proposals = state.market.proposals.filter((x) => x.id !== proposalId);
  state.owner.trust.reditel = clamp(state.owner.trust.reditel - 1, 0, 100);
  return state;
}

// ---------- Nabídky na naše hráče ----------

/** Zahraniční klub, který by o hráče dané kvality stál (nebo nikdo). */
function foreignBuyer(rng: Rng, p: Player, season: number): { id: string; level: number } | undefined {
  const age = playerAge(p, season);
  if (age > 29 || p.overall < 60) return undefined;
  const level = p.overall >= 72 ? rng.pick([1, 1, 2]) : p.overall >= 66 ? rng.pick([2, 2, 3]) : 3;
  const pool = FOREIGN_CLUBS.filter((c) => c.level === level);
  const club = rng.pick(pool);
  return { id: FOREIGN_PREFIX + club.id, level };
}

/** Odstupné, které klub nabídne: zahraniční kluby platí víc, nabídnutý hráč jde levněji. */
function offerFeeFor(rng: Rng, value: number, foreignLevel: number | undefined, listed: boolean): number {
  const [lo, hi] = foreignLevel === 1 ? [1.05, 1.35] : foreignLevel === 2 ? [0.95, 1.25] : foreignLevel === 3 ? [0.8, 1.1] : [0.85, 1.2];
  // Strop podle úrovně kupce: nejbohatší ligy zaplatí nejvýš asi 20 mil. €, menší výrazně méně.
  const cap = foreignLevel === 1 ? 500_000_000 : foreignLevel === 2 ? 250_000_000 : foreignLevel === 3 ? 120_000_000 : 300_000_000;
  return roundMoney(Math.min(cap, value * (lo + rng.next() * (hi - lo)) * (listed ? 0.85 : 1)));
}

export function generateOffers(state: GameState, rng: Rng): void {
  const own = state.owner.clubId;
  const policy = state.clubs[own].policy.salesPolicy ?? 'dobra';
  // Prodejní klub: sportovní ředitel sám přijme doporučené nabídky na hráče mimo opory, které majitel
  // nechal propadnout (nebo kterým by propadly až po zavření okna).
  const mayTrade = !state.clubs[own].policy.delegation || state.clubs[own].policy.delegation.director === 'vysoka';
  if (policy === 'prodejni' && state.clubs[own].policy.autoSquad !== false && mayTrade && !state.owner.ousted) {
    const md = state.date.slice(5);
    const closing = (md >= '08-24' && md <= '08-31') || (md >= '02-07' && md <= '02-14');
    // Chráněné jsou opory i dva nejbližší za nimi: jeden nově podepsaný hráč tak oporu hned neodsune na prodej.
    const core = new Set(squadOf(state, own).sort((a, b) => b.overall - a.overall).slice(0, 8).map((p) => p.id));
    for (const o of state.market.offers.filter((x) => (x.expires < state.date || closing) && x.advice === 'prijmout' && !core.has(x.playerId) && state.players[x.playerId]?.clubId === own)) {
      const r = acceptOffer(state, o.id);
      if (r.ok) {
        Object.assign(state, r.state);
        // Prodej udělal ředitel sám: zpráva to musí říct jasně.
        const n = state.news[0];
        if (n?.title.startsWith('Prodej: ')) n.title = `Sportovní ředitel prodal: ${n.title.slice(8)} za ${(o.fee / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`;
      }
    }
  }
  state.market.offers = state.market.offers.filter((o) => o.expires >= state.date && state.players[o.playerId]?.clubId === own);
  if (!transferWindow(state.date)) return;
  const interest = { drzet: 0.4, dobra: 1, prodejni: 2 }[policy];
  const maxOffers = policy === 'prodejni' ? 6 : 4;

  const squad = squadOf(state, own).sort((a, b) => b.overall - a.overall);
  const ownRep = state.clubs[own].reputation;
  const domestic = Object.values(state.competitions)
    .flatMap((c) => c.clubIds)
    .filter((id) => id !== own && !state.clubs[id].reserveOf && state.clubs[id].reputation >= ownRep - 5);

  squad.forEach((p, rank) => {
    if (p.loan) return;
    if (state.market.offers.length >= maxOffers || state.market.offers.some((o) => o.playerId === p.id)) return;
    const listed = state.market.listed.includes(p.id) || (p.morale ?? 60) < 25;
    const value = playerValue(state, p);

    // Zahraničí: hlavní odbytiště pro nejlepší hráče české ligy.
    // Hráč ze sestavy kola přitahuje pozornost kupců.
    const spotlight = 1 + 0.5 * Math.min(3, p.spotlight ?? 0);
    const foreignChance = p.overall >= 60 ? (0.015 + (p.overall - 60) * 0.006) * (listed ? 3 : 1) * interest * spotlight : 0;
    const domesticChance = domestic.length ? 0.025 * (listed ? 4 : 1) * (rank < 5 ? 1.5 : 1) * interest : 0;
    let buyerId: string | undefined;
    let level: number | undefined;
    if (rng.chance(foreignChance)) {
      const f = foreignBuyer(rng, p, state.season);
      if (f) ({ id: buyerId, level } = f);
    }
    if (!buyerId && rng.chance(domesticChance)) buyerId = rng.pick(domestic);
    if (!buyerId) return;

    // Agent s kontakty do ciziny prodá dráž do zahraničí.
    const contacts = level && agentOf(state, p.id).style === 'kontakty' ? 1.08 : 1;
    const fee = roundMoney(offerFeeFor(rng, value, level, listed) * contacts);
    if (fee <= 0) return;
    const deadline = !!deadlineDay(state);
    const key = rank < 5;
    // Opory se prodávají jen za výrazně víc, než jsou, i v prodejním klubu.
    const goodPrice = policy === 'drzet' ? value * 1.4 : policy === 'prodejni' && !key ? value * 0.95 : value * 1.15;
    const advice: IncomingOffer['advice'] =
      fee >= goodPrice || listed || (!key && playerAge(p, state.season) >= 30 && policy !== 'drzet') || (policy === 'prodejni' && !key) ? 'prijmout' : 'odmitnout';
    state.market.offers.push({
      id: `o${++state.nextId}`,
      playerId: p.id,
      buyerId,
      fee,
      expires: addDaysIso(state.date, deadline ? 1 : 10),
      instalments: !isForeign(buyerId) && rng.chance(0.5),
      advice,
      note:
        advice === 'prijmout'
          ? 'Sportovní ředitel doporučuje nabídku přijmout.'
          : key
            ? 'Sportovní ředitel doporučuje odmítnout: je to opora týmu.'
            : 'Sportovní ředitel doporučuje odmítnout: hráč má vyšší hodnotu.',
    });
    addNews(state, { kind: 'info', title: `${playerName(p)}: ${clubLabel(state, buyerId)} nabízí ${fee.toLocaleString('cs-CZ')} Kč` });
    // Souboj o hráče: druhý kupec přihodí.
    const second = rng.chance(0.2) ? (isForeign(buyerId) ? domestic.find((id) => id !== buyerId) : foreignBuyer(rng, p, state.season)?.id) : undefined;
    if (second && second !== buyerId) {
      const fee2 = roundMoney(fee * (1.05 + rng.next() * 0.1));
      state.market.offers[state.market.offers.length - 1].competing = true;
      state.market.offers.push({ id: `o${++state.nextId}`, playerId: p.id, buyerId: second, fee: fee2, expires: addDaysIso(state.date, deadline ? 1 : 7), instalments: false, competing: true, advice: fee2 >= goodPrice || advice === 'prijmout' ? 'prijmout' : 'odmitnout', note: `Přihazuje proti nabídce ${clubLabel(state, buyerId)}.` });
      addNews(state, { kind: 'info', title: `${playerName(p)}: ${clubLabel(state, second)} přihazuje ${fee2.toLocaleString('cs-CZ')} Kč` });
    }
  });
}

/**
 * Letní prodeje ostatních klubů do zahraničí: nejlepší mladší hráči odcházejí za skutečné peníze.
 * Kluby tím kryjí ztrátu stejně jako ve skutečnosti.
 */
export function aiSalesAbroad(state: GameState, rng: Rng): void {
  const own = state.owner.clubId;
  for (const comp of Object.values(state.competitions)) {
    for (const clubId of comp.clubIds) {
      if (clubId === own) continue;
      for (const p of squadOf(state, clubId)) {
        if (p.overall < 64 || playerAge(p, state.season) > 28) continue;
        if (!rng.chance(0.08 + (p.overall - 64) * 0.025)) continue;
        const buyer = foreignBuyer(rng, p, state.season);
        if (!buyer) continue;
        const fee = offerFeeFor(rng, playerValue(state, p), buyer.level, false);
        const name = playerName(p);
        executeTransfer(state, p, buyer.id, fee, p.wage, 3);
        if (comp.tier === 1 && fee >= 25_000_000) {
          addNews(state, {
            kind: 'info',
            title: `Přestup ligy: ${name} (${clubLabel(state, clubId)} → ${clubLabel(state, buyer.id)})`,
            text: `Odstupné ${(fee / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč.`,
          });
        }
      }
    }
  }
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Prodej s podílem z dalšího prodeje: o 15 % méně teď, 20 % z příštího přestupu hráče. */
export const SELL_ON_DISCOUNT = 0.15;
export const SELL_ON_PCT = 0.2;

export function acceptOffer(prev: GameState, offerId: string, sellOn = false): ActionResult {
  const offer = prev.market.offers.find((o) => o.id === offerId);
  if (!offer) return { state: prev, ok: false, message: 'Nabídka už neplatí.' };
  const state = structuredClone(prev);
  const p = state.players[offer.playerId];
  const squad = squadOf(state, state.owner.clubId).sort((a, b) => b.overall - a.overall);
  const key = squad.indexOf(p) < 5;
  const fee = sellOn ? Math.round(offer.fee * (1 - SELL_ON_DISCOUNT)) : offer.fee;
  executeTransfer(state, p, offer.buyerId, fee, Math.round(p.wage * 1.2), 3, { instalments: offer.instalments, sellOn: sellOn && !isForeign(offer.buyerId) ? SELL_ON_PCT : undefined });
  if (offer.advice === 'odmitnout') state.owner.trust.reditel = clamp(state.owner.trust.reditel - 4, 0, 100);
  if (key) state.owner.trust.trener = clamp(state.owner.trust.trener - 5, 0, 100);
  if (squad.indexOf(p) < 3) noteTimeline(state, `prodej opory ${p.lastName}`);
  if (squad.indexOf(p) < 5) startDomino(state, p, fee);
  if (squad.indexOf(p) < 3) ultrasOnSale(state);
  checkRecordSale(state, playerName(p), fee);
  if (offer.advice === 'prijmout') changeAgentRelation(state, p.id, 2);
  const message = `${playerName(p)} přestupuje za ${fee.toLocaleString('cs-CZ')} Kč, nový klub: ${clubLabel(state, offer.buyerId)}${offer.instalments ? ' (ve splátkách)' : ''}${sellOn && !isForeign(offer.buyerId) ? `, s podílem ${Math.round(SELL_ON_PCT * 100)} % z dalšího prodeje` : ''}.`;
  addNews(state, { kind: 'info', title: `Prodej: ${playerName(p)}`, text: key ? `${message} Trenér nese odchod opory nelibě.` : message });
  return { state, ok: true, message };
}

export function rejectOffer(prev: GameState, offerId: string): GameState {
  const offer = prev.market.offers.find((o) => o.id === offerId);
  if (!offer) return prev;
  const state = structuredClone(prev);
  state.market.offers = state.market.offers.filter((o) => o.id !== offerId);
  if (offer.advice === 'prijmout') state.owner.trust.reditel = clamp(state.owner.trust.reditel - 1, 0, 100);
  return state;
}

export function toggleListed(prev: GameState, playerId: string): GameState {
  const state = structuredClone(prev);
  const listed = state.market.listed;
  state.market.listed = listed.includes(playerId) ? listed.filter((id) => id !== playerId) : [...listed, playerId];
  return state;
}

// ---------- Smlouvy ----------

export function releaseCost(state: GameState, p: Player): number {
  return Math.round(severance(state, p) * 0.5);
}

export function releasePlayer(prev: GameState, playerId: string): ActionResult {
  const p = prev.players[playerId];
  if (!p || p.clubId !== prev.owner.clubId) return { state: prev, ok: false, message: 'Hráč nepatří do klubu.' };
  if (p.loan) {
    // Hostování lze ukončit předčasně: hráč se vrátí bez odstupného.
    const state = structuredClone(prev);
    delete state.players[playerId];
    const message = `${playerName(p)} ukončil hostování a vrací se do mateřského klubu (${clubLabel(state, p.loan.fromId)}).`;
    addNews(state, { kind: 'info', title: message });
    return { state, ok: true, message };
  }
  const state = structuredClone(prev);
  const cost = releaseCost(state, p);
  if (cost > 0) book(state, p.clubId, 'platy', -cost, `Vyplacení smlouvy: ${playerName(p)}`);
  const player = state.players[playerId];
  if (player.bookValue) ownerAccounting(state).writeOffs += player.bookValue;
  player.bookValue = undefined;
  player.amortization = undefined;
  player.transfers = [...(player.transfers ?? []), { date: state.date, from: clubLabel(state, player.clubId), to: 'bez klubu', fee: 0 }];
  logTransfer(state, player, player.clubId, FREE, 0);
  player.clubId = FREE;
  state.market.listed = state.market.listed.filter((id) => id !== playerId);
  state.market.offers = state.market.offers.filter((o) => o.playerId !== playerId);
  const message = `${playerName(player)} odešel z klubu. Vyplacení smlouvy stálo ${cost.toLocaleString('cs-CZ')} Kč.`;
  addNews(state, { kind: 'info', title: message });
  return { state, ok: true, message };
}

export function contractExpiring(state: GameState, p: Player): boolean {
  // Hráč na hostování se po sezóně vrací, smlouva se neprodlužuje.
  return !p.loan && p.contractUntil <= state.season + 1;
}

export function renewalDemand(state: GameState, p: Player): number {
  const base = Math.max(p.wage * 1.1, fairWage(state, p, p.clubId));
  return roundMoney(base * (1 + 0.25 * hash01(`${p.id}-${state.season}-prodlouzeni`)) * schemeWageFactor(state, p.clubId), 1_000);
}

export function renewContract(prev: GameState, playerId: string, wage: number, years: number): ActionResult {
  const p = prev.players[playerId];
  if (!p || p.clubId !== prev.owner.clubId) return { state: prev, ok: false, message: 'Hráč nepatří do klubu.' };
  const gap = p.overall - squadQualityForReputation(prev.clubs[p.clubId].reputation);
  if (gap > 10) return { state: prev, ok: false, message: `${playerName(p)} chce odejít do lepšího klubu a smlouvu neprodlouží.` };
  if ((p.morale ?? 60) < 25) return { state: prev, ok: false, message: `${playerName(p)} je nespokojený, protože málo hraje, a smlouvu teď neprodlouží.` };
  if (!Number.isFinite(wage) || !Number.isFinite(years)) return { state: prev, ok: false, message: 'Zadejte platnou částku a délku smlouvy.' };
  const demand = renewalDemand(prev, p);
  if (wage < demand) return { state: prev, ok: false, message: `${playerName(p)} chce aspoň ${demand.toLocaleString('cs-CZ')} Kč měsíčně.` };
  const state = structuredClone(prev);
  const player = state.players[playerId];
  player.wage = roundMoney(wage, 1_000);
  player.contractUntil = Math.max(player.contractUntil, state.season + clamp(years, 1, 5));
  player.morale = Math.min(100, (player.morale ?? 60) + 10);
  if (player.bookValue) player.amortization = player.bookValue / monthsUntilContractEnd(state.date, player.contractUntil);
  const message = `${playerName(player)} prodloužil smlouvu do roku ${player.contractUntil}.`;
  addNews(state, { kind: 'info', title: message });
  return { state, ok: true, message };
}

// ---------- Údržba trhu ----------

/** Na konci sezóny: hráčům klubu majitele bez prodloužené smlouvy vyprší kontrakt, ostatní kluby část hráčů propustí. */
export function seasonEndContracts(state: GameState, rng: Rng): void {
  const own = state.owner.clubId;
  const leaving: string[] = [];
  const renewed: string[] = [];

  // Sportovní ředitel sám prodlouží smlouvy hráčům, které kádr potřebuje, pokud nechtějí příliš
  // a vejdou se do mzdového stropu. Majitel to může ve Financích vypnout.
  const club = state.clubs[own];
  // Důvěra v majitele prodlužování nebrzdí: ředitel dělá svou práci, dokud v klubu je.
  if (directorOf(state, own) && club.policy.autoSquad !== false) {
    const squad = squadOf(state, own).sort((a, b) => b.overall - a.overall);
    // Počítá se jen s platy hráčů, kteří zůstávají; místo po odcházejících jde na prodloužení.
    const usage = wageUsage(state);
    // Na prodloužení smí jít aspoň místo po odcházejících platech, i když strop po sestupu nebo propadu
    // pověsti klesl: klub tak udrží kádr na dosavadní platové úrovni a nezačne se rozpadat.
    let free = Math.max(usage.cap - usage.continuing, usage.expiring);
    let bill = squad.filter((p) => !contractExpiring(state, p)).reduce((a, p) => a + p.wage, 0);
    const cap = Math.max(wageBudgetMonthly(club), squad.reduce((a, p) => a + p.wage, 0));
    for (const p of squad.slice(0, SQUAD_TARGET)) {
      if (!contractExpiring(state, p) || playerAge(p, state.season) > 32) continue;
      if ((p.morale ?? 60) < 25) continue;
      const demand = renewalDemand(state, p);
      if (demand > fairWage(state, p, own) * 1.25) continue;
      if (p.overall - squadQualityForReputation(club.reputation) > 10) continue;
      if (bill + demand > cap || free < demand) continue;
      free -= demand;
      bill += demand;
      p.wage = demand;
      p.contractUntil = state.season + 1 + rng.int(1, 3);
      renewed.push(playerName(p));
    }
  }
  if (renewed.length) {
    addNews(state, { kind: 'info', title: 'Sportovní ředitel prodloužil smlouvy', text: renewed.join(', ') });
  }
  for (const p of Object.values(state.players)) {
    if (p.clubId === FREE || p.contractUntil > state.season + 1) continue;
    if (p.clubId === own) {
      logTransfer(state, p, own, FREE, 0);
      p.clubId = FREE;
      leaving.push(playerName(p));
    } else if (rng.chance(0.25)) {
      p.clubId = FREE;
    } else {
      p.contractUntil = state.season + 1 + rng.int(1, 3);
    }
  }
  state.market.listed = state.market.listed.filter((id) => state.players[id]?.clubId === own);
  trimFreeAgents(state);
  if (leaving.length) {
    addNews(state, {
      kind: 'varovani',
      title: `Vypršely smlouvy: ${plural(leaving.length, 'hráč odchází', 'hráči odcházejí', 'hráčů odchází')}`,
      text: leaving.join(', '),
    });
  }
}

/** Začátek sezóny: staří a slabí volní hráči končí, přibydou noví. */
export function refreshFreeAgents(state: GameState, rng: Rng): void {
  const free = Object.values(state.players).filter((p) => p.clubId === FREE);
  for (const p of free) {
    if (playerAge(p, state.season) >= 35 || p.overall < 30) delete state.players[p.id];
  }
  for (let i = 0; i < 25; i++) {
    const position = rng.pick(['GK', 'DF', 'DF', 'MF', 'MF', 'FW'] as Position[]);
    const p = generatePlayer(rng, state, { clubId: FREE, position, season: state.season, quality: rng.int(32, 62), age: rng.int(21, 33) });
    p.wage = roundMoney(15_000 * Math.pow(1.06, p.overall - 40), 1_000);
    state.players[p.id] = p;
  }
  trimFreeAgents(state);
}

/** Volných hráčů je nejvýš 150 (nejslabší a nejstarší odcházejí z fotbalu). */
export function trimFreeAgents(state: GameState): void {
  const rest = Object.values(state.players)
    .filter((p) => p.clubId === FREE)
    .sort((a, b) => b.overall - a.overall);
  for (const p of rest.slice(MAX_FREE_AGENTS)) delete state.players[p.id];
}

/** Konec okna: návrhy a nabídky propadnou, chybějící hráče doplní kádr z nouze. */
export function closeWindow(state: GameState, rng: Rng): void {
  closeDomino(state);
  state.deadlineDeals = [];
  state.market.proposals = [];
  state.market.offers = [];
  if (state.market.negotiation && state.market.negotiation.stage !== 'hotovo') state.market.negotiation = undefined;
  emergencyFill(state, rng, 'na konci přestupního okna');
  trimFreeAgents(state);
}

/** Typická kvalita hráčů v soutěži klubu (medián podle pověsti soupeřů). */
function leagueLevel(state: GameState, clubId: string): number {
  const comp = Object.values(state.competitions).find((c) => c.clubIds.includes(clubId));
  const levels = (comp?.clubIds ?? [clubId]).filter((id) => id !== clubId).map((id) => squadQualityForReputation(state.clubs[id].reputation)).sort((a, b) => a - b);
  return levels.length ? levels[Math.floor(levels.length / 2)] : squadQualityForReputation(state.clubs[clubId].reputation);
}

/** Když klubu majitele chybí hráči, ředitel (nebo asistent) doplní kádr levnými volnými hráči. */
export function emergencyFill(state: GameState, rng: Rng, when: string): void {
  const own = state.owner.clubId;
  const signed: string[] = [];
  const squadCount = () => squadOf(state, own).length;
  const needs = () =>
    (Object.keys(SQUAD_SHAPE) as Position[]).filter(
      (pos) => squadOf(state, own).filter((p) => p.position === pos).length < (pos === 'GK' ? 2 : SQUAD_SHAPE[pos] - 2),
    );
  const club = state.clubs[own];
  // S ředitelem a zapnutou péčí o kádr se doplňuje na 22 hráčů nejlepšími, které se vejdou do mzdového stropu.
  const auto = !!directorOf(state, own) && club.policy.autoSquad !== false;
  const target = auto ? SQUAD_TARGET : MIN_SQUAD;
  let guard = 0;
  while ((squadCount() < target || needs().length) && guard++ < 24) {
    const pos = needs()[0] ?? weakestPosition(squadOf(state, own)).position;
    const room = wageBudgetMonthly(club) - wageBill(state, own);
    const pool = Object.values(state.players).filter((p) => p.clubId === FREE && p.position === pos && interest(state, p, own).ok);
    const affordable = pool
      .filter((p) => wageDemand(state, p, own) <= room)
      .sort((a, b) => b.overall - a.overall);
    if (squadCount() >= MIN_SQUAD && !needs().length && !affordable.length) break;
    const fa = (auto ? affordable[0] : undefined) ?? pool.sort((a, b) => a.wage - b.wage)[0];
    // Bez vhodného volného hráče se najde hráč z nižších soutěží na úrovni ligy (ne podle pověsti klubu,
    // aby klub po sérii proher nespadl do spirály stále slabších náhradníků).
    const p = fa ?? generatePlayer(rng, state, { clubId: FREE, position: pos, season: state.season, quality: leagueLevel(state, own) - 6, age: rng.int(19, 26) });
    state.players[p.id] = p;
    executeTransfer(state, p, own, 0, Math.max(5_000, wageDemand(state, p, own)), auto ? 2 : 1);
    signed.push(playerName(p));
  }
  if (signed.length) {
    addNews(state, {
      kind: 'varovani',
      title: auto ? 'Sportovní ředitel doplnil kádr' : 'Kádr byl doplněn z nouze',
      text: auto
        ? `Ředitel ${when} podepsal volné hráče v rámci mzdového stropu: ${signed.join(', ')}.`
        : `Klubu chyběli hráči, a tak se ${when} podepsaly krátké smlouvy s levnými volnými hráči: ${signed.join(', ')}.`,
    });
  }
}

/**
 * Jednou týdně v přestupním okně: sportovní ředitel (se zapnutou péčí o kádr) sám koupí posilu na nejslabší
 * místo základní sestavy, když je výrazně lepší, vejde se do rozpočtu na přestupy i do mzdového rozpočtu.
 * Jeden nákup smí stát nejvýš 60 % zbývajícího rozpočtu; dražší posily nechává na majiteli (návrhy).
 */
export function directorSignings(state: GameState, rng: Rng): void {
  const own = state.owner.clubId;
  const club = state.clubs[own];
  if (!transferWindow(state.date) || !directorOf(state, own) || club.policy.autoSquad === false || state.owner.ousted) return;
  if (ffpBlocksSigning(state)) return;
  // Nákupy jen s nejvyšší pravomocí ředitele.
  if (club.policy.delegation && club.policy.delegation.director !== 'vysoka') return;
  const squad = squadOf(state, own);
  if (squad.length >= 27) return;
  const remaining = budgetRemaining(state);
  if (remaining <= 0) return;
  const { position, bar } = weakestPosition(squad);
  const keys = keyPlayerIds(state);
  // V nižších soutěžích je trh malý: ředitel bere i menší zlepšení a zkouší i hráče z o něco větších klubů
  // (jestli o přestup stojí, rozhodne zájem hráče).
  const lower = tierOf(state, own) >= 2;
  const gain = lower ? 2 : 4;
  const repGap = lower ? 10 : 3;
  const candidates = Object.values(state.players)
    .filter((p) => p.position === position && p.clubId !== own && !isForeign(p.clubId) && p.overall >= bar + gain && playerAge(p, state.season) <= (lower ? 32 : 30))
    .filter((p) => p.clubId === FREE || (state.clubs[p.clubId] && state.clubs[p.clubId].reputation <= club.reputation + repGap && !keys.has(p.id)))
    .map((p) => ({ p, fee: askingPrice(state, p, keys), wage: wageDemand(state, p, own) }))
    .filter((x) => x.fee <= remaining * 0.6 && interest(state, x.p, own).ok && wageBill(state, own) + x.wage <= wageBudgetMonthly(club))
    .sort((a, b) => b.p.overall - a.p.overall || a.fee - b.fee);
  // V regionech se skautskou sítí hledá i v cizině (podle odhadu skautů, takže s rizikem).
  const abroad = directorForeignPick(state, position, bar, remaining);
  const pick = candidates[0];
  if (abroad && (!pick || abroad.est > pick.p.overall + 1)) {
    directorSignForeign(state, abroad.target, abroad.price);
    return;
  }
  if (!pick) return;
  const from = pick.p.clubId;
  executeTransfer(state, pick.p, own, pick.fee, pick.wage, rng.int(2, 4));
  addNews(state, {
    kind: 'info',
    title: `Sportovní ředitel podepsal: ${playerName(pick.p)} (${pick.p.overall}) za ${(pick.fee / 1e6).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč`,
    text: `${from === FREE ? 'Volný hráč' : `Z klubu ${clubLabel(state, from)}`} za ${pick.fee.toLocaleString('cs-CZ')} Kč, plat ${pick.wage.toLocaleString('cs-CZ')} Kč měsíčně. Posílí nejslabší místo sestavy. Nákupy ředitele vypnete ve Financích (Přestupy).`,
  });
}

// ---------- Přestupy mezi ostatními kluby ----------

/** Pozice, kde má klub nejslabšího hráče základní sestavy (nebo nedostatek hráčů). */
export function weakestPosition(squad: Player[]): { position: Position; bar: number } {
  const xi = bestEleven(squad);
  let best: { position: Position; bar: number; score: number } = { position: 'MF', bar: 0, score: Infinity };
  for (const pos of Object.keys(SQUAD_SHAPE) as Position[]) {
    const starters = xi.filter((p) => p.position === pos);
    const count = squad.filter((p) => p.position === pos).length;
    const bar = starters.length ? Math.min(...starters.map((p) => p.overall)) : 0;
    const score = bar - (SQUAD_SHAPE[pos] - count) * 5;
    if (score < best.score) best = { position: pos, bar, score };
  }
  return { position: best.position, bar: best.bar };
}

/**
 * Jednou týdně v přestupním okně: ostatní kluby kupují hráče od jiných klubů (nebo volné hráče),
 * kteří by jim posílili nejslabší místo. Prodávají menší kluby větším, nejlepší hráč odchází jen výjimečně.
 */
export function aiDomesticTransfers(state: GameState, rng: Rng): void {
  if (!transferWindow(state.date)) return;
  const own = state.owner.clubId;
  const byClub = new Map<string, Player[]>();
  for (const p of Object.values(state.players)) {
    const list = byClub.get(p.clubId);
    if (list) list.push(p);
    else byClub.set(p.clubId, [p]);
  }
  const clubs = Object.values(state.competitions).flatMap((c) => c.clubIds).filter((id) => id !== own);
  const keys = keyPlayerIds(state);
  const deals: string[] = [];

  for (const buyerId of clubs) {
    // Asi 4 domácí příchody na klub za sezónu (léto i zima), v 1. lize o něco víc.
    if (!rng.chance(tierOf(state, buyerId) === 1 ? 0.4 : 0.3)) continue;
    const buyer = state.clubs[buyerId];
    const squad = byClub.get(buyerId) ?? [];
    const { position, bar } = weakestPosition(squad);
    // Kluby utrácejí i peníze z vlastních prodejů, proto rezerva nad rozpočtem.
    const budget = buyer.policy.transferBudget * 1.6 - (buyer.transferSpent ?? 0);
    const candidates = Object.values(state.players).filter((p) => {
      if (p.position !== position || p.overall < bar + 2 || p.clubId === buyerId || p.clubId === own) return false;
      if (playerAge(p, state.season) > 31) return false;
      if (p.clubId === FREE) return true;
      const seller = state.clubs[p.clubId];
      if (!seller || seller.reserveOf === buyerId || buyer.reserveOf === p.clubId) return false;
      // Větší kluby pouštějí menším hlavně hráče mimo základ (rezervy), menší prodávají větším.
      if (seller.reputation > buyer.reputation + 12) return false;
      if (seller.reputation > buyer.reputation + 3 && (p.starts ?? 0) > 8) return false;
      if (buyer.reserveOf) return false;
      return !keys.has(p.id) || rng.chance(0.15);
    });
    const affordable = candidates
      .map((p) => ({ p, fee: p.clubId === FREE ? 0 : roundMoney(playerValue(state, p) * (0.95 + rng.next() * 0.35)) }))
      .filter((x) => x.fee <= budget && x.p.overall - squadQualityForReputation(buyer.reputation) <= 10)
      .sort((a, b) => b.p.overall - a.p.overall);
    const pick = affordable[Math.min(affordable.length - 1, rng.int(0, 2))];
    if (!pick) continue;

    const { p, fee } = pick;
    const sellerId = p.clubId;
    const name = playerName(p);
    executeTransfer(state, p, buyerId, fee, playerWage(p.overall, buyer.reputation), rng.int(2, 4));
    buyer.transferSpent = (buyer.transferSpent ?? 0) + fee;
    // Kupující se zbaví nejslabšího hráče na pozici, prodávající si doplní volného hráče.
    const surplus = (byClub.get(buyerId) ?? []).filter((x) => x.position === position && x.id !== p.id).sort((a, b) => a.overall - b.overall);
    if ((byClub.get(buyerId)?.length ?? 0) >= 25 && surplus[0]) surplus[0].clubId = FREE;
    if (sellerId !== FREE) {
      const replacement = Object.values(state.players)
        .filter((x) => x.clubId === FREE && x.position === p.position && interest(state, x, sellerId).ok)
        .sort((a, b) => b.overall - a.overall)[0];
      if (replacement) executeTransfer(state, replacement, sellerId, 0, playerWage(replacement.overall, state.clubs[sellerId].reputation), 1 + rng.int(0, 1));
      const sellerList = byClub.get(sellerId);
      if (sellerList) byClub.set(sellerId, sellerList.filter((x) => x.id !== p.id));
    }
    byClub.set(buyerId, [...(byClub.get(buyerId) ?? []), p]);
    if (fee >= 3_000_000 || (sellerId !== FREE && tierOf(state, buyerId) === 1)) {
      deals.push(`${name}: ${clubLabel(state, sellerId)} → ${buyer.shortName}${fee ? ` za ${(fee / 1_000_000).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} mil. Kč` : ' zadarmo'}`);
    }
  }
  if (deals.length) {
    addNews(state, { kind: 'info', title: `Přestupy v lize: ${plural(deals.length, 'nový přestup', 'nové přestupy', 'nových přestupů')}`, text: deals.join(' · ') });
  }
}
