import type { JSX } from 'preact';
import { waitsForAnswer } from '../api/answers.js';
import { MoneyAmount } from '../components/MoneyAmount.js';
import { tokensLabel } from '../lib/live-run/format.js';
import { endFactsOf } from '../lib/live-run/end-facts.js';
import { primaryPlaceOf } from '../lib/live-run/primary-place.js';
import { PlanNext, type CapLeft } from './PlanNext.js';
import { PlanTurn } from './PlanTurn.js';
import { overviewEstimateText } from '../lib/live-run/overview-estimate.js';
import { ResumeButton } from './ResumeButton.js';
import type { OverviewLoad } from './use-run-overview.js';
import type { RunState } from '../lib/live-run/run-state.js';
import type { AreaReading } from '../lib/understanding/area-read.js';
import { DeepenAction } from './DeepenAction.js';
import { Fact, RunFacts } from './RunFacts.js';
import type { AnswersLoad } from './use-run-answers.js';
import { useSkipDeepen, type SkipDeepen } from './use-skip-deepen.js';
import {
  DeepenNote,
  TurnLinks,
  belowTheBar,
  turnTitles,
  type Covered,
  type TurnStep,
} from './TurnPaths.js';

type AnswersLoadReady = Extract<AnswersLoad, { readonly status: 'ready' }>;

// RF-1015, RF-1017, RF-614, RF-1021, DEC-137, design-system.md section 14: the "Your turn" panel of an
// ended run: one primary button for the next step (Deepen while the run read code below the coverage
// bar, else Set up the plan, P8-84) with the other paths as links under it (TurnPaths), how many
// questions wait for the user, the way on to the plan (PlanNext) and the facts of the run. A run that
// failed says so and points to the failure above; a run with nothing to answer says that. All the
// styles are under `.rst-p170-`.

export interface YourTurnProps {
  readonly state: RunState;
  readonly costMicros: number;
  /** P8-93: what the run's coverage says of the areas read. */
  readonly reading?: AreaReading | undefined;
  /** RF-231, P8-84: the measures of the run, for what the readers covered; none until read. */
  readonly measures?: Covered | null | undefined;
  /** The run ended with an error. */
  readonly failed: boolean;
  /** An understand run is the only one that asks questions. */
  readonly asks: boolean;
  readonly answers: AnswersLoad;
  readonly onAnswer: () => void;
  /** RF-614: the run and its project, to open Plan setup for this run. */
  readonly run: {
    readonly id: string;
    readonly projectId: string;
    readonly sourceRunId?: string | null | undefined;
  };
  /** RF-1015: a plan run has its own next action and only plan figures. */
  readonly stage?: string | undefined;
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
  // P8-27: the tab counts the questions that wait (none here), so the panel says the same first.
  return (
    <p>
      {`No question waits for you; ${String(saved)} ${saved === 1 ? 'has' : 'have'} a saved answer. The next run uses ${saved === 1 ? 'it' : 'them'}; set up the plan to go on.`}
    </p>
  );
}

