import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { CoverageListing } from '../api/coverage.js';
import type { RunEstimate } from '../api/estimate-schemas.js';
import type { RunRow } from '../api/run-schemas.js';
import { Tabs, type TabSpec } from '../components/Tabs.js';
import { tilesOf, type CodeAreaInfo, type Tile } from '../lib/live-run/code-map-tiles.js';
import { journeyOf } from '../lib/live-run/journey.js';
import { logCountOf } from '../lib/live-run/log-count.js';
import type { RunPhase } from '../lib/live-run/run-phase.js';
import type { RunState, SourceState, UploadSourceState } from '../lib/live-run/run-state.js';
import { stepperOf } from '../lib/live-run/run-stepper.js';
import { roleTotalsOf } from '../lib/live-run/run-summary.js';
import { workingNowOf } from '../lib/live-run/working-now.js';
import { ActivityTab } from './ActivityTab.js';
import { AgentsTab } from './AgentsTab.js';
import { CardsTab } from './CardsTab.js';
import { CodeMap } from './CodeMap.js';
import { DeepenProgress } from './DeepenProgress.js';
import { RetryNotice } from './RetryNotice.js';
import { RunJourney } from './RunJourney.js';
import { RunStepper } from './RunStepper.js';
import { SpendPanel } from './SpendPanel.js';
import { useCodeAreas } from './use-code-areas.js';
import { endedAgents, useRunCoverage } from './use-run-coverage.js';
import { WorkingNow } from './WorkingNow.js';

// RF-1015, DEC-137, design-system.md section 14 (live run): the page of a run while it runs (queued
// or working): the run journey, the living code map, the spend against the cap and the agents at
// work, and below them one list at a time in tabs: cards so far, all agents, activity. The proposal
// `docs/design/proposals/run-page-v2.html` is the reference. The ended run has its own page
// (`EndedBody`).

export interface RunningBodyProps {
  readonly run: RunRow;
  /** What the panels show: the live state, or the one frozen by Pause updates. */
  readonly state: RunState;
  readonly phase: RunPhase;
  readonly stage: string;
  readonly costMicros: number;
  readonly estimate: RunEstimate | undefined;
  readonly source: SourceState | undefined;
}

const tabIds = ['cards', 'agents', 'activity'] as const;
type TabId = (typeof tabIds)[number];

const tabOf = (id: string): TabId => tabIds.find((each) => each === id) ?? 'cards';

/** The zip, or the Excel workbooks (RF-156), or what is said when the run records no name. */
function sourceName(
  fileName: string | undefined,
  workbooks: readonly string[] | undefined,
): string {
  if (workbooks === undefined) return fileName ?? 'Uploaded zip';
  return workbooks.length === 0 ? 'Excel workbooks' : workbooks.join(', ');
}

/** RF-131: the zip, the upload date and the snapshot hash, in place of a repository and a commit. */
function UploadFacts(props: { readonly source: UploadSourceState }): JSX.Element {
  const { fileName, workbooks, uploadedAt, snapshotHash } = props.source;
  return (
    <>
      <span class="rst-mono">{sourceName(fileName, workbooks)}</span>
      {uploadedAt === undefined ? null : <span>{`uploaded ${uploadedAt.slice(0, 10)}`}</span>}
      {snapshotHash === undefined ? null : (
        <span class="rst-mono" title={snapshotHash}>
          {snapshotHash.slice(0, 23)}
        </span>
      )}
    </>
  );
}

function SourceFacts(props: { readonly source: SourceState | undefined }): JSX.Element | null {
  const { source } = props;
  if (source === undefined) return null;
  if (source.kind === 'upload') return <UploadFacts source={source} />;
  const commit = source.commitSha?.slice(0, 7);
  return (
    <span class="rst-mono">{`${source.owner}/${source.repo}${commit === undefined ? '' : ` @ ${commit}`}`}</span>
  );
}

function Facts(props: Pick<RunningBodyProps, 'state' | 'source'>): JSX.Element {
  const { source, state } = props;
  const models = [...new Set(state.agents.map((agent) => agent.model).filter((m) => m !== ''))];
  return (
    <p class="rst-running__facts">
      <SourceFacts source={source} />
      {models.length === 0 ? null : <span>{models.join(', ')}</span>}
    </p>
  );
}

