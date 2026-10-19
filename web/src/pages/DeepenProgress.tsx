import type { JSX } from 'preact';
import { Glyph, type GlyphName } from '../components/Glyph.js';
import type { DeepenProgress as Progress, DeepenRoundState } from '../lib/live-run/run-state.js';
import { countText, stopText } from '../lib/understanding/measure-text.js';

// RF-209, RF-1002: where a Deepen run stands, from its `deepen.*` events: the cards it started from,
// each round as it runs, ends or is cut short by a cap or a Stop, and why it stopped. The same
// events reach the live page, a reload and the replay, so they show the same. Each round says its
// state in words with a glyph, never by colour alone. All the styles are under `.rst-p241-`.

const glyphs: Readonly<Record<DeepenRoundState['status'], GlyphName>> = {
  running: 'live-dot',
  done: 'check',
  cut: 'dashed-circle',
};

function roundText(round: DeepenRoundState, maxRounds: number): string {
  const head = `Round ${String(round.round)} of ${String(maxRounds)}`;
  if (round.status === 'running') {
    return `${head}, running: judging ${countText(round.judge)} claims, re-reading ${countText(round.reread)}, ${countText(round.unreadFiles)} unread files to read.`;
  }
  if (round.status === 'cut') return `${head}, cut short by a cap or by Stop.`;
  return `${head}, done: ${countText(round.newClaims)} new claims, ${countText(round.newSupported)} supported, ${countText(round.filesRead)} files read.`;
}

function Round(props: { readonly round: DeepenRoundState; readonly maxRounds: number }) {
  const { round, maxRounds } = props;
  return (
    <li class="rst-p241-round" data-testid={`deepen-round-${String(round.round)}`}>
      <Glyph name={glyphs[round.status]} />
      <span>{roundText(round, maxRounds)}</span>
    </li>
  );
}

// RF-209
export function DeepenProgress(props: { readonly progress: Progress }): JSX.Element {
  const { progress } = props;
  const { seeded, rounds, maxRounds, stop } = progress;
  const done = rounds.filter((round) => round.status === 'done').length;
  return (
    <section class="rst-card rst-p241-progress" aria-label="Deepen progress">
      <h2 class="rst-live-section__title">{`Deepen of run ${progress.parentRunKey}`}</h2>
      <p data-testid="deepen-seeded">
        {`Started from ${countText(seeded.cards)} cards and ${countText(seeded.claims)} claims: ${countText(seeded.supported)} supported, ${countText(seeded.rejected)} rejected, ${countText(seeded.notJudged)} not judged.`}
      </p>
      <progress
        class="rst-p241-bar"
        max={maxRounds}
        value={Math.min(done, maxRounds)}
        aria-label="Rounds done"
      />
      <ol class="rst-p241-rounds" aria-label="Rounds">
        {rounds.map((round) => (
          <Round key={round.round} round={round} maxRounds={maxRounds} />
        ))}
      </ol>
      {stop === undefined ? null : (
        <p data-testid="deepen-progress-stop">
          {stopText(stop.reason, stop.roundsDone, maxRounds)}
        </p>
      )}
    </section>
  );
}
