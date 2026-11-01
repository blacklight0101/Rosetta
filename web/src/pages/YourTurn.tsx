import type { JSX } from 'preact';
import { waitsForAnswer } from '../api/answers.js';
import { Button } from '../components/Button.js';
import { costLabel, tokensLabel } from '../lib/live-run/format.js';
import { endFactsOf } from '../lib/live-run/end-facts.js';
import { PlanNext, type CapLeft } from './PlanNext.js';
import { overviewEstimateText } from '../lib/live-run/overview-estimate.js';
import { ResumeButton } from './ResumeButton.js';
import type { OverviewLoad } from './use-run-overview.js';
import type { RunState } from '../lib/live-run/run-state.js';
import { DeepenAction } from './DeepenAction.js';
import type { AnswersLoad } from './use-run-answers.js';
import { useSkipDeepen, type SkipDeepen } from './use-skip-deepen.js';

type AnswersLoadReady = Extract<AnswersLoad, { readonly status: 'ready' }>;

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
  /** P7-26: the overview of the run, for the "Write the overview" action of a capped run. */
  readonly overview?: OverviewLoad | undefined;
  readonly onResumed?: (() => void) | undefined;
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

/** DEC-154: nothing waits; the answers saved so far are said, so the user knows what to do next. */
function NoneWaiting(props: { readonly answers: AnswersLoadReady['questions'] }): JSX.Element {
  const saved = props.answers.filter((each) => each.state === 'Open').length;
  if (saved === 0) {
    return <p>This run has no questions for you. Its report and downloads are below.</p>;
  }
  return (
    <p>
      {`Every question has a saved answer (${String(saved)}). The next run uses your answers; set up the plan to go on.`}
    </p>
  );
}

/**
 * RF-646, DEC-179: Deepen is recommended before answering when the run can be deepened and no Deepen
 * has been made of it: a Deepen uses the answers given before it. Once the last Deepen has ended, or
 * when the user chose not to Deepen, the questions are asked.
 */
function recommendsDeepen(props: Pick<YourTurnProps, 'answers' | 'deepenRunId'>): boolean {
  const { answers } = props;
  return (
    props.deepenRunId !== undefined &&
    answers.status === 'ready' &&
    !answers.isDeepen &&
    answers.deepens === 0 &&
    !answers.deepening
  );
}

/** P6-19, RF-646: a Deepen of the run is queued or running, so it is not the time to say "Deepen first". */
function deepenIsRunning(props: Pick<YourTurnProps, 'answers' | 'deepenRunId'>): boolean {
  const { answers } = props;
  return (
    props.deepenRunId !== undefined &&
    answers.status === 'ready' &&
    !answers.isDeepen &&
    answers.deepening
  );
}

/** P6-19: a Deepen is running; the questions are asked after it, or at once when the user skips it. */
function DeepenRunning(props: { readonly open: number; readonly skip: SkipDeepen }): JSX.Element {
  const { open, skip } = props;
  return (
    <>
      <p data-testid="deepen-running">
        {`A Deepen is running. The ${plural(open, 'question')} below are asked after it ends, so a question you answer now is not asked again. You can still answer earlier from the Your questions tab.`}
      </p>
      <Button
        variant="secondary"
        onClick={() => {
          skip.choose(true);
        }}
      >
        Do not wait: answer the questions now
      </Button>
    </>
  );
}

/** RF-646: Deepen first; the questions are asked after it, or at once when the user skips it. */
function DeepenFirst(props: { readonly open: number; readonly skip: SkipDeepen }): JSX.Element {
  const { open, skip } = props;
  return (
    <>
      <p data-testid="deepen-first">
        {`Deepen this run first. A Deepen uses the answers given before it, so the ${plural(open, 'question')} below are asked after the last Deepen and a question you answer now is not asked again. You can still answer earlier from the Your questions tab.`}
      </p>
      <Button
        variant="secondary"
        onClick={() => {
          skip.choose(true);
        }}
      >
        Do not Deepen: answer the questions now
      </Button>
    </>
  );
}

