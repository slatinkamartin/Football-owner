import { book, wageBudgetMonthly } from './finance';
import { bestEleven, generatePlayer, marketValue, playerAge, SQUAD_SHAPE, squadOf, squadQualityForReputation } from './players';
import type { Rng } from './rng';
import { directorAbility, directorOf, scoutingError, severance, type ActionResult } from './staff';
import type { GameState, IncomingOffer, Negotiation, Player, Position, TransferProposal } from './types';
import { addNews, clamp, clubLabel, FREE, hash01, plural, tierOf, transferWindow } from './world';

const MIN_SQUAD = 18;
const MAX_FREE_AGENTS = 150;

export function playerName(p: Player): string {
  return `${p.firstName} ${p.lastName}`;
}

function roundMoney(v: number, step = 10_000): number {
  return Math.round(v / step) * step;
}

// ---------- Ceny, platy a zájem ----------

/** Kolik si prodávající klub řekne. Volný hráč je zadarmo. */
export function askingPrice(state: GameState, p: Player): number {
  if (p.clubId === FREE) return 0;
  const yearsLeft = p.contractUntil - (state.season + 1);
  const contractFactor = yearsLeft <= 0 ? 0.5 : yearsLeft === 1 ? 0.85 : 1;
  const squad = squadOf(state, p.clubId).sort((a, b) => b.overall - a.overall);
  const keyFactor = squad.indexOf(p) < 3 ? 1.35 : 1;
  return roundMoney(marketValue(p, state.season) * contractFactor * keyFactor);
}

/** Spravedlivý plat hráče v daném klubu: podíl z mzdového rozpočtu podle kvality. */
export function fairWage(state: GameState, p: Player, clubId: string): number {
  const squad = squadOf(state, clubId).filter((x) => x.id !== p.id);
  const weight = (x: Player) => Math.pow(x.overall, 3);
  const total = squad.reduce((s, x) => s + weight(x), 0) + weight(p);
  return (wageBudgetMonthly(state.clubs[clubId]) * weight(p)) / total;
}

export function wageDemand(state: GameState, p: Player, clubId: string): number {
  let demand = Math.max(p.wage * 1.15, fairWage(state, p, clubId));
  if (p.clubId !== FREE && tierOf(state, clubId) > tierOf(state, p.clubId)) demand *= 1.25;
  demand *= 0.95 + 0.2 * hash01(`${p.id}-${state.season}-plat`);
  return roundMoney(Math.max(demand, 5_000), 1_000);
}

export function interest(state: GameState, p: Player, clubId: string): { ok: boolean; reason: string } {
  const gap = p.overall - squadQualityForReputation(state.clubs[clubId].reputation);
  if (gap > 12) return { ok: false, reason: `${playerName(p)} chce hrát ve vyšší úrovni a o přestup nemá zájem.` };
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
  return Math.max(0, club.policy.transferBudget - state.market.spent + state.market.earned);
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
  const fair = fairWage(state, p, state.owner.clubId);
  if (wageDemand(state, p, state.owner.clubId) > fair * 1.3) reasons.push('Jeho platové nároky by narušily mzdovou strukturu kádru.');
  return { recommend: reasons.length === 0, reasons };
}

// ---------- Provedení přestupu ----------

export function executeTransfer(state: GameState, p: Player, toId: string, fee: number, wage: number, years: number): void {
  const fromId = p.clubId;
  const own = state.owner.clubId;
  if (fee > 0) {
    if (fromId !== FREE) book(state, fromId, 'prestupy', fee, `Prodej: ${playerName(p)}`);
    book(state, toId, 'prestupy', -fee, `Nákup: ${playerName(p)}`);
  }
  if (toId === own) state.market.spent += fee;
  if (fromId === own) state.market.earned += fee * 0.5;
  state.market.history.unshift({ date: state.date, playerName: playerName(p), fromId, toId, fee });
  state.market.history.length = Math.min(state.market.history.length, 100);
  state.market.listed = state.market.listed.filter((id) => id !== p.id);
  state.market.offers = state.market.offers.filter((o) => o.playerId !== p.id);
  state.market.proposals = state.market.proposals.filter((o) => o.playerId !== p.id);

  p.clubId = toId;
  p.wage = wage;
  p.contractUntil = state.season + Math.max(1, years);
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
  state.market.negotiation = negotiation;
  return { state, ok: true, message: negotiation.log.join(' ') };
}

