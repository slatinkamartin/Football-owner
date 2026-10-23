/**
 * V2 (B4): stav klubu ve čtyřech číslech – sport, finance, fanoušci, vztahy. Každé číslo má šipku
 * trendu a po rozkliknutí důvody (z tabulky, zůstatku, panelu tlaku a vztahů).
 */
import { useState } from 'react';
import {
  competitionOf,
  computeTable,
  dressingRoom,
  fansSummary,
  formatShortDate,
  goalLabel,
  goalTarget,
  pulseRows,
  sponsorRelation,
  type GameState,
  type SponsorSlot,
} from '../../engine';
import { Meter } from '../components';
import { money } from '../format';
import { Icon } from '../icons';
import { Trend } from '../ui';

type Tone = 'good' | 'warn' | 'bad' | 'neutral';

interface StatusTile {
  key: 'sport' | 'finance' | 'fans' | 'vztahy';
  label: string;
  icon: string;
  value: string;
  sub: string;
  tone: Tone;
  trend: number;
  trendTitle: string;
  trendText?: string;
  reasons: { text: string; delta?: number; date?: string }[];
  rows?: { label: string; value: number }[];
  link: string;
}

const toneOf = (v: number): Tone => (v >= 60 ? 'good' : v >= 40 ? 'warn' : 'bad');

export function clubStatus(game: GameState): StatusTile[] {
  const club = game.clubs[game.owner.clubId];
  const comp = competitionOf(game, club.id);
  const table = comp ? computeTable(comp, game) : [];
  const idx = table.findIndex((r) => r.clubId === club.id);
  const row = table[idx];
  const target = comp ? goalTarget(game.owner.seasonGoal, comp) : 0;
  const tl = [...game.timeline].sort((a, b) => a.round - b.round);
  const posBefore = tl.length >= 5 ? tl[tl.length - 5].position : tl[0]?.position;
  const pos = idx + 1;
  const played = row?.played ?? 0;
  const form = row?.form ?? [];
  const sportTone: Tone = !played ? 'neutral' : pos <= target ? 'good' : pos <= target + 2 ? 'warn' : 'bad';
  const room = dressingRoom(game);
  const pulse = pulseRows(game);
  const pulseOf = (k: string) => pulse.find((p) => p.key === k);

  // Finance: zůstatek proti stavu zhruba před měsícem.
  const hist = club.finance.balanceHistory ?? [];
  const prevBal = hist.length >= 2 ? hist[hist.length - 2].balance : hist[0]?.balance ?? club.finance.monthStartBalance;
  const balTrend = prevBal === undefined ? 0 : club.finance.balance - prevBal;
  const grade = game.rating?.grade;
  const finTone: Tone = club.finance.balance < 0 ? 'bad' : grade && 'DEF'.includes(grade) ? 'warn' : 'good';

  const fans = fansSummary(game);
  const fp = pulseOf('fans');

  const slots: SponsorSlot[] = ['generalni', 'dres', 'stadion'];
  const sponsor = Math.round(slots.reduce((a, s) => a + sponsorRelation(game, s), 0) / slots.length);
  const rel = [
    { label: 'Trenér', value: Math.round(game.owner.trust.trener) },
    { label: 'Sportovní ředitel', value: Math.round(game.owner.trust.reditel) },
    { label: 'Město', value: fans.city },
    { label: 'Sponzoři', value: sponsor },
    { label: 'Fotbalový svaz', value: Math.round(game.owner.league) },
  ];
  const relAvg = Math.round(rel.reduce((a, r) => a + r.value, 0) / rel.length);
  const weakest = [...rel].sort((a, b) => a.value - b.value)[0];
  const vp = pulseOf('vedeni');

  return [
    {
      key: 'sport',
      label: 'Sport',
      icon: 'liga',
      value: played ? `${pos}.` : '–',
      sub: comp ? (played ? `cíl: ${goalLabel(game.owner.seasonGoal, comp)}` : 'sezóna nezačala') : 'mimo soutěž',
      tone: sportTone,
      trend: posBefore && played ? posBefore - pos : 0,
      trendTitle: 'Změna pozice za poslední 4 kola',
      reasons: [
        ...(row && played ? [{ text: `${row.points} bodů z ${played} zápasů, skóre ${row.goalsFor}:${row.goalsAgainst}` }] : []),
        ...(form.length ? [{ text: `Forma: ${form.join(' ')}` }] : []),
        { text: `Kabina: ${room.label} (${Math.round(room.morale)})` },
        ...(comp && played ? [{ text: pos <= target ? `Plníte cíl (do ${target}. místa).` : `Na cíl (do ${target}. místa) chybí ${pos - target} ${pos - target === 1 ? 'místo' : pos - target <= 4 ? 'místa' : 'míst'}.` }] : []),
      ],
      link: 'liga/tabulky',
    },
    {
      key: 'finance',
      label: 'Finance',
      icon: 'penize',
      value: money(club.finance.balance),
      sub: grade ? `vysvědčení ${grade}` : 'zůstatek klubu',
      tone: finTone,
      trend: Math.sign(Math.round(balTrend / 100_000)),
      trendTitle: 'Změna zůstatku od začátku minulého měsíce',
      trendText: balTrend ? `${balTrend > 0 ? '+' : '−'}${money(Math.abs(balTrend))}` : undefined,
      reasons: [
        ...(prevBal !== undefined ? [{ text: `Za poslední měsíc ${balTrend >= 0 ? 'přibylo' : 'ubylo'} ${money(Math.abs(balTrend))}.` }] : []),
        ...(club.finance.monthsNegative > 0 ? [{ text: `Záporný zůstatek ${club.finance.monthsNegative}. měsíc po sobě.` }] : []),
        ...(grade ? [{ text: `Finanční vysvědčení minulé sezóny: ${grade}` }] : []),
        { text: `Vaše osobní peníze: ${money(game.owner.wallet)}` },
      ],
      link: 'penize/prehled',
    },
    {
      key: 'fans',
      label: 'Fanoušci',
      icon: 'fans',
      value: String(fans.mood),
      sub: `kotel ${fans.ultras} · město ${fans.city}`,
      tone: toneOf(fans.mood),
      trend: fp?.trend ?? 0,
      trendTitle: 'Změna nálady za poslední 4 týdny',
      reasons: (fp?.causes ?? []).map((c) => ({ text: c.reason, delta: c.delta, date: c.date })),
      rows: [
        { label: 'Nálada', value: fans.mood },
        { label: 'Kotel', value: fans.ultras },
        { label: 'Město', value: fans.city },
      ],
      link: 'klub/fanousci',
    },
    {
      key: 'vztahy',
      label: 'Vztahy',
      icon: 'handshake',
      value: String(relAvg),
      sub: `nejslabší: ${weakest.label.toLowerCase()} ${weakest.value}`,
      tone: toneOf(relAvg),
      trend: vp?.trend ?? 0,
      trendTitle: 'Změna důvěry vedení za poslední 4 týdny',
      reasons: (vp?.causes ?? []).map((c) => ({ text: c.reason, delta: c.delta, date: c.date })),
      rows: rel,
      link: 'tym/postavy',
    },
  ];
}