/**
 * RF-646, DEC-179: Deepen is recommended before answering when the run can be deepened and no Deepen
 * has been made of it: a Deepen uses the answers given before it. Once the last Deepen has ended, or
 * when the user chose not to Deepen, the questions are asked. RF-1021 (P8-84): Deepen is the primary
 * button only while the run read code below the coverage bar.
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

/** P6-19, RF-1017: a Deepen is running; the questions are asked after it. */
function DeepenRunning(props: { readonly open: number }): JSX.Element {
  return (
    <p data-testid="deepen-running">
      {`A Deepen is running. The ${plural(props.open, 'question')} below are asked after it ends, so a question you answer now is not asked again. You can still answer earlier from the Your questions tab.`}
    </p>
  );
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

type TurnProps = YourTurnProps & { readonly skip: SkipDeepen; readonly step: TurnStep };

/** RF-1017, RF-1021: what the panel says above its one primary button. */
function Next(props: TurnProps): JSX.Element {
  const { answers } = props;
  const before = Before(props);
  if (before !== undefined || answers.status !== 'ready') return before ?? <></>;
  if (props.step === 'deepen') return <DeepenNote measures={props.measures} />;
  const open = answers.questions.filter(waitsForAnswer).length;
  if (open === 0) return <NoneWaiting answers={answers.questions} />;
  if (!props.skip.skipped && deepenIsRunning(props)) return <DeepenRunning open={open} />;
  return (
    <p>
      {plural(open, 'question')} the code cannot answer. Your answers improve the next run; a
      skipped question keeps its default.
    </p>
  );
}

/** RF-1015 (P7-25): the "Your turn" panel of a plan run: its own next action and plan figures only. */
function PlanTurnPanel(props: YourTurnProps): JSX.Element {
  const facts = endFactsOf(props.state);
  return (
    <section class="rst-card rst-p170-turn" aria-label="Your turn">
      <h2 class="rst-live-section__title">Your turn</h2>
      <PlanTurn
        {...{ projectId: props.run.projectId, runId: props.run.id, ended: props.state.ended }}
        sourceRunId={props.run.sourceRunId}
      />
      <ul class="rst-p170-facts" aria-label="Run facts">
        <Fact label="Cost" value={<MoneyAmount micros={props.costMicros} tabStop />} />
        <Fact label="Tokens" value={tokensLabel(facts.tokens)} />
      </ul>
    </section>
  );
}

type Facts = ReturnType<typeof endFactsOf>;

/** P7-26: what a run that ended on its cap left undone. */
function leftOf(props: YourTurnProps, facts: Facts): CapLeft {
  const { overview } = props;
  const read = overview?.status === 'ready';
  const written = read && overview.overview?.state !== 'unavailable';
  return {
    unreadAreas: props.state.ended?.unreadAreas ?? 0,
    // P8-12: one definition with the server's `unjudgedIn`: a claim a cap left Unverified or never judged.
    unjudgedClaims: props.state.claims.filter(
      (claim) => claim.status === 'Unverified' || claim.status === 'Proposed',
    ).length,
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
        variant="secondary"
        onResumed={props.onResumed ?? (() => undefined)}
      />
    </>
  );
}

/** P7-26: the Write the overview action, only when the overview is missing. */
function writeOverviewOf(props: YourTurnProps, facts: Facts): JSX.Element | undefined {
  return leftOf(props, facts).overviewMissing ? (
    <WriteOverview {...props} facts={facts} />
  ) : undefined;
}

/**
 * RF-1021 (P8-84): the step of the one primary button. Only a run that completed with a Supported
 * claim has one here; a run that stopped is resumed first (Resume in the page head), so the panel
 * offers its plan and its Deepen as links.
 */
function stepOf(props: YourTurnProps, skip: SkipDeepen): TurnStep {
  const facts = endFactsOf(props.state);
  if (primaryPlaceOf(props.state.ended?.endState, facts.supportedClaims) !== 'turn') return 'none';
  if (recommendsDeepen(props) && !skip.skipped && belowTheBar(props.reading)) return 'deepen';
  return plannable(props) ? 'plan' : 'none';
}

/** RF-614, P3-121: the panel offers Set up the plan (PlanNext shows it). */
function plannable(props: YourTurnProps): boolean {
  const endState = props.state.ended?.endState;
  const ended = endState === 'Completed' || endState === 'CapReached';
  return (props.asks || props.failed) && ended && endFactsOf(props.state).supportedClaims > 0;
}

/** The questions that wait for an answer; 0 until they are read. */
function openCount(answers: AnswersLoad): number {
  return answers.status === 'ready' ? answers.questions.filter(waitsForAnswer).length : 0;
}

/** RF-1021: the paths under the primary button. */
function Paths(props: TurnProps): JSX.Element {
  const { run } = props;
  const deepenLink = props.deepenRunId !== undefined && !deepenIsRunning(props);
  return (
    <TurnLinks
      {...{ step: props.step, skip: props.skip, onAnswer: props.onAnswer }}
      open={props.asks ? openCount(props.answers) : 0}
      run={{ id: run.id, projectId: run.projectId }}
      plannable={plannable(props)}
      deepenRunId={deepenLink ? props.deepenRunId : undefined}
    />
  );
}

// RF-1015, RF-614, RF-1021
export function YourTurn(props: YourTurnProps): JSX.Element {
  const facts = endFactsOf(props.state);
  const { run, state } = props;
  const skip = useSkipDeepen(run.id);
  if (props.stage === 'plan') return <PlanTurnPanel {...props} />;
  const step = stepOf(props, skip);
  return (
    <section class="rst-card rst-p170-turn" aria-label="Your turn">
      <h2 class="rst-live-section__title">{turnTitles[step]}</h2>
      <Next {...props} skip={skip} step={step} />
      {step === 'deepen' && props.deepenRunId !== undefined ? (
        <DeepenAction runId={props.deepenRunId} projectId={run.projectId} look="primary" />
      ) : null}
      {props.asks || props.failed ? (
        <PlanNext
          {...{ runId: run.id, projectId: run.projectId }}
          {...{ endState: state.ended?.endState ?? '', endReason: state.ended?.endReason }}
          supportedClaims={facts.supportedClaims}
          setUp={step === 'plan'}
          left={leftOf(props, facts)}
          writeOverview={writeOverviewOf(props, facts)}
        />
      ) : null}
      <Paths {...props} skip={skip} step={step} />
      <RunFacts facts={facts} costMicros={props.costMicros} state={state} reading={props.reading} />
    </section>
  );
}
