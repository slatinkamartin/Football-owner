import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { newGame } from './game';
import { squadOf } from './players';
import { parseRosterCsv, rostersByClub, rosterToCsv } from './rosters';
import type { DataPack } from './types';

const czPack = pack as DataPack;
const HEADER = 'klub;jmeno;prijmeni;rok_narozeni;pozice;narodnost;role;hodnoceni;potencial;smlouva_do;zdroj';

describe('databáze soupisek', () => {
  it('soubor data/soupisky/hraci.csv jde přečíst a kluby existují', () => {
    const text = readFileSync(new URL('../data/soupisky/hraci.csv', import.meta.url), 'utf8');
    const { rows, errors } = parseRosterCsv(text);
    expect(errors).toEqual([]);
    const ids = new Set(czPack.clubs.map((c) => c.id));
    for (const r of rows) expect(ids.has(r.club), `neznámý klub ${r.club}`).toBe(true);
    for (const [club, list] of rostersByClub(rows)) {
      expect(list.filter((r) => r.position === 'GK').length, `${club}: brankáři`).toBeGreaterThanOrEqual(2);
      expect(list.length, `${club}: počet hráčů`).toBeGreaterThanOrEqual(18);
    }
  });

  it('chybné řádky hlásí a přeskočí', () => {
    const { rows, errors } = parseRosterCsv(`${HEADER}\nslavia;A;B;2001;XX;;;;;;\nslavia;A;B;1800;BR;;;;;;\nslavia;Jan;Test;2001;BR;;zaklad;;;;`);
    expect(rows.length).toBe(1);
    expect(errors.length).toBe(2);
  });

  it('nová hra použije soupisku a doplní chybějící hráče', () => {
    const csv = [HEADER, 'teplice;Testovací;Brankář;1995;BR;;zaklad;;;2029;', 'teplice;Testovací;Útočník;2004;UT;Nigérie;talent;;;;', 'teplice;Testovací;Obránce;1990;OBR;Slovensko;rotace;70;72;;'].join('\n');
    const { rows } = parseRosterCsv(csv);
    const s = newGame(czPack, { clubId: 'teplice', ownerName: 'T', difficulty: 'stredni', seed: 3, rosters: rows });
    const squad = squadOf(s, 'teplice');
    expect(s.realRosters).toBe(true);
    expect(squad.length).toBeGreaterThanOrEqual(18);
    expect(squad.filter((p) => p.position === 'GK').length).toBeGreaterThanOrEqual(2);
    const gk = squad.find((p) => p.lastName === 'Brankář')!;
    expect(gk.contractUntil).toBe(2029);
    expect(gk.wage).toBeGreaterThan(0);
    const fw = squad.find((p) => p.lastName === 'Útočník')!;
    expect(fw.nationality).toBe('Nigérie');
    expect(fw.nonEu).toBe(true);
    expect(fw.potential).toBeGreaterThan(fw.overall);
    const df = squad.find((p) => p.lastName === 'Obránce')!;
    expect(df.overall).toBe(70);
    expect(df.nonEu).toBe(false);
    // Kluby bez soupisky dostanou vygenerované hráče jako dřív.
    expect(squadOf(s, 'slavia').length).toBeGreaterThanOrEqual(20);
  });
});

describe('konfigurátor soupisek', () => {
  it('soupiska jde uložit do CSV a znovu přečíst beze ztráty', () => {
    const text = readFileSync(new URL('../data/soupisky/hraci.csv', import.meta.url), 'utf8');
    const { rows } = parseRosterCsv(text);
    const edited = rows.map((r, i) => (i === 0 ? { ...r, overall: 91, contractUntil: 2030 } : r));
    const back = parseRosterCsv(rosterToCsv(edited));
    expect(back.errors).toEqual([]);
    expect(back.rows.length).toBe(rows.length);
    expect(back.rows[0]).toEqual({ ...edited[0] });
  });
});
