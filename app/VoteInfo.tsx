import type { VotePreview } from '../engine';

/** Odhad hlasování spolumajitelů: kdo by byl pro a jestli to projde. */
export function VoteInfo({ vote }: { vote: VotePreview }) {
  if (!vote.needed) return null;
  return (
    <div className={`vote ${vote.passes ? 'vote-ok' : 'vote-no'}`}>
      <strong>
        Hlasování akcionářů: {vote.passes ? 'projde' : 'neprojde'} · pro {Math.round(vote.yes * 100)} %, potřeba víc než {Math.round(vote.threshold * 100)} %
      </strong>
      <span className="vote-list">
        {vote.votes.map((v) => (
          <span key={v.name} className={v.yes ? 'yes' : 'no'}>
            {v.yes ? '✓' : '✗'} {v.name} {Math.round(v.share * 100)} %
          </span>
        ))}
      </span>
    </div>
  );
}