export function cancelNegotiation(prev: GameState): GameState {
  if (!prev.market.negotiation) return prev;
  const state = structuredClone(prev);
  state.market.negotiation = undefined;
  return state;
}

export function offerFee(prev: GameState, fee: number): ActionResult {
  const n = prev.market.negotiation;
  if (!n || n.stage !== 'klub') return { state: prev, ok: false, message: 'Neprobíhá jednání s klubem.' };
  const value = roundMoney(fee);
  if (value > budgetRemaining(prev)) {
    return { state: prev, ok: false, message: 'Na tolik nemá sportovní ředitel schválený rozpočet. Navyšte ho ve Financích.' };
  }
  const state = structuredClone(prev);
  const neg = state.market.negotiation!;
  const seller = clubLabel(state, neg.sellerId);
  let message: string;
  if (value >= neg.minFee) {
    neg.stage = 'hrac';
    neg.agreedFee = value;
    neg.counter = undefined;
    neg.roundsLeft = 3;
    message = `${seller} přijal nabídku ${value.toLocaleString('cs-CZ')} Kč. Teď je na řadě smlouva s hráčem.`;
  } else {
    neg.roundsLeft -= 1;
    if (neg.roundsLeft <= 0) {
      neg.stage = 'neuspech';
      message = `${seller} ukončil jednání.`;
    } else if (value >= neg.minFee * 0.75) {
      neg.counter = roundMoney(Math.max(neg.minFee, (neg.askingFee + value) / 2));
      message = `${seller} nabídku odmítl a požaduje ${neg.counter.toLocaleString('cs-CZ')} Kč.`;
    } else {
      message = `${seller} nabídku ${value.toLocaleString('cs-CZ')} Kč odmítl jako nevážnou.`;
    }
  }
  neg.log.push(message);
  return { state, ok: neg.stage !== 'neuspech', message };
}

