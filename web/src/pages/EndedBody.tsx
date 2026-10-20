import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { waitsForAnswer } from '../api/answers.js';
import type { RunEstimate } from '../api/estimate-schemas.js';
import { reportFilePath } from '../api/runs.js';
import type { RunRow } from '../api/run-schemas.js';
import { Link } from '../components/Link.js';
import { Tabs, type TabSpec } from '../components/Tabs.js';
import { logCountOf } from '../lib/live-run/log-count.js';
import type { RunPhase } from '../lib/live-run/run-phase.js';
import type { RunState, SourceState } from '../lib/live-run/run-state.js';
import { stepperOf } from '../lib/live-run/run-stepper.js';
import { ActivityTab } from './ActivityTab.js';
import { AppOverview, sectionAnchor } from './AppOverview.js';
import { DeepenProgress } from './DeepenProgress.js';
import { EvidenceTab } from './EvidenceTab.js';
import { UnderstandJourney } from './JourneyPlacement.js';
import { FailedAreas } from './FailedAreas.js';
import { RetryNotice } from './RetryNotice.js';

import { RunAnswers } from './RunAnswers.js';
import { RunDownloads } from './RunDownloads.js';
import { RunFailure } from './RunFailure.js';
import { RunReport } from './RunReport.js';
import { RunStepper } from './RunStepper.js';
import { useQuestionsFocus, type FocusRequest } from './use-focus-first-question.js';
import { useRunAnswers, type AnswersLoad, type RunAnswersState } from './use-run-answers.js';
import { useRunOverview, type OverviewLoad } from './use-run-overview.js';
import { useUnderstanding, type UnderstandingLoad } from './use-understanding.js';
import { UnderstandingSummary } from './UnderstandingSummary.js';
import { VerificationNote } from './VerificationNote.js';
import { YourTurn } from './YourTurn.js';

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
  readonly source: SourceState | undefined;
  /** RF-006: called once the server has queued the run again; the page follows it anew. */
  readonly onResumed: () => void;
}

const tabIds = ['overview', 'questions', 'evidence', 'activity'] as const;
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

function tabsOf(props: {
  readonly asks: boolean;
  readonly open: number | undefined;
  readonly state: RunState;
}): readonly TabSpec[] {
  const { asks, open, state } = props;
  return [
    ...(asks ? [{ id: 'overview', label: 'Overview' }] : []),
    ...(asks ? [{ id: 'questions', label: 'Your questions', count: open }] : []),
    { id: 'evidence', label: 'Evidence', count: state.cards.length },
    { id: 'activity', label: 'Activity', count: logCountOf(state.log) },
  ];
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
function useResultsTab(asks: boolean): ResultsTab {
  const [chosen, setChosen] = useState<TabId>(asks ? 'overview' : 'evidence');
  const [anchor, setAnchor] = useState<string | undefined>();
  // The run may turn out to have failed after the page opened on the overview (its events replay).
  const tab = asks || (chosen !== 'overview' && chosen !== 'questions') ? chosen : 'evidence';
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
  readonly understanding: UnderstandingLoad;
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
  if (results.tab === 'evidence')
    return <EvidenceTab {...props} state={shown} source={reportSeen(props.source, props.built)} />;
  return (
    <>
      <ActivityTab state={shown} runId={run.id} />
      <Replay runId={run.id} built={props.built} />
    </>
  );
}

interface RailProps {
  readonly run: RunRow;
  readonly stage: string;
  readonly state: RunState;
  readonly costMicros: number;
  readonly failed: boolean;
  readonly asks: boolean;
  readonly answers: AnswersLoad;
  /** RF-209: the run can be deepened (it ended Completed); undefined otherwise. */
  readonly deepenRunId: string | undefined;
  readonly report: { readonly onBuilt: () => void };
  readonly onAnswer: () => void;
}

/** The Your turn panel, and the report, the downloads and the calls link, one click away. */
function Rail(props: RailProps): JSX.Element {
  const { run, stage } = props;
  return (
    <aside class="rst-p170-rail">
      <YourTurn {...props} />
      <section class="rst-card rst-p170-downloads" aria-label="Report and downloads">
        <RunReport runId={run.id} ended onBuilt={props.report.onBuilt} />
        <RunDownloads runId={run.id} stage={stage} ended />
        <p class="rst-p137-live-link">
          <Link href={`/runs/${encodeURIComponent(run.id)}/calls`}>API calls and logs</Link>
        </p>
      </section>
    </aside>
  );
}

/** How many questions wait for an answer; none known until they are read. */
function openQuestions(answers: AnswersLoad): number | undefined {
  if (answers.status !== 'ready') return undefined;
  return answers.questions.filter(waitsForAnswer).length;
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
      {state.ended?.errorCode === undefined ? null : <RunFailure code={state.ended.errorCode} />}
      <FailedAreas state={shown} projectId={run.projectId} runId={run.id} />
      {shown.retry === undefined ? null : <RetryNotice retry={shown.retry} />}
      {shown.deepen === undefined ? null : <DeepenProgress progress={shown.deepen} />}
      <UnderstandJourney
        {...{ run, stage, phase, open: props.open, onResumed: props.onResumed }}
        onAnswer={props.onAnswer}
      />
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
  const understanding = useUnderstanding(run.id, asks);
  const results = useResultsTab(asks);
  const open = openQuestions(answers.load);
  const { focus, showQuestions } = useQuestionsFocus(() => {
    results.show('questions');
  });
  return (
    <>
      <Header {...props} reportBuilt={report.built} open={open} onAnswer={showQuestions} />
      <div class="rst-p170-grid">
        <section class="rst-card rst-p170-main" aria-label="Results">
          <Tabs
            label="Results"
            tabs={tabsOf({ asks, open, state: shown })}
            selected={results.tab}
            onSelect={results.select}
          >
            <Panels
              {...props}
              {...{ results, overview, answers, understanding, focus }}
              built={report.built}
            />
          </Tabs>
        </section>
        <Rail
          {...{ run, stage, failed, asks }}
          answers={answers.load}
          deepenRunId={asks && state.ended?.endState === 'Completed' ? run.id : undefined}
          state={shown}
          costMicros={props.costMicros}
          report={report}
          onAnswer={showQuestions}
        />
      </div>
    </>
  );
}
