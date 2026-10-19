import type { JSX } from 'preact';
import { Button } from '../components/Button.js';
import { costLabel, tokensLabel } from '../lib/live-run/format.js';
import { endFactsOf } from '../lib/live-run/end-facts.js';
import { PlanNext } from './PlanNext.js';
import type { RunState } from '../lib/live-run/run-state.js';
import { DeepenAction } from './DeepenAction.js';
import type { AnswersLoad } from './use-run-answers.js';

// RF-1015, RF-1017, RF-614, DEC-137, design-system.md section 14: the "Your turn" panel of an ended run:
// how many questions wait for the user and the way to them, the way on to the plan (PlanNext) and the facts of the run. A run that
// failed says so and points to the failure above; a run with nothing to answer says that. All the
// styles are under `.rst-p170-`.

export interface YourTurnProps {
  readonly state: RunState;
  readonly costMicros: number;
  /** The run ended with an error. */
  readonly failed: boolean;
  /** An understand run is the only one that asks questions. */
  readonly asks: boolean;
  readonly answers: AnswersLoad;
  readonly onAnswer: () => void;
  /** RF-614: the run and its project, to open Plan setup for this run. */
  readonly run: { readonly id: string; readonly projectId: string };
  /** RF-209: the id of the run, when it ended Completed and can be deepened. */
  readonly deepenRunId?: string | undefined;
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

function Next(props: YourTurnProps): JSX.Element {
  const { answers } = props;
  if (props.failed) {
    return (
      <p>
        This run did not finish. What failed and what to do is shown above the tabs; the evidence
        and the activity of the run are still here.
      </p>
    );
  }
  if (!props.asks) return <p>The run has ended. Its report and downloads are below.</p>;
  if (answers.status === 'failed') {
    return <p>The open questions could not be read. The Your questions tab shows why.</p>;
  }
  if (answers.status !== 'ready') return <p>Loading the open questions.</p>;
  const open = answers.questions.filter((each) => each.state === 'Open').length;
  if (open === 0)
    return <p>This run has no questions for you. Its report and downloads are below.</p>;
  return (
    <>
      <p>
        {plural(open, 'question')} the code cannot answer. Your answers improve the next run; a
        skipped question keeps its default.
      </p>
      <Button variant="primary" onClick={props.onAnswer}>
        {`Answer ${plural(open, 'question')}`}
      </Button>
    </>
  );
}

function Fact(props: { readonly label: string; readonly value: string }): JSX.Element {
  return (
    <li class="rst-p170-fact">
      <b>{props.value}</b>
      <span>{props.label}</span>
    </li>
  );
}

/** Questions are open when the answers are read and at least one waits. */
function questionsOpen(answers: AnswersLoad): boolean {
  return answers.status === 'ready' && answers.questions.some((each) => each.state === 'Open');
}

// RF-1015, RF-614
export function YourTurn(props: YourTurnProps): JSX.Element {
  const facts = endFactsOf(props.state);
  const { run, state } = props;
  return (
    <section class="rst-card rst-p170-turn" aria-label="Your turn">
      <h2 class="rst-live-section__title">Your turn</h2>
      <Next {...props} />
      {props.deepenRunId === undefined ? null : <DeepenAction runId={props.deepenRunId} />}
      {props.asks || props.failed ? (
        <PlanNext
          {...{ runId: run.id, projectId: run.projectId }}
          {...{ endState: state.ended?.endState ?? '', supportedClaims: facts.supportedClaims }}
          questionsOpen={questionsOpen(props.answers)}
        />
      ) : null}
      <ul class="rst-p170-facts" aria-label="Run facts">
        <Fact label="Cards" value={String(facts.cards)} />
        <Fact
          label="Citations passed"
          value={`${String(facts.citationsPassed)} / ${String(facts.claims)}`}
        />
        <Fact label="Areas read" value={`${String(facts.areasRead)} / ${String(facts.areas)}`} />
        <Fact label="Cost" value={costLabel(props.costMicros)} />
        <Fact label="Tokens" value={tokensLabel(facts.tokens)} />
      </ul>
    </section>
  );
}
