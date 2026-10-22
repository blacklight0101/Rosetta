import { countText } from '../understanding/measure-text.js';
import type { DeepenRoundState } from './run-state.js';

// RF-209, RNF-010: the line of one round of a Deepen run, in plain words. Every count agrees in
// number ("1 file read"), and a count of nothing reads as "no ..." instead of "0 ...".

const count = (n: number, one: string, many: string): string =>
  `${countText(n)} ${n === 1 ? one : many}`;

/** What a running round does: judge claims, re-read the rejected ones, read files never read. */
function runningParts(round: DeepenRoundState): readonly string[] {
  const { judge, reread, unreadFiles, failedAreas } = round;
  const failed =
    failedAreas.length === 0
      ? []
      : [
          `re-reading ${count(failedAreas.length, 'failed area', 'failed areas')} (${failedAreas.join(', ')})`,
        ];
  return [
    `judging ${count(judge, 'claim', 'claims')}`,
    reread === 0
      ? 'no rejected claims to re-read'
      : `re-reading ${count(reread, 'rejected claim', 'rejected claims')}`,
    unreadFiles === 0
      ? 'no unread files to read'
      : `reading ${count(unreadFiles, 'unread file', 'unread files')}`,
    ...failed,
  ];
}

// RF-209
export function roundText(round: DeepenRoundState, maxRounds: number): string {
  const head = `Round ${String(round.round)} of ${String(maxRounds)}`;
  if (round.status === 'running') return `${head}, running: ${runningParts(round).join(', ')}.`;
  if (round.status === 'cut') return `${head}, cut short by a cap or by Stop.`;
  const { newClaims, newSupported, filesRead } = round;
  const parts = [
    count(newClaims, 'new claim', 'new claims'),
    `${countText(newSupported)} supported`,
    `${count(filesRead, 'file', 'files')} read`,
  ];
  return `${head}, done: ${parts.join(', ')}.`;
}