export function ClubStatusCard({ game, onNavigate }: { game: GameState; onNavigate: (target: string) => void }) {
  const [open, setOpen] = useState<StatusTile['key'] | null>(null);
  const tiles = clubStatus(game);
  const detail = tiles.find((t) => t.key === open);
  return (
    <section className="card status-card" aria-label="Stav klubu">
      <div className="card-head">
        <h2><Icon name="pulse" size={18} /> Stav klubu</h2>
      </div>
      <div className="status-tiles">
        {tiles.map((t) => (
          <button key={t.key} className={`status-tile tone-${t.tone}${open === t.key ? ' open' : ''}`} aria-expanded={open === t.key} onClick={() => setOpen(open === t.key ? null : t.key)}>
            <span className="st-label"><Icon name={t.icon} size={15} /> {t.label}</span>
            <span className={`st-value num${t.value.length > 7 ? ' long' : ''}`}>{t.value}</span>
            <span className="st-sub">{t.sub}</span>
            <span className="st-trend">
              <Trend value={t.trend} title={t.trendTitle} />
              {t.trendText && <span className={`small ${t.trend > 0 ? 'pos' : t.trend < 0 ? 'neg' : 'muted'}`}> {t.trendText}</span>}
            </span>
          </button>
        ))}
      </div>
      {detail && (
        <div className="status-detail" role="region" aria-label={`Důvody: ${detail.label}`}>
          {detail.rows && (
            <dl className="kv meters status-rows">
              {detail.rows.map((r) => (
                <div key={r.label} className="status-row">
                  <dt>{r.label}</dt>
                  <dd><Meter value={r.value} /> <span className="num">{r.value}</span></dd>
                </div>
              ))}
            </dl>
          )}
          {detail.reasons.length ? (
            <ul className="plain small status-reasons">
              {detail.reasons.map((r, i) => (
                <li key={i}>
                  {r.delta !== undefined && <span className={r.delta > 0 ? 'pos' : 'neg'}>{r.delta > 0 ? '+' : '−'}{Math.abs(Math.round(r.delta))} </span>}
                  {r.date && <span className="muted">{formatShortDate(r.date)} </span>}
                  {r.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Za poslední týdny beze změn.</p>
          )}
          <button className="linkbtn" onClick={() => onNavigate(detail.link)}>Podrobnosti ›</button>
        </div>
      )}
    </section>
  );
}
