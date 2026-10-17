import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { RunEstimate } from '../api/estimate-schemas.js';
import { reportFilePath } from '../api/runs.js';
import type { RunRow } from '../api/run-schemas.js';
import { Link } from '../components/Link.js';
import { Tabs, type TabSpec } from '../components/Tabs.js';
import type { RunPhase } from '../lib/live-run/run-phase.js';
import type { RunState, SourceState } from '../lib/live-run/run-state.js';
import { stepperOf } from '../lib/live-run/run-stepper.js';
import { ActivityTab } from './ActivityTab.js';
import { AppOverview, sectionAnchor } from './AppOverview.js';
import { EvidenceTab } from './EvidenceTab.js';
import { FailedAreas } from './FailedAreas.js';
import { RunAnswers } from './RunAnswers.js';
import { RunDownloads } from './RunDownloads.js';
import { RunFailure } from './RunFailure.js';
import { RunReport } from './RunReport.js';
import { RunStepper } from './RunStepper.js';
import { useRunAnswers } from './use-run-answers.js';
import { useRunOverview } from './use-run-overview.js';
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
}

const tabIds = ['overview', 'questions', 'evidence', 'activity'] as const;
type TabId = (typeof tabIds)[number];

const tabOf = (id: string): TabId => tabIds.find((each) => each === id) ?? 'evidence';

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
    { id: 'activity', label: 'Activity', count: state.log.length },
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

// RF-1015
export function EndedBody(props: EndedBodyProps): JSX.Element {
  const { run, state, shown, phase, stage } = props;
  const failed = state.ended?.errorCode !== undefined;
  const asks = stage === 'understand' && !failed;
  const report = useReportBuilt(run);
  const overview = useRunOverview(run.id, asks);
  const answers = useRunAnswers(run.id, asks);
  const [chosen, setTab] = useState<TabId>(asks ? 'overview' : 'evidence');
  // The run may turn out to have failed after the page opened on the overview (its events replay).
  const tab = asks || (chosen !== 'overview' && chosen !== 'questions') ? chosen : 'evidence';
  const [anchor, setAnchor] = useState<string | undefined>();
  useEffect(() => {
    if (tab !== 'overview' || anchor === undefined) return;
    const target = document.getElementById(anchor);
    if (typeof target?.scrollIntoView === 'function') target.scrollIntoView();
  }, [tab, anchor]);
  const open =
    answers.load.status === 'ready'
      ? answers.load.questions.filter((each) => each.state === 'Open').length
      : undefined;
  return (
    <>
      <RunStepper
        steps={stepperOf(
          { stage, commitSha: run.commitSha, reportBuilt: report.built },
          shown,
          phase,
        )}
      />
      {state.ended?.errorCode === undefined ? null : <RunFailure code={state.ended.errorCode} />}
      <FailedAreas state={shown} projectId={run.projectId} />
      <div class="rst-p170-grid">
        <section class="rst-card rst-p170-main" aria-label="Results">
          <Tabs
            label="Results"
            tabs={tabsOf({ asks, open, state: shown })}
            selected={tab}
            onSelect={(id) => {
              setTab(tabOf(id));
            }}
          >
            {tab === 'overview' ? (
              <>
                <AppOverview runId={run.id} load={overview} />
                <VerificationNote state={shown} />
              </>
            ) : null}
            {tab === 'questions' ? (
              <RunAnswers
                runId={run.id}
                answers={answers}
                overview={overview}
                onConcern={(section) => {
                  setAnchor(sectionAnchor(section));
                  setTab('overview');
                }}
              />
            ) : null}
            {tab === 'evidence' ? <EvidenceTab {...props} state={shown} /> : null}
            {tab === 'activity' ? (
              <>
                <ActivityTab state={shown} runId={run.id} />
                <Replay runId={run.id} built={report.built} />
              </>
            ) : null}
          </Tabs>
        </section>
        <aside class="rst-p170-rail">
          <YourTurn
            {...{ failed, asks }}
            answers={answers.load}
            state={shown}
            costMicros={props.costMicros}
            onAnswer={() => {
              setTab('questions');
            }}
          />
          <section class="rst-card rst-p170-downloads" aria-label="Report and downloads">
            <RunReport runId={run.id} ended onBuilt={report.onBuilt} />
            <RunDownloads runId={run.id} stage={stage} ended />
            <p class="rst-p137-live-link">
              <Link href={`/runs/${encodeURIComponent(run.id)}/calls`}>API calls and logs</Link>
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
