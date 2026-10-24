import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { captainOf } from './characters';
import {
  CHEMISTRY_MAX_BONUS,
  chemistryEffect,
  chemistryEffectOf,
  chemistryImpact,
  chemistryLanguage,
  coachLeadershipPick,
  currentCaptain,
  currentLeaders,
  setCaptain,
  setLeaders,
  squadShape,
  teamChemistry,
} from './chemistry';
import { resolveEvent, TEMPLATES } from './events';
import { advanceDays, newGame } from './game';
import { squadOf } from './players';
import type { DataPack, GameState } from './types';

const fresh = (clubId = 'teplice', seed = 4): GameState => newGame(pack as DataPack, { clubId, ownerName: 'T', difficulty: 'stredni', seed });

describe('W4: týmová chemie', () => {
  it('chemie 0–100 se sedmi složkami s vysvětlením a funguje i bez uloženého stavu chemie', () => {
    const s = fresh();
    delete s.chemistry;
    const c = teamChemistry(s);
    expect(c.value).toBeGreaterThanOrEqual(0);
    expect(c.value).toBeLessThanOrEqual(100);
    expect(c.parts).toHaveLength(7);
    for (const p of c.parts) {
      expect(p.value).toBeGreaterThanOrEqual(0);
      expect(p.value).toBeLessThanOrEqual(100);
      expect(p.why.length).toBeGreaterThan(5);
    }
    const w = c.parts.reduce((a, p) => a + p.weight, 0);
    expect(w).toBeCloseTo(1, 5);
    // Cizí klub taky (odhad z dat bez sledovaných minut).
    const other = teamChemistry(s, 'sparta');
    expect(other.value).toBeGreaterThan(0);
  });

  it('starý uložený stav bez nových polí se načte a hra běží dál', () => {
    const s = JSON.parse(JSON.stringify(fresh())) as GameState;
    delete s.chemistry;
    const r = advanceDays(s, 40);
    expect(r.state.date > s.date).toBe(true);
    expect(teamChemistry(r.state).value).toBeGreaterThan(0);
    expect(captainOf(r.state)?.clubId).toBe(s.owner.clubId);
  });

  it('velká výměna kádru srazí chemii (složka Noví hráči)', () => {
    const s = fresh();
    const before = teamChemistry(s);
    const core = squadOf(s, s.owner.clubId).sort((a, b) => b.overall - a.overall).slice(0, 9);
    for (const p of core) p.transfers.push({ date: s.date, from: 'x', to: s.owner.clubId, fee: 0 });
    const after = teamChemistry(s);
    expect(after.value).toBeLessThan(before.value - 5);
    expect(after.parts.find((p) => p.key === 'novacci')!.value).toBeLessThan(before.parts.find((p) => p.key === 'novacci')!.value);
    expect(after.parts.find((p) => p.key === 'souhra')!.value).toBeLessThan(before.parts.find((p) => p.key === 'souhra')!.value);
  });

  it('izolovaní cizinci bez krajana zhorší jazykové skupiny, po roce a půl v klubu se zapojí', () => {
    const s = fresh();
    const base = teamChemistry(s).parts.find((p) => p.key === 'skupiny')!.value;
    const core = squadOf(s, s.owner.clubId).sort((a, b) => b.overall - a.overall).slice(0, 4);
    const nats = ['Japonsko', 'Island', 'Egypt', 'Irák'];
    core.forEach((p, i) => {
      p.nationality = nats[i];
      p.transfers.push({ date: s.date, from: 'x', to: s.owner.clubId, fee: 0 });
    });
    const worse = teamChemistry(s).parts.find((p) => p.key === 'skupiny')!.value;
    expect(worse).toBeLessThan(base);
    expect(chemistryLanguage(s, core[0])).not.toBe('cs');
    core[0].transfers[core[0].transfers.length - 1].date = '2024-06-01';
    expect(chemistryLanguage(s, core[0])).toBe('cs');
    // Slováci patří do stejné skupiny jako Češi.
    core[1].nationality = 'Slovensko';
    expect(chemistryLanguage(s, core[1])).toBe('cs');
  });

  it('vliv na sílu je omezený (asi ±3 %) a roste s chemií', () => {
    expect(chemistryEffectOf(100).strength).toBeCloseTo(CHEMISTRY_MAX_BONUS, 5);
    expect(chemistryEffectOf(0).strength).toBeCloseTo(-CHEMISTRY_MAX_BONUS, 5);
    expect(chemistryEffectOf(80).strength).toBeGreaterThan(chemistryEffectOf(50).strength);
    // Dobrá parta tlumí pokles morálky po porážce, rozpadlá kabina ho zesílí.
    expect(chemistryEffectOf(85).lossFactor).toBeLessThan(1);
    expect(chemistryEffectOf(25).lossFactor).toBeGreaterThan(1);
    const e = chemistryEffect(fresh());
    expect(Math.abs(e.strength)).toBeLessThanOrEqual(CHEMISTRY_MAX_BONUS);
    expect(e.text).toContain('%');
  });

  it('kapitán: výchozí návrh trenéra, volba majitele platí i pro postavu kapitána', () => {
    const s = fresh();
    const pick = coachLeadershipPick(s);
    expect(currentCaptain(s)?.id).toBe(pick.captainId);
    expect(currentLeaders(s)).toHaveLength(2);
    const other = squadOf(s, s.owner.clubId).find((p) => p.id !== pick.captainId)!;
    const r = setCaptain(s, other.id);
    expect(r.ok).toBe(true);
    expect(captainOf(r.state)?.id).toBe(other.id);
    expect(currentLeaders(r.state).some((p) => p.id === other.id)).toBe(false);
    const lead = squadOf(s, s.owner.clubId).filter((p) => p.id !== other.id).slice(0, 3).map((p) => p.id);
    const r2 = setLeaders(r.state, lead);
    expect(r2.ok).toBe(true);
    expect(currentLeaders(r2.state).map((p) => p.id)).toEqual(lead);
    expect(setLeaders(r.state, squadOf(s, s.owner.clubId).filter((p) => p.id !== other.id).slice(0, 4).map((p) => p.id)).ok).toBe(false);
  });

  it('změna kapitána uprostřed sezóny stojí morálku bývalého kapitána a chemii (zpráva bez jména bývalého)', () => {
    const s = fresh();
    const first = squadOf(s, s.owner.clubId).sort((a, b) => b.overall - a.overall)[0];
    s.chemistry = { captainId: first.id, decidedSeason: s.season };
    s.date = `${s.season}-10-10`;
    const before = teamChemistry(s).parts.find((p) => p.key === 'lidri')!.value;
    const moraleBefore = first.morale;
    const next = squadOf(s, s.owner.clubId).find((p) => p.id !== first.id)!;
    const r = setCaptain(s, next.id);
    expect(r.ok).toBe(true);
    expect(r.state.players[first.id].morale).toBe(moraleBefore - 8);
    expect(r.state.chemistry?.changedAt).toBe(s.date);
    expect(teamChemistry(r.state).parts.find((p) => p.key === 'lidri')!.value).toBeLessThan(before);
    const news = r.state.news[0];
    expect(news.title).toContain('kapitána');
    expect(`${news.title} ${news.text}`).not.toContain(first.lastName);
    // V létě je změna zdarma.
    s.date = `${s.season + 1}-07-05`;
    s.season += 1;
    const r3 = setCaptain(s, next.id);
    expect(r3.state.players[first.id].morale).toBe(moraleBefore);
  });

  it('rozhodnutí o kapitánovi na začátku sezóny: šablona, výchozí volba = návrh trenéra', () => {
    const s = fresh();
    const body = TEMPLATES['kapitan-sezona'].create(s, { next: () => 0.5 } as never);
    expect(body).toBeTruthy();
    expect(body!.defaultOption).toBe('trener');
    expect(body!.options.length).toBeGreaterThanOrEqual(2);
    expect(body!.options.length).toBeLessThanOrEqual(3);
    // Přes hru: během července přijde (v rámci týdenního limitu), nebo platí návrh trenéra.
    let g = s;
    for (let i = 0; i < 6 && !g.events.some((e) => e.template === 'kapitan-sezona'); i++) {
      g = advanceDays(g, 4).state;
      for (const e of [...g.events]) if (e.template !== 'kapitan-sezona') g = resolveEvent(g, e.id, e.defaultOption).state;
    }
    const ev = g.events.find((e) => e.template === 'kapitan-sezona');
    if (ev) {
      const alt = ev.options.find((o) => o.id !== 'trener')!;
      const r = resolveEvent(g, ev.id, alt.id);
      expect(r.state.chemistry?.captainId).toBe(String(ev.data![alt.id]));
      expect(r.state.chemistry?.decidedSeason).toBe(g.season);
      expect(captainOf(r.state)?.id).toBe(String(ev.data![alt.id]));
    } else {
      g = advanceDays(g, 30).state;
      expect(g.chemistry?.decidedSeason).toBe(g.season);
    }
  });

  it('po zápasech se sčítají společné minuty a sestavy, chemie má trend', () => {
    let s = fresh();
    s = advanceDays(s, 75).state;
    const chem = s.chemistry!;
    expect(Object.keys(chem.pairs ?? {}).length).toBeGreaterThan(20);
    expect((chem.lineups ?? []).length).toBeGreaterThanOrEqual(2);
    expect(chem.lineups![0].ids.length).toBe(11);
    expect((chem.history ?? []).length).toBeGreaterThanOrEqual(8);
    const c = teamChemistry(s);
    expect(typeof c.trend).toBe('number');
    expect(c.lines.DF).toBeGreaterThan(0);
  });

  it('odhad dopadu přestupu na chemii', () => {
    const s = fresh();
    const target = Object.values(s.players).filter((p) => p.clubId === 'sparta').sort((a, b) => b.overall - a.overall)[0];
    const imp = chemistryImpact(s, target);
    expect(typeof imp.delta).toBe('number');
    expect(imp.text).toMatch(/^Chemie/);
    // Cizinec bez krajana v kádru.
    const foreigner = { ...target, id: 'virt', nationality: 'Japonsko' };
    s.players.virt = foreigner;
    expect(chemistryImpact(s, foreigner).text).toContain('bez krajana');
    expect(chemistryImpact(s, foreigner).delta).toBeLessThanOrEqual(imp.delta);
    // Vlastní hráč: žádný odhad.
    expect(chemistryImpact(s, squadOf(s, s.owner.clubId)[0]).text).toBe('');
  });

  it('složení týmu: jedenáctka, řady, věk, slabé místo', () => {
    const s = fresh();
    const shape = squadShape(s);
    expect(shape.xi).toHaveLength(11);
    expect(shape.lines.map((l) => l.position)).toEqual(['GK', 'DF', 'MF', 'FW']);
    expect(shape.ages.reduce((a, b) => a + b.count, 0)).toBe(squadOf(s, s.owner.clubId).length);
    expect(shape.topWages).toHaveLength(5);
    // Bez náhradního brankáře je slabé místo.
    const gks = squadOf(s, s.owner.clubId).filter((p) => p.position === 'GK');
    for (const g of gks.slice(1)) g.clubId = 'sparta';
    expect(squadShape(s).lines[0].weak).toBe('bez náhradníka');
  });
});
