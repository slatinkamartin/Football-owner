import { describe, expect, it } from 'vitest';
import pack from '../data/cz-zaklad/pack.json';
import { advanceDays, newGame } from '../engine/game';
import type { DataPack, GameState } from '../engine/types';
import { resolveTarget } from './navmap';
import { clubPalette, contrast, parseColor } from './theme';
import { inboxItems } from './screens/Inbox';
import { clubStatus } from './screens/ClubStatus';
import { crestInitials } from './ui';

describe('V2 navigace: staré cíle vedou na nové podzáložky', () => {
  it('všechny cíle milníků, porady a odkazů mají místo', () => {
    expect(resolveTarget('prehled')).toEqual({ main: 'tyden' });
    expect(resolveTarget('kadr')).toEqual({ main: 'tym', sub: 'kadr' });
    expect(resolveTarget('vedeni')).toEqual({ main: 'tym', sub: 'vedeni' });
    expect(resolveTarget('prestupy')).toEqual({ main: 'trh', sub: 'prestupy' });
    expect(resolveTarget('stadion')).toEqual({ main: 'klub', sub: 'stadion' });
    expect(resolveTarget('majitel')).toEqual({ main: 'klub', sub: 'majitel' });
    expect(resolveTarget('tabulky')).toEqual({ main: 'liga', sub: 'tabulky' });
    expect(resolveTarget('zapasy')).toEqual({ main: 'liga', sub: 'zapasy' });
    expect(resolveTarget('finance', 'rozpocet')).toEqual({ main: 'penize', sub: 'rozpocet' });
    expect(resolveTarget('finance')).toEqual({ main: 'penize', sub: 'prehled' });
    expect(resolveTarget('penize/prestupy')).toEqual({ main: 'penize', sub: 'prestupy' });
    expect(resolveTarget('tym/trenink')).toEqual({ main: 'tym', sub: 'trenink' });
    expect(resolveTarget('klub/fanousci')).toEqual({ main: 'klub', sub: 'fanousci' });
    expect(resolveTarget('trenink')).toEqual({ main: 'tym', sub: 'trenink' });
    expect(resolveTarget('hunt')).toEqual({ main: 'trh', sub: 'lov' });
    expect(resolveTarget('pohar')).toEqual({ main: 'liga', sub: 'pohary' });
    expect(resolveTarget('hra')).toEqual({ main: 'hra' });
    expect(resolveTarget('nesmysl')).toEqual({ main: 'tyden' });
  });
});

describe('V2 téma: barvy klubu s čitelným kontrastem', () => {
  const clubs = (pack as DataPack).clubs.map((c) => c.colors);
  it('akcent má proti kartě aspoň 4,5:1 ve světlém i tmavém režimu a text na akcentu je čitelný', () => {
    for (const colors of [...clubs, ['#ffffff', '#ffffff'] as [string, string], ['#ffd200', '#fff200'] as [string, string]]) {
      for (const dark of [false, true]) {
        const p = clubPalette(colors, dark);
        const card = dark ? parseColor('#1c221f')! : parseColor('#ffffff')!;
        expect(contrast(parseColor(p.accent)!, card)).toBeGreaterThanOrEqual(4.4);
        expect(contrast(parseColor(p.onAccent)!, parseColor(p.accent)!)).toBeGreaterThanOrEqual(3);
      }
    }
  });
  it('iniciály erbu', () => {
    expect(crestInitials('SK Slavia Praha')).toBe('SLA');
    expect(crestInitials('FC Viktoria Plzeň')).toBe('VP');
  });
});

describe('V2 schránka a stav klubu', () => {
  const start = newGame(pack as DataPack, { clubId: 'olomouc', ownerName: 'T', difficulty: 'stredni', seed: 5 });
  it('schránka je seřazená podle termínu, položky bez termínu na konci', () => {
    let s: GameState = start;
    for (let i = 0; i < 6; i++) s = advanceDays(s, 7).state;
    const items = inboxItems(s, [{ id: 'x', title: 'bez termínu', icon: 'inbox' }, { id: 'y', title: 'brzy', icon: 'inbox', due: s.date }]);
    const dated = items.filter((i) => i.due).map((i) => i.due!);
    expect([...dated].sort()).toEqual(dated);
    expect(items[items.length - 1].due === undefined).toBe(true);
    expect(items.findIndex((i) => i.id === 'y')).toBeLessThan(items.findIndex((i) => i.id === 'x'));
    for (const e of s.events) expect(items.some((i) => i.event?.id === e.id)).toBe(true);
  });
  it('stav klubu má čtyři čísla s důvody', () => {
    const tiles = clubStatus(advanceDays(start, 40).state);
    expect(tiles.map((t) => t.key)).toEqual(['sport', 'finance', 'fans', 'vztahy']);
    for (const t of tiles) expect(t.value.length).toBeGreaterThan(0);
    expect(tiles[3].rows?.length).toBe(5);
  });
});