/** RF-646, P6-19: the note for a Deepen that is recommended or running, unless the user skipped it. */
function Waiting(
  props: YourTurnProps & { readonly skip: SkipDeepen },
  open: number,
): JSX.Element | undefined {
  if (props.skip.skipped) return undefined;
  if (deepenIsRunning(props)) return <DeepenRunning open={open} skip={props.skip} />;
  return recommendsDeepen(props) ? <DeepenFirst open={open} skip={props.skip} /> : undefined;
}

/** What the panel says before the open questions are known; undefined once they are. */
function Before(props: YourTurnProps): JSX.Element | undefined {
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
  return undefined;
}

function Next(props: YourTurnProps & { readonly skip: SkipDeepen }): JSX.Element {
  const { answers } = props;
  const before = Before(props);
  if (before !== undefined || answers.status !== 'ready') return before ?? <></>;
  const open = answers.questions.filter(waitsForAnswer).length;
  if (open === 0) return <NoneWaiting answers={answers.questions} />;
  const waiting = Waiting(props, open);
  if (waiting !== undefined) return waiting;
  return (
    <>
      <p>
        {plural(open, 'question')} the code cannot answer. Your answers improve the next run; a
        skipped question keeps its default.
      </p>
      <Button variant="primary" onClick={props.onAnswer}>
        {`Answer ${plural(open, 'question')}`}
      </Button>
      {props.skip.skipped && recommendsDeepen(props) ? (
        <Button
          variant="ghost"
          onClick={() => {
            props.skip.choose(false);
          }}
        >
          Deepen first after all
        </Button>
      ) : null}
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
  return answers.status === 'ready' && answers.questions.some(waitsForAnswer);
}

type Facts = ReturnType<typeof endFactsOf>;

/** P7-26: what a run that ended on its cap left undone. */
function leftOf(props: YourTurnProps, facts: Facts): CapLeft {
  const { overview } = props;
  const read = overview?.status === 'ready';
  const written = read && overview.overview?.state !== 'unavailable';
  return {
    unreadAreas: props.state.ended?.unreadAreas ?? 0,
    unjudgedClaims: props.state.claims.filter((claim) => claim.status === 'Unverified').length,
    overviewMissing: read && !written && facts.cards > 0,
  };
}

/** P7-26: the action that writes the overview of a capped run whose overview call was refused. */
function WriteOverview(props: YourTurnProps & { readonly facts: Facts }): JSX.Element {
  const estimate = overviewEstimateText({ ...props.facts, costMicros: props.costMicros });
  return (
    <>
      <p>{`Writing the overview costs ${estimate}.`}</p>
      <ResumeButton
        runId={props.run.id}
        label="Write the overview"
        overviewOnly
        onResumed={props.onResumed ?? (() => undefined)}
      />
    </>
  );
}

// RF-1015, RF-614
export function YourTurn(props: YourTurnProps): JSX.Element {
  const facts = endFactsOf(props.state);
  const { run, state } = props;
  const skip = useSkipDeepen(run.id);
  const deepenFirst = recommendsDeepen(props) && !skip.skipped && questionsOpen(props.answers);
  return (
    <section class="rst-card rst-p170-turn" aria-label="Your turn">
      <h2 class="rst-live-section__title">Your turn</h2>
      <Next {...props} skip={skip} />
      {props.deepenRunId === undefined ? null : (
        <DeepenAction runId={props.deepenRunId} recommended={deepenFirst} />
      )}
      {props.asks || props.failed ? (
        <PlanNext
          {...{ runId: run.id, projectId: run.projectId }}
          {...{ endState: state.ended?.endState ?? '', supportedClaims: facts.supportedClaims }}
          questionsOpen={questionsOpen(props.answers) && !deepenFirst}
          left={leftOf(props, facts)}
          writeOverview={
            leftOf(props, facts).overviewMissing ? (
              <WriteOverview {...props} facts={facts} />
            ) : undefined
          }
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