function noteOf(phase: RunPhase, state: RunState): string {
  if (phase.kind === 'queued') return 'The run is waiting in the queue.';
  return state.agents.length === 0
    ? 'The agents start when the run has planned its work.'
    : 'No agent is working at this moment.';
}

function tabsOf(state: RunState): readonly TabSpec[] {
  return [
    { id: 'cards', label: 'Cards so far', count: state.cards.length },
    { id: 'agents', label: 'All agents', count: state.agents.length },
    { id: 'activity', label: 'Activity', count: logCountOf(state.log) },
  ];
}

interface DetailsProps extends RunningBodyProps {
  readonly coverage: CoverageListing | undefined;
  readonly codeAreas: readonly CodeAreaInfo[] | undefined;
  readonly tab: TabId;
  readonly area: string | undefined;
  readonly open: (id: TabId, area?: string) => void;
}

function Details(props: DetailsProps): JSX.Element {
  const { run, state, stage, tab, area, open } = props;
  return (
    <section class="rst-card rst-running__details" aria-label="Run details">
      <Tabs
        label="Run details"
        tabs={tabsOf(state)}
        selected={tab}
        onSelect={(id) => {
          open(tabOf(id));
        }}
      >
        {tab === 'cards' ? (
          <CardsTab state={state} claims={state.claims} source={props.source} />
        ) : null}
        {tab === 'agents' ? (
          <AgentsTab
            {...{ state, stage, area }}
            coverage={props.coverage}
            codeAreas={props.codeAreas}
            costMicros={props.costMicros}
            estimate={props.estimate}
            onShowAll={() => {
              open('agents');
            }}
          />
        ) : null}
        {tab === 'activity' ? <ActivityTab state={state} runId={run.id} /> : null}
      </Tabs>
    </section>
  );
}

/** The stepper of a plan run (its plan steps only, RF-1015) or the run journey of an understand run. */
function StepsOf(props: {
  readonly run: RunRow;
  readonly stage: string;
  readonly phase: RunPhase;
  readonly state: RunState;
  readonly tiles: readonly Tile[];
}): JSX.Element {
  const { run, stage, phase, state, tiles } = props;
  if (stage === 'plan') {
    return (
      <RunStepper
        steps={stepperOf({ stage, commitSha: run.commitSha, reportBuilt: false }, state, phase)}
      />
    );
  }
  return <RunJourney steps={journeyOf({ stage, phase, state, tiles })} />;
}

// RF-1015
export function RunningBody(props: RunningBodyProps): JSX.Element {
  const { run, state, phase, stage } = props;
  const [tab, setTab] = useState<TabId>('cards');
  const [area, setArea] = useState<string | undefined>();
  const areas = useCodeAreas(run.projectId, stage);
  const coverage = useRunCoverage(run.id, stage, endedAgents(state));
  const tiles = tilesOf(state, areas);
  const open = (id: TabId, only?: string): void => {
    setTab(id);
    setArea(only);
  };
  const tokens = roleTotalsOf(state).reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0);
  return (
    <>
      <Facts state={state} source={props.source} />
      <StepsOf {...{ run, stage, phase, state, tiles }} />
      {state.retry === undefined ? null : <RetryNotice retry={state.retry} />}
      {state.deepen === undefined ? null : <DeepenProgress progress={state.deepen} />}
      <div class="rst-running__grid">
        {stage === 'plan' ? null : (
          <CodeMap
            tiles={tiles}
            stage={stage}
            onOpenArea={(name) => {
              open('agents', name);
            }}
          />
        )}
        <div class="rst-running__rail">
          <SpendPanel
            runId={run.id}
            costMicros={props.costMicros}
            tokens={tokens}
            caps={state.caps}
            onOpenRoles={() => {
              open('agents');
            }}
          />
          <WorkingNow items={workingNowOf(state)} waitingNote={noteOf(phase, state)} />
        </div>
      </div>
      <Details {...props} {...{ tab, area, open, coverage }} codeAreas={areas} />
    </>
  );
}
