import type { JSX } from 'preact';
import { RunAnswers } from '../../../web/src/pages/RunAnswers.js';
import { useRunAnswers } from '../../../web/src/pages/use-run-answers.js';

// The open questions of a run as the page of an ended run hands them over (P1-170): the page reads
// the questions once, counts them in its "Your turn" panel and passes them to the list.

export function AnswersHarness(props: {
  readonly runId: string;
  readonly ended: boolean;
}): JSX.Element {
  const answers = useRunAnswers(props.runId, props.ended);
  return <RunAnswers runId={props.runId} answers={answers} />;
}
