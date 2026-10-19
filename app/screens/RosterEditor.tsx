import { useMemo, useState } from 'react';
import pack from '../../data/cz-zaklad/pack.json';
import { rosterRating, rosterToCsv, rosterWarnings, type DataPack, type Position, type RosterRole, type RosterRow } from '../../engine';
import { deleteRosterSet, saveRosterSet, type RosterSet } from '../storage';

const czPack = pack as DataPack;
const SEASON = 2026;
const POS: { id: Position; label: string }[] = [
  { id: 'GK', label: 'BR' },
  { id: 'DF', label: 'OBR' },
  { id: 'MF', label: 'ZÁL' },
  { id: 'FW', label: 'ÚT' },
];
const ROLES: { id: RosterRole; label: string }[] = [
  { id: 'zaklad', label: 'základ' },
  { id: 'rotace', label: 'rotace' },
  { id: 'rezerva', label: 'rezerva' },
  { id: 'talent', label: 'talent' },
];
const POS_ORDER: Record<Position, number> = { GK: 0, DF: 1, MF: 2, FW: 3 };

const clubName = (id: string) => czPack.clubs.find((c) => c.id === id)?.name ?? id;
const reputation = (id: string) => czPack.clubs.find((c) => c.id === id)?.reputation ?? 40;

/**
 * Konfigurátor soupisek: úprava hráčů po klubech. Výsledek se uloží jako samostatná soupiska,
 * kterou jde vybrat při nové hře a později znovu upravit.
 */
