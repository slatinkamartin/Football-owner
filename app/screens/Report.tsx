import type { ReactNode } from 'react';
import { ratingText, type SeasonReport } from '../../engine';
import { Badge } from '../components';
import { money } from '../format';

/** Výroční zpráva sezóny. */
export function SeasonReportView({ report, onClose, children }: { report: SeasonReport; onClose: () => void; children?: ReactNode }) {
  const label = `${report.season}/${String(report.season + 1).slice(2)}`;
  return (
    <div className="overlay sheet-overlay" onClick={onClose}>
      <div className="card dialog report" role="dialog" aria-modal="true" aria-label={`Výroční zpráva ${label}`} onClick={(e) => e.stopPropagation()}>
        <span className="muted small">Výroční zpráva · {report.clubName}</span>
        <h2>Sezóna {label}: {report.position}. místo ({report.competition})</h2>
        <p>
          Cíl: {report.goalText} <Badge tone={report.goalMet ? 'good' : 'bad'}>{report.goalMet ? 'splněn' : 'nesplněn'}</Badge>
          {report.grade && <> · finanční vysvědčení <Badge tone={report.grade <= 'B' ? 'good' : report.grade >= 'E' ? 'bad' : 'neutral'}>{report.grade}</Badge></>}
        </p>
        <div className="report-grid">
          <div className="pc-big">
            <span className="muted small">Hráč sezóny</span>
            <strong>{report.bestPlayer ? `${report.bestPlayer.name} (${ratingText(report.bestPlayer.rating)})` : '–'}</strong>
          </div>
          <div className="pc-big">
            <span className="muted small">Nejlepší střelec</span>
            <strong>{report.topScorer ? `${report.topScorer.name} (${report.topScorer.goals})` : '–'}</strong>
          </div>
          <div className="pc-big">
            <span className="muted small">Provozní výsledek</span>
            <strong className={report.operating < 0 ? 'neg' : 'pos'}>{money(report.operating)}</strong>
          </div>
          <div className="pc-big">
            <span className="muted small">Peníze na konci</span>
            <strong className={report.balance < 0 ? 'neg' : ''}>{money(report.balance)}</strong>
          </div>
        </div>
        {(report.best || report.worst) && (
          <>
            <h3>Rozhodnutí majitele</h3>
            <ul className="plain small">
              {report.best && <li><span className="pos">Nejlepší:</span> {report.best}</li>}
              {report.worst && <li><span className="neg">Nejhorší:</span> {report.worst}</li>}
            </ul>
          </>
        )}
        {report.moments.length > 0 && (
          <>
            <h3>Zlomové okamžiky</h3>
            <ul className="plain small">{report.moments.map((m, i) => <li key={i}>• {m}</li>)}</ul>
          </>
        )}
        {report.sideGoals.length > 0 && (
          <>
            <h3>Vedlejší cíle</h3>
            <ul className="plain small">{report.sideGoals.map((m, i) => <li key={i}>• {m}</li>)}</ul>
          </>
        )}
        {report.trophies.length > 0 && (
          <>
            <h3>Do síně slávy</h3>
            <ul className="plain small">{report.trophies.map((m, i) => <li key={i}>🏆 {m}</li>)}</ul>
          </>
        )}
        {children}
        <button className="primary" autoFocus onClick={onClose}>Pokračovat do nové sezóny</button>
      </div>
    </div>
  );
}
