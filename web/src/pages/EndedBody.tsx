import type { JSX } from 'preact';
import { mayDeepen } from '../lib/live-run/may-deepen.js';
import { useContext, useEffect, useState } from 'preact/hooks';
import type { RunEstimate } from '../api/estimate-schemas.js';
import { reportFilePath } from '../api/runs.js';
import type { RunRow } from '../api/run-schemas.js';
import { Rail, openQuestions } from './EndedRail.js';
import { Tabs } from '../components/Tabs.js';
import { endFactsOf } from '../lib/live-run/end-facts.js';
import { primaryPlaceOf } from '../lib/live-run/primary-place.js';
import type { RunPhase } from '../lib/live-run/run-phase.js';
import type { RunState, SourceState } from '../lib/live-run/run-state.js';
import { stepperOf } from '../lib/live-run/run-stepper.js';
import { endedTabsOf } from './ended-tabs.js';
import { ActivityTab } from './ActivityTab.js';
import { AreaReadContext } from './area-read-context.js';
import { AppOverview, sectionAnchor } from './AppOverview.js';
import { DeepenProgress } from './DeepenProgress.js';
import { EvidenceTab } from './EvidenceTab.js';
import { UnderstandJourney } from './JourneyPlacement.js';
import { FailedAreas } from './FailedAreas.js';
import { PlanCalls } from './PlanCalls.js';
import { RetryNotice } from './RetryNotice.js';

import { RunAnswers } from './RunAnswers.js';
import { RunFailure } from './RunFailure.js';
import { RunStepper } from './RunStepper.js';
import { ScanResult } from './ScanResult.js';
import { belowTheBar } from './TurnPaths.js';
import { useQuestionsFocus, type FocusRequest } from './use-focus-first-question.js';
import { useRunAnswers, type RunAnswersState } from './use-run-answers.js';
import { useRunOverview, type OverviewLoad } from './use-run-overview.js';
import type { UnderstandingLoad } from './use-understanding.js';
import { UnderstandingSummary } from './UnderstandingSummary.js';
import { VerificationNote } from './VerificationNote.js';

// RF-1015, RF-1017, RF-264, RF-1007, DEC-137, design-system.md section 14, proposal
// `docs/design/proposals/run-page-v2.html`: the page of a run that has ended, "after the run" mode.
// The overview comes first, then Your questions, Evidence (cards, claims, coverage, code map) and
// Activity (events, calls, logs, replay) in tabs, with the "Your turn" panel and the report and
// downloads beside them. A run that failed has no overview and no questions: the page says what
// failed and what to do. A run that is not an understand run has no overview or questions either.
// All the styles are under `.rst-p170-`.

export interface EndedBodyProps {
  readonly run: RunRow;
  /** The live state, for the figures. */
  readonly state: RunState;
  /** What the panels show: the live state, or the one frozen by Pause updates. */
  readonly shown: RunState;
  readonly phase: RunPhase;
  readonly stage: string;
  readonly costMicros: number;
  readonly estimate: RunEstimate | undefined;
  /** RF-231, P8-93: the understanding of the run, read once for the head and the overview. */
  readonly understanding: UnderstandingLoad;
  readonly source: SourceState | undefined;
  /** RF-006: called once the server has queued the run again; the page follows it anew. */
  readonly onResumed: () => void;
}

const tabIds = ['overview', 'questions', 'evidence', 'activity', 'calls'] as const;
type TabId = (typeof tabIds)[number];

const tabOf = (id: string): TabId => tabIds.find((each) => each === id) ?? 'evidence';

/** RF-131: a report built from this page counts for the links of an uploaded project at once. */
function reportSeen(source: SourceState | undefined, built: boolean): SourceState | undefined {
  return source?.kind === 'upload' && built ? { ...source, reportBuilt: true } : source;
}

/** RF-504, P1-130: whether the run has a report; one built from this page counts at once. */
function useReportBuilt(run: RunRow): { readonly built: boolean; readonly onBuilt: () => void } {
  const [builtHere, setBuiltHere] = useState(false);
  return {
    built: run.reportBuilt || builtHere,
    onBuilt: () => {
      setBuiltHere(true);
    },
  };
}

/** RF-1015: the replay is written with the report, so it is linked once the report exists. */
function Replay({
  runId,
  built,
}: {
  readonly runId: string;
  readonly built: boolean;
}): JSX.Element {
  return (
    <p class="rst-settings__note" data-testid="replay-note">
      {built ? (
        <a href={reportFilePath(runId, 'replay.html')}>Watch the replay of this run</a>
      ) : (
        'The run replay is written with the report. Build the report to get it.'
      )}
    </p>
  );
}

interface ResultsTab {
  readonly tab: TabId;
  readonly select: (id: string) => void;
  /** Opens the overview on the section with this anchor (a question links to the section it concerns). */
  readonly showSection: (anchor: string) => void;
  readonly show: (id: TabId) => void;
}

