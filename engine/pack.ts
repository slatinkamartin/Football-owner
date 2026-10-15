import type { DataPack } from './types';

/** Kontrola datového balíčku. Vrací seznam chyb (prázdný = v pořádku). */
export function validatePack(pack: DataPack): string[] {
  const errors: string[] = [];
  const compIds = new Set(pack.competitions.map((c) => c.id));
  const clubIds = new Set<string>();

  for (const club of pack.clubs) {
    if (clubIds.has(club.id)) errors.push(`Duplicitní klub: ${club.id}`);
    clubIds.add(club.id);
    if (!/^[a-z0-9]+$/.test(club.id)) errors.push(`Neplatné id klubu: ${club.id}`);
    if (!compIds.has(club.competition)) errors.push(`${club.id}: neznámá soutěž ${club.competition}`);
    if (club.reputation < 1 || club.reputation > 100) errors.push(`${club.id}: pověst mimo rozsah 1–100`);
    if (club.stadium.capacity <= 0) errors.push(`${club.id}: neplatná kapacita stadionu`);
  }
  for (const club of pack.clubs) {
    if (club.reserveOf && !clubIds.has(club.reserveOf)) {
      errors.push(`${club.id}: mateřský klub ${club.reserveOf} neexistuje`);
    }
  }
  for (const comp of pack.competitions) {
    const clubs = pack.clubs.filter((c) => c.competition === comp.id);
    if (clubs.length !== comp.targetSize) {
      errors.push(`${comp.id}: ${clubs.length} klubů, očekáváno ${comp.targetSize}`);
    }
    for (const c of clubs) {
      if (comp.region && c.region !== comp.region) errors.push(`${c.id}: region neodpovídá soutěži ${comp.id}`);
      if (c.reserveOf && comp.tier === 1) errors.push(`${c.id}: B-tým nesmí hrát nejvyšší soutěž`);
      const parent = pack.clubs.find((p) => p.id === c.reserveOf);
      if (parent && parent.competition === comp.id) errors.push(`${c.id}: hraje stejnou soutěž jako mateřský klub`);
    }
  }
  return errors;
}
