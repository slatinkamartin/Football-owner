import { Fragment, useEffect, useState } from 'react';
import {
  adminMonthly,
  BONUS_HINT,
  BONUS_LABEL,
  bonusScheme,
  budgetApproved,
  budgetRemaining,
  CAMP_LABEL,
  campLocked,
  campCost,
  communityReference,
  communitySpend,
  contractExpiring,
  DEPARTMENT_KEYS,
  DEPARTMENT_LABEL,
  departmentEffect,
  departmentReference,
  departmentsOf,
  facilityUpkeep,
  forecastSeason,
  hierarchyIssues,
  incidentChance,
  leagueBenchmarks,
  maintenanceMonthly,
  playerAge,
  playerName,
  POSITION_SHORT,
  renewalDemand,
  renewContract,
  ROLE_LABEL,
  seasonLabel,
  SECTION_HINT,
  SECTION_LABEL,
  sectionRoomFor,
  sectionsOf,
  sectionUsage,
  securityPerMatch,
  setWageSection,
  STAFF_KEY,
  squadOf,
  tierOf,
  updatePolicy,
  wageBudgetMonthly,
  wageCommitments,
  wagePlan,
  wageRank,
  wageSplit,
  WAGE_SECTIONS,
  type ActionResult,
  type BonusScheme,
  type CampChoice,
  type Departments,
  type GameState,
  type Level,
  type StaffRole,
  type WageSection,
} from '../../../engine';
import { Notice } from '../../components';
import { money } from '../../format';
import { PlayerLink } from '../../nav';
import type { FinanceTab } from '../Finance';
import { Choices, Impact, impactText, LineCard, SliderField } from './shared';

const EFFECT_TEXT: Record<keyof Departments, (e: number) => string> = {
  skauting: (e) => `přesnost odhadů ${e >= 0 ? '+' : ''}${Math.round(e * 35)} %`,
  mladez: (e) => `dorostenci ${e >= 0 ? '+' : ''}${(e * 2.5).toFixed(1)} bodu`,
  medicina: (e) => `zranění ${e >= 0 ? '−' : '+'}${Math.abs(Math.round(e * 15))} %`,
  marketing: (e) => `sponzoři ${e >= 0 ? '+' : ''}${Math.round(e * 8)} %, fanoušci ${e >= 0 ? '+' : ''}${Math.round(e * 6)}`,
};