/** The tab that is open: the overview first for a run that asks, the evidence otherwise. */
function useResultsTab(asks: boolean, stage: string): ResultsTab {
  const first = stage === 'plan' ? 'calls' : 'evidence';
  const [chosen, setChosen] = useState<TabId>(asks ? 'overview' : first);
  const [anchor, setAnchor] = useState<string | undefined>();
  // The run may turn out to have failed after the page opened on the overview (its events replay).
  const tab = asks || (chosen !== 'overview' && chosen !== 'questions') ? chosen : first;
  useEffect(() => {
    if (tab !== 'overview' || anchor === undefined) return;
    const target = document.getElementById(anchor);
    if (typeof target?.scrollIntoView === 'function') target.scrollIntoView();
  }, [tab, anchor]);
  return {
    tab,
    select: (id) => {
      setChosen(tabOf(id));
    },
    show: setChosen,
    showSection: (id) => {
      setAnchor(id);
      setChosen('overview');
    },
  };
}

interface PanelsProps extends EndedBodyProps {
  readonly results: ResultsTab;
  readonly overview: OverviewLoad;
  readonly answers: RunAnswersState;
  /** DEC-154: the first question without a saved answer is to take focus. */
  readonly focus: FocusRequest;
  readonly built: boolean;
}

function Panels(props: PanelsProps): JSX.Element | null {
  const { run, shown, results, overview, answers } = props;
  if (results.tab === 'overview') {
    return (
      <>
        <UnderstandingSummary load={props.understanding} />
        <AppOverview runId={run.id} load={overview} />
        <VerificationNote state={shown} />
      </>
    );
  }
  if (results.tab === 'questions') {
    return (
      <RunAnswers
        runId={run.id}
        answers={answers}
        focus={props.focus}
        overview={overview}
        onConcern={(section) => {
          results.showSection(sectionAnchor(section));
        }}
      />
    );
  }
  if (results.tab === 'calls') return <PlanCalls runId={run.id} state={shown} />;
  if (results.tab === 'evidence')
    return <EvidenceTab {...props} state={shown} source={reportSeen(props.source, props.built)} />;
  return (
    <>
      <ActivityTab state={shown} runId={run.id} />
      <Replay runId={run.id} built={props.built} />
    </>
  );
}

/**
 * RF-1021 (P8-84): the journey of an ended understand run. It reads the coverage as Your turn does, so
 * both name the same next step, and its action is secondary unless the page has no other primary.
 */
function EndedJourney(
  props: EndedBodyProps & { readonly open: number | undefined; readonly onAnswer: () => void },
): JSX.Element {
  const { run, stage, phase, shown } = props;
  const { reading } = useContext(AreaReadContext);
  const place = primaryPlaceOf(shown.ended?.endState, endFactsOf(shown).supportedClaims);
  return (
    <UnderstandJourney
      {...{ run, stage, phase, open: props.open, onResumed: props.onResumed }}
      onAnswer={props.onAnswer}
      belowBar={belowTheBar(reading)}
      actionVariant={place === 'strip' ? 'primary' : 'secondary'}
    />
  );
}

/** The stepper, what failed, the areas that failed and, for a Deepen run, its rounds. */
function Header(
  props: EndedBodyProps & {
    readonly reportBuilt: boolean;
    readonly open: number | undefined;
    readonly onAnswer: () => void;
  },
): JSX.Element {
  const { run, state, shown, phase, stage } = props;
  const built = { stage, commitSha: run.commitSha, reportBuilt: props.reportBuilt };
  return (
    <>
      <RunStepper steps={stepperOf(built, shown, phase)} />
      {state.ended?.errorCode === undefined ? null : (
        <RunFailure code={state.ended.errorCode} stage={stage} />
      )}
      <FailedAreas
        {...{ state: shown, projectId: run.projectId, runId: run.id }}
        consentRecorded={run.cloudConsent === true}
      />
      {shown.retry === undefined ? null : <RetryNotice retry={shown.retry} />}
      {shown.deepen === undefined ? null : <DeepenProgress progress={shown.deepen} />}
      <EndedJourney {...props} />
    </>
  );
}

// RF-1015
export function EndedBody(props: EndedBodyProps): JSX.Element {
  const { run, state, shown, stage } = props;
  const failed = state.ended?.errorCode !== undefined;
  const asks = stage === 'understand' && !failed;
  const report = useReportBuilt(run);
  const overview = useRunOverview(run.id, asks);
  const answers = useRunAnswers(run.id, asks);
  const results = useResultsTab(asks, stage);
  const open = openQuestions(answers.load);
  const { focus, showQuestions } = useQuestionsFocus(() => {
    results.show('questions');
  });
  // P8-27: a scan shows its code map and its download only; the panels are for an understand or plan run.
  return (
    <>
      <Header {...props} reportBuilt={report.built} open={open} onAnswer={showQuestions} />
      {stage === 'scan' ? (
        <ScanResult run={run} state={shown} />
      ) : (
        <div class="rst-p170-grid">
          <section class="rst-card rst-p170-main" aria-label="Results">
            <Tabs
              label="Results"
              tabs={endedTabsOf({ stage, asks, open, state: shown })}
              selected={results.tab}
              onSelect={results.select}
            >
              <Panels {...props} {...{ results, overview, answers, focus }} built={report.built} />
            </Tabs>
          </section>
          <Rail
            {...{ run, stage, failed, asks }}
            answers={answers.load}
            {...{ overview, onResumed: props.onResumed }}
            deepenRunId={asks && mayDeepen(state.ended, run) ? run.id : undefined}
            state={shown}
            costMicros={props.costMicros}
            report={report}
            onAnswer={showQuestions}
            understanding={props.understanding}
          />
        </div>
      )}
    </>
  );
}
