import type { JSX } from 'preact';
import type { OpenQuestionRow } from '../api/answers.js';
import { RenderedText } from '../components/RenderedText.js';

// RF-1017, RF-646: what the open-question list says under a question: why the code cannot answer it,
// what depends on it, what skipping does, and where the question was raised before.

// RF-1017
function dependsText(dependents: number): string {
  if (dependents === 0) return 'No other item depends on it.';
  return `Affects ${String(dependents)} ${dependents === 1 ? 'item' : 'items'} of the specification.`;
}

/** RF-1017: where the question comes from, what hangs on it and what a skipped question does. */
export function Reasons({ question }: { readonly question: OpenQuestionRow }): JSX.Element {
  return (
    <>
      <p class="rst-p139-question__context" data-testid="question-why">
        <span class="rst-p170-label">Why the code cannot say:</span>{' '}
        <RenderedText text={question.context} />
      </p>
      <p class="rst-p139-question__context" data-testid="question-depends">
        {dependsText(question.dependents)}
      </p>
      <p class="rst-p139-question__context" data-testid="question-default">
        If you skip it: the question stays open in answers.md and the next run does not use it.
      </p>
    </>
  );
}

/** RF-646: a question raised in several runs says so; the older answers it replaced are kept and shown. */
export function Earlier({ question }: { readonly question: OpenQuestionRow }): JSX.Element | null {
  const runs = question.runs?.length ?? 0;
  const history = question.history ?? [];
  if (runs < 2 && history.length === 0) return null;
  return (
    <div class="rst-p139-question__context" data-testid="question-earlier">
      {runs < 2 ? null : (
        <p>{`Asked in ${String(runs)} runs of this project; it is listed once.`}</p>
      )}
      {history.length === 0 ? null : (
        <>
          <p>Earlier answers, kept in answers.md:</p>
          <ul>
            {history.map((each) => (
              <li key={[each.runKey, each.answer].join('\n')}>
                <RenderedText text={each.answer} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