export function offerTerms(prev: GameState, wage: number, years: number): ActionResult {
  const n = prev.market.negotiation;
  if (!n || n.stage !== 'hrac') return { state: prev, ok: false, message: 'Neprobíhá jednání s hráčem.' };
  const state = structuredClone(prev);
  const neg = state.market.negotiation!;
  const p = state.players[neg.playerId];
  const value = roundMoney(wage, 1_000);
  let message: string;

  if (p.clubId !== neg.sellerId) {
    neg.stage = 'neuspech';
    message = `${playerName(p)} mezitím přestoupil jinam.`;
  } else if (value >= neg.minWage) {
    const own = state.owner.clubId;
    executeTransfer(state, p, own, neg.agreedFee, value, clamp(years, 1, 5));
    const agentFee = value * 2;
    book(state, own, 'prestupy', -agentFee, `Odměna agentovi: ${playerName(p)}`);
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
      message = `${playerName(p)} a jeho agent jednání ukončili.`;
    } else if (value >= neg.minWage * 0.85) {
      neg.counter = neg.minWage;
      message = `Agent požaduje ${neg.minWage.toLocaleString('cs-CZ')} Kč měsíčně.`;
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
      .filter((x) => wageDemand(state, x.p, own) <= fair(x.p) * 1.4)
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
            ? `Volný hráč, posílil by pozici ${pos}. Skauti ho hodnotí na ${x.view.overall}.`
            : `Hraje za ${clubLabel(state, x.p.clubId)}. Skauti ho hodnotí na ${x.view.overall}, náš nejslabší člen základní sestavy na pozici má ${bar - 2}.`,
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
  else {
    executeTransfer(state, p, own, fee, minWage, 3);
    book(state, own, 'prestupy', -minWage * 2, `Odměna agentovi: ${playerName(p)}`);
    state.owner.trust.reditel = clamp(state.owner.trust.reditel + 2, 0, 100);
    message = `Sportovní ředitel dotáhl přestup: ${playerName(p)} za ${fee.toLocaleString('cs-CZ')} Kč, plat ${minWage.toLocaleString('cs-CZ')} Kč měsíčně.`;
    addNews(state, { kind: 'info', title: `Posila: ${playerName(p)}`, text: message });
    return { state, ok: true, message };
  }
  addNews(state, { kind: 'varovani', title: `Přestup ${playerName(p)} se nepovedl`, text: message });
  return { state, ok: false, message };
}

export function rejectProposal(prev: GameState, proposalId: string): GameState {
  const state = structuredClone(prev);
  state.market.proposals = state.market.proposals.filter((x) => x.id !== proposalId);
  state.owner.trust.reditel = clamp(state.owner.trust.reditel - 1, 0, 100);
  return state;
}

// ---------- Nabídky na naše hráče ----------

export function generateOffers(state: GameState, rng: Rng): void {
  const own = state.owner.clubId;
  state.market.offers = state.market.offers.filter((o) => o.expires >= state.date && state.players[o.playerId]?.clubId === own);
  if (!transferWindow(state.date)) return;

  const squad = squadOf(state, own).sort((a, b) => b.overall - a.overall);
  const ownRep = state.clubs[own].reputation;
  const buyers = Object.values(state.competitions)
    .flatMap((c) => c.clubIds)
    .filter((id) => id !== own && !state.clubs[id].reserveOf && state.clubs[id].reputation >= ownRep - 5);
  if (!buyers.length) return;

  squad.forEach((p, rank) => {
    if (state.market.offers.length >= 3 || state.market.offers.some((o) => o.playerId === p.id)) return;
    const listed = state.market.listed.includes(p.id);
    const chance = 0.03 * (listed ? 5 : 1) * (rank < 5 ? 1.5 : 1);
    if (!rng.chance(chance)) return;
    const value = marketValue(p, state.season);
    const fee = roundMoney(value * (listed ? 0.7 + rng.next() * 0.4 : 0.9 + rng.next() * 0.5));
    if (fee <= 0) return;
    const key = rank < 5;
    const advice: IncomingOffer['advice'] = fee >= value * 1.15 || listed || (!key && playerAge(p, state.season) >= 30) ? 'prijmout' : 'odmitnout';
    const buyerId = rng.pick(buyers);
    state.market.offers.push({
      id: `o${++state.nextId}`,
      playerId: p.id,
      buyerId,
      fee,
      expires: addDaysIso(state.date, 10),
      advice,
      note:
        advice === 'prijmout'
          ? 'Sportovní ředitel doporučuje nabídku přijmout.'
          : key
            ? 'Sportovní ředitel doporučuje odmítnout: je to opora týmu.'
            : 'Sportovní ředitel doporučuje odmítnout: hráč má vyšší hodnotu.',
    });
    addNews(state, { kind: 'info', title: `${clubLabel(state, buyerId)} nabízí za ${playerName(p)} ${fee.toLocaleString('cs-CZ')} Kč` });
  });
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function acceptOffer(prev: GameState, offerId: string): ActionResult {
  const offer = prev.market.offers.find((o) => o.id === offerId);
  if (!offer) return { state: prev, ok: false, message: 'Nabídka už neplatí.' };
  const state = structuredClone(prev);
  const p = state.players[offer.playerId];
  const squad = squadOf(state, state.owner.clubId).sort((a, b) => b.overall - a.overall);
  const key = squad.indexOf(p) < 5;
  executeTransfer(state, p, offer.buyerId, offer.fee, Math.round(p.wage * 1.2), 3);
  if (offer.advice === 'odmitnout') state.owner.trust.reditel = clamp(state.owner.trust.reditel - 4, 0, 100);
  if (key) state.owner.trust.trener = clamp(state.owner.trust.trener - 5, 0, 100);
  const message = `${playerName(p)} přestoupil do ${clubLabel(state, offer.buyerId)} za ${offer.fee.toLocaleString('cs-CZ')} Kč.`;
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
  const state = structuredClone(prev);
  const cost = releaseCost(state, p);
  if (cost > 0) book(state, p.clubId, 'platy', -cost, `Vyplacení smlouvy: ${playerName(p)}`);
  const player = state.players[playerId];
  player.clubId = FREE;
  state.market.listed = state.market.listed.filter((id) => id !== playerId);
  state.market.offers = state.market.offers.filter((o) => o.playerId !== playerId);
  const message = `${playerName(player)} odešel z klubu. Vyplacení smlouvy stálo ${cost.toLocaleString('cs-CZ')} Kč.`;
  addNews(state, { kind: 'info', title: message });
  return { state, ok: true, message };
}

export function contractExpiring(state: GameState, p: Player): boolean {
  return p.contractUntil <= state.season + 1;
}

export function renewalDemand(state: GameState, p: Player): number {
  const base = Math.max(p.wage * 1.1, fairWage(state, p, p.clubId));
  return roundMoney(base * (1 + 0.25 * hash01(`${p.id}-${state.season}-prodlouzeni`)), 1_000);
}

export function renewContract(prev: GameState, playerId: string, wage: number, years: number): ActionResult {
  const p = prev.players[playerId];
  if (!p || p.clubId !== prev.owner.clubId) return { state: prev, ok: false, message: 'Hráč nepatří do klubu.' };
  const gap = p.overall - squadQualityForReputation(prev.clubs[p.clubId].reputation);
  if (gap > 10) return { state: prev, ok: false, message: `${playerName(p)} chce odejít do lepšího klubu a smlouvu neprodlouží.` };
  const demand = renewalDemand(prev, p);
  if (wage < demand) return { state: prev, ok: false, message: `${playerName(p)} chce aspoň ${demand.toLocaleString('cs-CZ')} Kč měsíčně.` };
  const state = structuredClone(prev);
  const player = state.players[playerId];
  player.wage = roundMoney(wage, 1_000);
  player.contractUntil = Math.max(player.contractUntil, state.season + clamp(years, 1, 5));
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

  // Sportovní ředitel sám prodlouží smlouvy důležitým hráčům, pokud nechtějí příliš.
  if (directorOf(state, own) && state.owner.trust.reditel >= 30) {
    const squad = squadOf(state, own).sort((a, b) => b.overall - a.overall);
    for (const p of squad.slice(0, 16)) {
      if (!contractExpiring(state, p) || playerAge(p, state.season) > 31) continue;
      const demand = renewalDemand(state, p);
      if (demand > fairWage(state, p, own) * 1.25) continue;
      if (p.overall - squadQualityForReputation(state.clubs[own].reputation) > 10) continue;
      p.wage = demand;
      p.contractUntil = state.season + 1 + rng.int(2, 3);
      renewed.push(playerName(p));
    }
  }
  if (renewed.length) {
    addNews(state, { kind: 'info', title: 'Sportovní ředitel prodloužil smlouvy', text: renewed.join(', ') });
  }
  for (const p of Object.values(state.players)) {
    if (p.clubId === FREE || p.contractUntil > state.season + 1) continue;
    if (p.clubId === own) {
      p.clubId = FREE;
      leaving.push(playerName(p));
    } else if (rng.chance(0.25)) {
      p.clubId = FREE;
    } else {
      p.contractUntil = state.season + 1 + rng.int(1, 3);
    }
  }
  state.market.listed = state.market.listed.filter((id) => state.players[id]?.clubId === own);
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
  const rest = Object.values(state.players).filter((p) => p.clubId === FREE).sort((a, b) => b.overall - a.overall);
  for (const p of rest.slice(MAX_FREE_AGENTS)) delete state.players[p.id];
}

/** Konec okna: návrhy a nabídky propadnou, chybějící hráče doplní kádr z nouze. */
export function closeWindow(state: GameState, rng: Rng): void {
  state.market.proposals = [];
  state.market.offers = [];
  if (state.market.negotiation && state.market.negotiation.stage !== 'hotovo') state.market.negotiation = undefined;
  emergencyFill(state, rng, 'na konci přestupního okna');
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
  let guard = 0;
  while ((squadCount() < MIN_SQUAD || needs().length) && guard++ < 20) {
    const pos = needs()[0] ?? rng.pick(['DF', 'MF', 'FW'] as Position[]);
    const fa = Object.values(state.players)
      .filter((p) => p.clubId === FREE && p.position === pos && interest(state, p, own).ok)
      .sort((a, b) => a.wage - b.wage)[0];
    const p = fa ?? generatePlayer(rng, state, { clubId: FREE, position: pos, season: state.season, quality: squadQualityForReputation(state.clubs[own].reputation) - 10, age: rng.int(17, 19) });
    state.players[p.id] = p;
    executeTransfer(state, p, own, 0, Math.max(5_000, wageDemand(state, p, own)), 1);
    signed.push(playerName(p));
  }
  if (signed.length) {
    addNews(state, {
      kind: 'varovani',
      title: 'Kádr byl doplněn z nouze',
      text: `Klubu chyběli hráči, a tak se ${when} podepsaly krátké smlouvy s levnými volnými hráči: ${signed.join(', ')}.`,
    });
  }
}