export function RosterEditor({ base, baseName, existing, onClose }: { base: RosterRow[]; baseName: string; existing?: RosterSet; onClose: (savedId?: string) => void }) {
  const [rows, setRows] = useState<RosterRow[]>(() => structuredClone(existing?.rows ?? base));
  const [name, setName] = useState(existing?.name ?? `Moje soupisky (${new Date().toLocaleDateString('cs-CZ')})`);
  const [clubId, setClubId] = useState(() => (existing?.rows ?? base)[0]?.club ?? czPack.clubs[0].id);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.club, (m.get(r.club) ?? 0) + 1);
    return m;
  }, [rows]);
  // Indexy hráčů vybraného klubu seřazené podle pozice (úpravy se zapisují do pole `rows`).
  const list = rows.map((r, i) => ({ r, i })).filter((x) => x.r.club === clubId).sort((a, b) => POS_ORDER[a.r.position] - POS_ORDER[b.r.position] || a.r.lastName.localeCompare(b.r.lastName, 'cs'));
  const warnings = rosterWarnings(rows, clubName);

  const change = (i: number, patch: Partial<RosterRow>) => {
    setRows((all) => all.map((r, k) => (k === i ? { ...r, ...patch } : r)));
    setDirty(true);
    setMsg(null);
  };
  const remove = (i: number) => {
    setRows((all) => all.filter((_, k) => k !== i));
    setDirty(true);
  };
  const add = () => {
    setRows((all) => [...all, { club: clubId, firstName: '', lastName: 'Nový hráč', birthYear: 2000, position: 'MF', nationality: 'Česko', role: 'rotace' }]);
    setDirty(true);
  };
  const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

  const save = async (asNew: boolean) => {
    const set: RosterSet = {
      id: !asNew && existing ? existing.id : `s${Date.now()}`,
      name: name.trim() || 'Moje soupisky',
      updated: new Date().toISOString(),
      rows: rows.filter((r) => r.lastName.trim()),
    };
    try {
      await saveRosterSet(set);
      setDirty(false);
      onClose(set.id);
    } catch {
      setMsg('Soupisku se nepodařilo uložit (prohlížeč nepovolil úložiště).');
    }
  };

  const download = () => {
    const blob = new Blob(['﻿' + rosterToCsv(rows)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(name || 'soupisky').toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="app newgame roster-editor">
      <header className="hero">
        <h1>Konfigurátor soupisek</h1>
        <p>{existing ? `Upravujete uloženou soupisku „${existing.name}“.` : `Výchozí soupiska: ${baseName}. Úpravy se uloží jako nová soupiska, původní data zůstanou beze změny.`}</p>
      </header>

      <section className="card">
        <div className="roster-head">
          <label className="field">
            <span>Název soupisky</span>
            <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
          </label>
          <label className="field">
            <span>Klub</span>
            <select value={clubId} onChange={(e) => setClubId(e.target.value)}>
              {czPack.competitions.map((comp) => (
                <optgroup key={comp.id} label={comp.fullName ?? comp.name}>
                  {czPack.clubs.filter((c) => c.competition === comp.id).map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({counts.get(c.id) ?? 0})</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
        <p className="muted small">
          {rows.length} hráčů v {counts.size} klubech. Kluby bez hráčů dostanou ve hře vymyšlené hráče. Prázdné hodnocení hra dopočítá podle klubu, role a věku (šedé číslo).
        </p>
      </section>

      <section className="card">
        <div className="row-between">
          <h2>{clubName(clubId)} <span className="muted small">· {list.length} hráčů</span></h2>
          <button onClick={add}>+ Přidat hráče</button>
        </div>
        {list.length === 0 && <p className="muted">Klub zatím nemá žádné hráče. Bez nich dostane ve hře vymyšlený kádr.</p>}
        {list.length > 0 && (
          <div className="table-wrap">
            <table className="roster-table">
              <thead>
                <tr>
                  <th>Jméno</th><th>Příjmení</th><th>Rok</th><th>Poz.</th><th>Národnost</th><th>Role</th><th>Hodn.</th><th>Pot.</th><th>Smlouva</th><th>Klub</th><th />
                </tr>
              </thead>
              <tbody>
                {list.map(({ r, i }) => {
                  const auto = rosterRating({ ...r, overall: undefined, potential: undefined }, reputation(r.club), SEASON);
                  return (
                    <tr key={i}>
                      <td><input aria-label="Jméno" value={r.firstName} onChange={(e) => change(i, { firstName: e.target.value })} /></td>
                      <td><input aria-label="Příjmení" value={r.lastName} onChange={(e) => change(i, { lastName: e.target.value })} /></td>
                      <td><input aria-label="Rok narození" className="num-in" inputMode="numeric" value={r.birthYear} onChange={(e) => change(i, { birthYear: Number(e.target.value.replace(/\D/g, '')) || 0 })} /></td>
                      <td>
                        <select aria-label="Pozice" value={r.position} onChange={(e) => change(i, { position: e.target.value as Position })}>
                          {POS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                      </td>
                      <td><input aria-label="Národnost" value={r.nationality} onChange={(e) => change(i, { nationality: e.target.value })} /></td>
                      <td>
                        <select aria-label="Role" value={r.role} onChange={(e) => change(i, { role: e.target.value as RosterRole })}>
                          {ROLES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                        </select>
                      </td>
                      <td><input aria-label="Hodnocení" className="num-in" inputMode="numeric" placeholder={String(auto.overall)} value={r.overall ?? ''} onChange={(e) => change(i, { overall: num(e.target.value) })} /></td>
                      <td><input aria-label="Potenciál" className="num-in" inputMode="numeric" placeholder={String(auto.potential)} value={r.potential ?? ''} onChange={(e) => change(i, { potential: num(e.target.value) })} /></td>
                      <td><input aria-label="Smlouva do" className="num-in" inputMode="numeric" placeholder="auto" value={r.contractUntil ?? ''} onChange={(e) => change(i, { contractUntil: num(e.target.value) })} /></td>
                      <td>
                        <select aria-label="Přesunout do klubu" value={r.club} onChange={(e) => change(i, { club: e.target.value })}>
                          {czPack.clubs.map((c) => <option key={c.id} value={c.id}>{c.shortName}</option>)}
                        </select>
                      </td>
                      <td><button className="linkbtn neg" aria-label={`Smazat ${r.lastName}`} onClick={() => remove(i)}>✕</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {warnings.length > 0 && (
        <section className="card">
          <h3>Upozornění</h3>
          <ul className="plain small">{warnings.slice(0, 8).map((w, i) => <li key={i}>• {w}</li>)}</ul>
          {warnings.length > 8 && <p className="muted small">… a další ({warnings.length - 8}).</p>}
        </section>
      )}

      {msg && <p className="warning">{msg}</p>}
      <div className="sticky-actions roster-actions">
        <button className="primary" onClick={() => void save(false)}>{existing ? 'Uložit změny' : 'Uložit jako novou soupisku'}</button>
        {existing && <button onClick={() => void save(true)}>Uložit jako kopii</button>}
        <button onClick={download}>Stáhnout CSV</button>
        {existing && !confirmDelete && <button className="danger" onClick={() => setConfirmDelete(true)}>Smazat soupisku</button>}
        {existing && confirmDelete && (
          <button className="danger" onClick={async () => { await deleteRosterSet(existing.id); onClose(); }}>Opravdu smazat</button>
        )}
        {!confirmLeave && <button className="linkbtn" onClick={() => (dirty ? setConfirmLeave(true) : onClose())}>Zpět bez uložení</button>}
        {confirmLeave && <button className="linkbtn neg" onClick={() => onClose()}>Zahodit změny a odejít</button>}
      </div>
    </div>
  );
}