/** Výdaje: každý řádek rozpočtu má svou kartu s ovládáním, dopadem ve hře a srovnáním s ligou. */
export function FinanceExpenses({ game, onChange, onOpen, focus }: { game: GameState; onChange: (g: GameState) => void; onOpen: (tab: FinanceTab, line?: string) => void; focus?: string }) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const apply = (r: ActionResult) => {
    if (r.state !== game) onChange(r.state);
    setMessage({ text: r.message, ok: r.ok });
  };
  const set = (patch: Parameters<typeof updatePolicy>[1]) => {
    setMessage(null);
    onChange(updatePolicy(game, patch));
  };
  useEffect(() => {
    if (focus) document.getElementById(`line-${focus}`)?.scrollIntoView({ block: 'start' });
  }, [focus]);

  const club = game.clubs[game.owner.clubId];
  const tier = tierOf(game, club.id);
  const plan = forecastSeason(game);
  const bench = leagueBenchmarks(game, plan);
  const line = (...keys: string[]) => plan.lines.filter((l) => keys.includes(l.key));
  const costs = plan.lines.filter((l) => l.group === 'provoz' && l.amount < 0 && l.key !== 'ostatni');
  const total = costs.reduce((a, l) => a + l.amount, 0);

  // Platy
  const split = wageSplit(game);
  const usage = sectionUsage(game);
  const sections = sectionsOf(game);
  const scheme = bonusScheme(game);
  const wp = wagePlan(game);
  const sum = (k: 'cap' | 'bill' | 'expiring' | 'room') => usage.reduce((a, u) => a + u[k], 0);
  const squad = squadOf(game, club.id).sort((a, b) => b.wage - a.wage);
  const issues = hierarchyIssues(game);
  const expiring = squad.filter((p) => contractExpiring(game, p)).sort((a, b) => a.contractUntil - b.contractUntil || b.overall - a.overall);
  const commitments = wageCommitments(game);
  const changeSplit = (section: WageSection, value: number) => {
    const others = WAGE_SECTIONS.filter((s) => s !== section);
    const rest = others.reduce((a, s) => a + split[s], 0);
    const next = { ...split, [section]: value } as Record<WageSection, number>;
    for (const s of others) next[s] = rest > 0 ? (split[s] / rest) * (1 - value) : (1 - value) / others.length;
    set({ wageSplit: next });
  };
  const base = wageBudgetMonthly({ ...club, policy: { ...club.policy, wageMultiplier: 1 } });
  const markPct = (wp.contracts / 12 / Math.max(1, base)) * 100;

  // Ostatní
  const ref = departmentReference(club, tier);
  const depts = departmentsOf(club, tier);
  const staff = (Object.keys(STAFF_KEY) as StaffRole[]).map((r) => ({ role: r, s: game.staff[club.staff[STAFF_KEY[r]] ?? ''] })).filter((x) => x.s);
  const cref = communityReference(tier);

  return (
    <div className="stack">
      <Notice message={message?.text ?? null} ok={message?.ok} />
      <section className="card line-index">
        <div className="row-between">
          <h2>Výdaje sezóny {seasonLabel(game.season)}</h2>
          <strong className="neg">{money(total)}</strong>
        </div>
        <p className="muted small">{budgetApproved(game) ? 'Výhled = co už se zaplatilo + odhad zbytku sezóny.' : 'Plán podle nastavení.'} Změny se hned propíší do rozpočtu; schvalují se v záložce Rozpočet.</p>
        <ul className="plain index-list">
          {costs.map((l) => (
            <li key={l.key}>
              <button className="linkbtn" onClick={() => document.getElementById(`line-${l.key === 'rezerva' ? 'platy' : l.key}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>{l.label}</button>
              <span className="num">{money(l.amount)}</span>
            </li>
          ))}
        </ul>
      </section>

      <LineCard id="platy" title="Platy hráčů a prémie" lines={line('platy', 'rezerva')} bench={bench.platy} effects={['podpisy a prodloužení smluv', 'nálada v kabině', 'síla týmu']}
        note="Rozpočet na platy je celý mzdový strop. Ve výhledu jsou zvlášť platy podepsaných smluv s prémiemi a rezerva, kterou ředitel může využít na nové smlouvy. Co nevyužije, zůstane klubu."
      >
        <div className="cap-box">
          <div><span className="muted small">Strop měsíčně</span><strong>{money(wageBudgetMonthly(club))}</strong></div>
          <div><span className="muted small">Strop na sezónu</span><strong>{money(wp.cap)}</strong></div>
          <div><span className="muted small">Platy ve smlouvách</span><strong>{money(wp.contracts / 12)} / měs.</strong></div>
          <div><span className="muted small">Volné místo</span><strong className={wp.cap - wp.contracts < 0 ? 'neg' : 'pos'}>{money((wp.cap - wp.contracts) / 12)} / měs.</strong></div>
        </div>
        <div>
          <SliderField
            label="Mzdový strop"
            value={Math.round(club.policy.wageMultiplier * 100)}
            min={50}
            max={200}
            step={5}
            format={(v) => `${v} % běžného (${money(base * (v / 100))} / měs.)`}
            reference={`${wageRank(game)}. místo v lize · současné platy ${Math.round(markPct)} %`}
            onChange={(v) => set({ wageMultiplier: v / 100 })}
            preview={(v) => (
              <Impact
                game={game}
                patch={v === Math.round(club.policy.wageMultiplier * 100) ? {} : { wageMultiplier: v / 100 }}
                extra={[
                  v / 100 > club.policy.wageMultiplier && 'víc místa na nové a prodloužené smlouvy: silnější kádr, ale vyšší platy i v dalších letech',
                  v / 100 < club.policy.wageMultiplier && (v < markPct ? 'strop pod současnými platy: ředitel nebude prodlužovat ani podepisovat, kabina bude nespokojená' : 'méně místa na nové smlouvy'),
                ]}
              />
            )}
          />
        </div>
        <h3>Rozdělení do sekcí</h3>
        <div className="table-wrap">
          <table className="sections">
            <thead>
              <tr><th>Sekce</th><th className="num">Podíl</th><th className="num">Rozpočet</th><th className="num">Platy</th><th className="num hide-sm">Končí v létě</th><th className="num">Zbývá</th></tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.section}>
                  <td className="wrap">
                    <strong>{SECTION_LABEL[u.section]}</strong> <span className="muted small">({u.players})</span>
                    <input type="range" min={0} max={70} step={1} value={Math.round(split[u.section] * 100)} aria-label={`Podíl sekce ${SECTION_LABEL[u.section]}`} onChange={(e) => changeSplit(u.section, Number(e.target.value) / 100)} />
                    <span className="muted small">{SECTION_HINT[u.section]}</span>
                  </td>
                  <td className="num" data-label="Podíl">{Math.round(split[u.section] * 100)} %</td>
                  <td className="num" data-label="Rozpočet">{money(u.cap)}</td>
                  <td className="num" data-label="Platy">{money(u.bill)}</td>
                  <td className="num hide-sm muted">{money(u.expiring)}</td>
                  <td className={`num ${u.room < 0 ? 'neg' : 'pos'}`} data-label="Zbývá">{money(u.room)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Celkem (měsíčně)</td>
                <td className="num" data-label="Podíl">100 %</td>
                <td className="num" data-label="Rozpočet">{money(sum('cap'))}</td>
                <td className="num" data-label="Platy">{money(sum('bill'))}</td>
                <td className="num hide-sm">{money(sum('expiring'))}</td>
                <td className={`num ${sum('room') < 0 ? 'neg' : 'pos'}`} data-label="Zbývá">{money(sum('room'))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <h3>Systém prémií</h3>
        <div className="choices compact">
          {(['fixni', 'vyvazeny', 'vykonovy'] as BonusScheme[]).map((b) => (
            <button key={b} className={`choice ${scheme === b ? 'selected' : ''}`} onClick={() => set({ bonusScheme: b })}>
              <strong>{BONUS_LABEL[b]}</strong>
              <span>{BONUS_HINT[b]}</span>
              <span className="choice-impact">{scheme === b ? 'současné nastavení' : impactText(game, { bonusScheme: b }, true)}</span>
            </button>
          ))}
        </div>
        <p className="muted small">Prémie za body a cíl odhadem {money(wp.bonuses)} za sezónu.</p>
        <h3>Podepsané platy do budoucna</h3>
        <dl className="kv">
          {commitments.map((c) => (
            <Fragment key={c.season}>
              <dt>Sezóna {seasonLabel(c.season)} ({c.players} hráčů)</dt>
              <dd>{money(c.amount)}</dd>
            </Fragment>
          ))}
        </dl>
      </LineCard>

      <section className="card" id="line-hraci">
        <h2>Hráči po sekcích <span className="muted small">· {money(sum('bill'))} z {money(sum('cap'))} měsíčně</span></h2>
        {issues.map((t, i) => <p key={i} className="warning soft">{t}</p>)}
        <div className="sections-grid">
          {WAGE_SECTIONS.map((sec) => {
            const u = usage.find((x) => x.section === sec)!;
            const list = squad.filter((p) => sections.get(p.id) === sec);
            return (
              <div key={sec} className="subcard">
                <div className="row-between">
                  <strong>{SECTION_LABEL[sec]}</strong>
                  <span className={`small ${u.room < 0 ? 'neg' : 'muted'}`}>{money(u.bill)} z {money(u.cap)}</span>
                </div>
                <span className="meter wide"><span className={`meter-fill ${u.room < 0 ? 'bad' : u.bill > u.cap * 0.9 ? 'warn' : 'good'}`} style={{ width: `${Math.min(100, (u.bill / Math.max(1, u.cap)) * 100)}%` }} /></span>
                <ul className="plain small wage-list">
                  {list.map((p) => (
                    <li key={p.id} className="row-between">
                      <span>
                        <span className="muted">{POSITION_SHORT[p.position]}</span> <PlayerLink id={p.id}>{playerName(p)}</PlayerLink> <span className="muted">({p.overall}, do {p.contractUntil})</span>
                      </span>
                      <span className="wage-cell">
                        {money(p.wage)}
                        <select aria-label={`Sekce hráče ${playerName(p)}`} value={p.wageSection ?? ''} onChange={(e) => onChange(setWageSection(game, p.id, (e.target.value || undefined) as WageSection | undefined))}>
                          <option value="">auto</option>
                          {WAGE_SECTIONS.map((s) => <option key={s} value={s}>{SECTION_LABEL[s]}</option>)}
                        </select>
                      </span>
                    </li>
                  ))}
                  {list.length === 0 && <li className="muted">nikdo</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {expiring.length > 0 && (
        <section className="card" id="line-smlouvy">
          <h2>Končící smlouvy <span className="muted small">· {expiring.length} hráčů</span></h2>
          <p className="muted small">Smlouva končí v létě {game.season + 1}. Prodloužení na 2 roky za plat, který hráč chce. Bez prodloužení odejde zadarmo.</p>
          <div className="table-wrap">
            <table className="expiring">
              <thead>
                <tr><th>Hráč</th><th className="num">Teď</th><th className="num">Chce</th><th className="num">Místo v sekci</th><th /></tr>
              </thead>
              <tbody>
                {expiring.map((p) => {
                  const demand = renewalDemand(game, p);
                  const room = sectionRoomFor(game, p, demand);
                  return (
                    <tr key={p.id}>
                      <td data-label="Hráč"><span className="muted">{POSITION_SHORT[p.position]}</span> <PlayerLink id={p.id}>{playerName(p)}</PlayerLink> <span className="muted small">({p.overall}, {playerAge(p, game.season)} let)</span></td>
                      <td data-label="Teď" className="num">{money(p.wage)}</td>
                      <td data-label="Chce" className="num">{money(demand)}</td>
                      <td data-label={SECTION_LABEL[room.section]} className={`num ${room.room < 0 ? 'neg' : 'muted'}`}>{SECTION_LABEL[room.section]}: {money(room.room)}</td>
                      <td><button onClick={() => apply(renewContract(game, p.id, demand, 2))}>Prodloužit</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <LineCard id="prestupy" title="Přestupy (nákupy a splátky)" lines={line('prestupy')} effects={['posily', 'splátky do dalších let']}>
        <dl className="kv">
          <dt>Rozpočet na odstupné</dt>
          <dd>{money(club.policy.transferBudget)}</dd>
          <dt>Lze ještě utratit</dt>
          <dd>{money(budgetRemaining(game))}</dd>
        </dl>
        <button onClick={() => onOpen('prestupy')}>Přestupová politika ›</button>
      </LineCard>

      <LineCard id="oddeleni" title="Oddělení" lines={line('oddeleni')} bench={bench.oddeleni} effects={['skauting', 'mládež', 'zranění', 'sponzoři a fanoušci']}
        note="Každá další koruna přinese méně: dvojnásobek běžné částky má poloviční účinek proti čtyřnásobku."
      >
        {DEPARTMENT_KEYS.map((key) => {
          const e = departmentEffect(club, tier, key);
          const pct = Math.round((depts[key] / Math.max(1, ref[key])) * 100);
          return (
            <SliderField
              key={key}
              label={DEPARTMENT_LABEL[key]}
              value={pct}
              min={0}
              max={400}
              step={25}
              format={(v) => `${money((ref[key] * v) / 100)} ročně (${v} % běžného)`}
              reference={EFFECT_TEXT[key](e)}
              onChange={(v) => set({ departments: { ...depts, [key]: Math.round((ref[key] * v) / 100 / 10_000) * 10_000 } })}
              preview={(v) => {
                const amount = Math.round((ref[key] * v) / 100 / 10_000) * 10_000;
                const next = v <= 0 ? -1 : Math.max(-1, Math.min(1, Math.log2(amount / Math.max(1, ref[key])) / 2));
                return v === pct ? null : <Impact game={game} patch={{ departments: { ...depts, [key]: amount } }} extra={[`nově ${EFFECT_TEXT[key](next)}`]} />;
              }}
            />
          );
        })}
      </LineCard>

      <div className="grid line-grid">
        <LineCard id="udrzba" title="Údržba stadionu a trávníku" lines={line('udrzba')} bench={bench.provoz} effects={['stav trávníku', 'zranění', 'nálada fanoušků']}>
          <Choices<Level>
            label="Úroveň údržby"
            value={club.policy.maintenance ?? 'bezna'}
            onChange={(v) => set({ maintenance: v })}
            detail={(v) => impactText(game, { maintenance: v }, true)}
            options={[
              { id: 'nizka', label: 'Úsporná', hint: '−15 % nákladů; zranění +12 %, domácí výhoda −10 %, akce poškodí trávník v 55 % případů' },
              { id: 'bezna', label: 'Běžná', hint: 'standard; akce poškodí trávník ve 30 % případů' },
              { id: 'vysoka', label: 'Špičková', hint: '+15 % nákladů; zranění −10 %, domácí výhoda +8 %, akce poškodí trávník jen ve 12 % případů' },
            ]}
          />
          <p className="preview small">Měsíčně {money(maintenanceMonthly(club, tier))}: stadion ({club.stadium.capacity.toLocaleString('cs-CZ')} míst) a zázemí (běžně {money(club.stadium.capacity * 15 + facilityUpkeep(club.facilities, tier))}).</p>
        </LineCard>

        <LineCard id="soustredeni" title="Soustředění" lines={line('soustredeni')} effects={['forma na startu podzimu a jara']}>
          {(['summerCamp', 'winterCamp'] as const).map((k) => (
            <Choices<CampChoice>
              key={k}
              label={k === 'summerCamp' ? 'Letní soustředění (platí se 10. 7., účinek do poloviny září)' : 'Zimní soustředění (platí se 10. 1., účinek únor a březen)'}
              value={campLocked(game, k === 'summerCamp' ? 'summer' : 'winter') ?? club.policy[k] ?? 'doma'}
              disabled={!!campLocked(game, k === 'summerCamp' ? 'summer' : 'winter')}
              onChange={(v) => set({ [k]: v })}
              detail={(v) => `${impactText(game, { [k]: v }, true)} · síla týmu ${v === 'zahranici' ? '+1' : v === 'zadne' ? '−0,8' : '±0'} ${k === 'summerCamp' ? '15. 7.–15. 9.' : 'v únoru a březnu'}`}
              options={(['zadne', 'doma', 'zahranici'] as CampChoice[]).map((c) => ({
                id: c,
                label: CAMP_LABEL[c],
                hint: `${money(campCost(tier, c))}, ${c === 'zadne' ? 'tým slabší' : c === 'doma' ? 'bez vlivu' : 'tým silnější'}`,
              }))}
            />
          ))}
        </LineCard>

        <LineCard id="bezpecnost" title="Pořadatelé a bezpečnost" lines={line('bezpecnost')} effects={['pokuty za výtržnosti', 'pověst u médií', 'nálada fanoušků']}>
          <Choices<Level>
            label="Pořadatelská služba"
            value={club.policy.security ?? 'bezna'}
            onChange={(v) => set({ security: v })}
            detail={(v) => `${impactText(game, { security: v }, true)} · výtržnosti asi ${(incidentChance(v) * 15).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })}× za sezónu (pokuta, média −2, nálada −2)`}
            options={(['nizka', 'bezna', 'vysoka'] as Level[]).map((l) => ({
              id: l,
              label: l === 'nizka' ? 'Úsporná' : l === 'bezna' ? 'Běžná' : 'Posílená',
              hint: `${money(securityPerMatch(tier, l))} za zápas, riziko výtržností ${(incidentChance(l) * 100).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} %`,
            }))}
          />
        </LineCard>

        <LineCard id="komunita" title="Komunita, ženský a dětský fotbal" lines={line('komunita')} effects={['vztah s městem a patrioty', 'šance na dotace', 'pověst u médií']}>
          <SliderField
            label="Roční rozpočet"
            value={communitySpend(club, tier)}
            min={0}
            max={cref * 4}
            step={Math.max(10_000, Math.round(cref / 20 / 10_000) * 10_000)}
            format={(v) => money(v)}
            reference={`běžně ${money(cref)}`}
            onChange={(v) => set({ community: v })}
            preview={(v) => {
              const e = v <= 0 ? -1 : Math.max(-1, Math.min(1, Math.log2(v / cref) / 2));
              return (
                <Impact
                  game={game}
                  patch={v === communitySpend(club, tier) ? {} : { community: v }}
                  extra={[
                    e > 0.05 ? `město a patrioti +${(e * 4.8).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} spokojenosti za rok, šance na dotace +${Math.round(e * 8)} %, média +${(e * 1.8).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} za rok` : e < -0.05 ? `město a patrioti −${(-e * 4.8).toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} spokojenosti za rok, šance na dotace −${Math.round(-e * 8)} %` : 'běžná úroveň, bez vlivu na vztahy',
                  ]}
                />
              );
            }}
          />
        </LineCard>

        <LineCard id="vedeni" title="Trenér a ředitelé" lines={line('vedeni')} effects={['kvalita rozhodnutí vedení']} note="Platy vedení se sjednávají při najímání v záložce Vedení.">
          <dl className="kv">
            {staff.map((x) => (
              <span key={x.role} className="kv-row">
                <dt>{ROLE_LABEL[x.role]}</dt>
                <dd>{money(x.s!.wage)} / měs.</dd>
              </span>
            ))}
          </dl>
        </LineCard>

        <LineCard id="provoz" title="Administrativa, cestování a energie" lines={line('provoz')} note={`Pevná částka podle soutěže (${money(adminMonthly(tier))} měsíčně). Schopný finanční ředitel ji snižuje.`} />

        <LineCard id="skautsit" title="Zahraniční skauting" lines={line('skautsit')} effects={['hráči ze zahraničí na trhu', 'přesnost odhadů', 'nákupy ředitele v cizině']}
          note="Skautské sítě v regionech se otevírají a ruší v záložce Přestupy (Zahraniční trh). Region partnerského klubu je zdarma." />

        <LineCard id="programy" title="Programy klubu" lines={line('programy')} effects={['vývoj mladých (B-tým)', 'nálada a město (ženský tým)', 'skauting a síla (analytika)', 'zabydlování cizinců']}
          note="Programy se spouštějí a ukončují v záložce Stadion (Programy klubu). Sponzor ženského týmu je v příjmech mezi sponzory." />
      </div>
    </div>
  );
}
