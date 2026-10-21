import { verifyDetail, waitsForJudgement } from './judgement-state.js';
import type { RunPhase } from './run-phase.js';
import type { RunState } from './run-state.js';
import { overviewOf } from './run-summary.js';

// RF-1002, RF-1004, design-system.md section 5 (pipeline stepper): the five steps of a run as the page
// can tell them from the events and the run row. A stage the run does not include stays waiting, and
// so does a step the run never reached; at most one step is current. The report is built from the page
// of a finished run, never by the run, so its step waits until a report exists (RF-504, P1-130).

type StepName =
  | ('Snapshot' | 'Scan' | 'Understand' | 'Verify' | 'Report')
  | ('Brief' | 'Planner calls' | 'Package' | 'Checks');
export type StepStatus = 'done' | 'current' | 'stopped' | 'waiting';

export interface Step {
  readonly name: StepName;
  readonly status: StepStatus;
  /** The counts the artboard shows beside the name, for example `2 of 4 agents done`. */
  readonly detail: string | undefined;
}

export interface StepperRun {
  readonly stage: string;
  readonly commitSha: string | null;
  /** A report exists for the run: built earlier (the run row) or from this page. */
  readonly reportBuilt: boolean;
}

type Progress = 'done' | 'working' | 'idle';

function step(name: StepName, status: StepStatus, detail?: string): Step {
  return { name, status, detail };
}

/**
 * A step that has not finished is current while the run works on it, stopped when the run ended
 * without finishing it, and waiting when the run never reached it.
 */
function statusOf(progress: Progress, phase: RunPhase): StepStatus {
  if (progress === 'done') return 'done';
  if (progress === 'idle') return 'waiting';
  return phase.kind === 'running' ? 'current' : 'stopped';
}

function agentsDone(state: RunState): string | undefined {
  if (state.agents.length === 0) return undefined;
  const { done, failed } = overviewOf(state);
  const lost = failed === 0 ? '' : `, ${String(failed)} failed`;
  return `${String(done)} of ${String(state.agents.length)} agents done${lost}`;
}

function everyAgentEnded(state: RunState): boolean {
  return (
    state.agents.length > 0 &&
    state.agents.every((agent) => agent.state !== 'Planned' && agent.state !== 'Running')
  );
}

function claimsStarted(state: RunState): boolean {
  return state.claims.some((claim) => claim.status !== 'Proposed');
}

function everyClaimChecked(state: RunState): boolean {
  return state.claims.length > 0 && state.claims.every((claim) => claim.status !== 'Proposed');
}

/** A step that cannot begin before the one ahead of it is done is idle until then. */
function afterwards(ready: boolean): Progress {
  return ready ? 'working' : 'idle';
}

function filesAndAreas(state: RunState): string | undefined {
  if (state.scan === undefined) return undefined;
  return `${String(state.scan.files)} files, ${String(state.scan.areas)} areas`;
}

/** The commit of a repository, or the hash of an uploaded zip (RF-131), pins the snapshot. */
function sourcePinned(source: RunState['source']): boolean {
  if (source === undefined) return false;
  return source.kind === 'upload'
    ? source.snapshotHash !== undefined
    : source.commitSha !== undefined;
}

function snapshotTaken(run: StepperRun, state: RunState): boolean {
  return sourcePinned(state.source) || run.commitSha !== null || state.scan !== undefined;
}

function completedOf(phase: RunPhase): boolean {
  return phase.kind === 'ended' && phase.endState === 'Completed';
}

/** The first two steps of a scan: the snapshot is done once its commit is known, the scan at its end. */
function scanSteps(run: StepperRun, state: RunState, phase: RunPhase): readonly Step[] {
  const completed = completedOf(phase);
  const snapshot: Progress = snapshotTaken(run, state) || completed ? 'done' : 'working';
  const scan: Progress =
    state.scan !== undefined || completed ? 'done' : afterwards(snapshot === 'done');
  return [
    step('Snapshot', statusOf(snapshot, phase)),
    step('Scan', statusOf(scan, phase), filesAndAreas(state)),
  ];
}

/** An understand run starts from a scan that is already done. */
function readerSteps(state: RunState, phase: RunPhase): readonly Step[] {
  const completed = completedOf(phase);
  const understood = completed || (everyAgentEnded(state) && overviewOf(state).failed === 0);
  // RF-1014: Verify is done once every claim was checked and none still waits for judgement.
  const checked = everyClaimChecked(state) && !waitsForJudgement(state);
  const verified = understood && (completed || checked);
  const started = understood || claimsStarted(state);
  const verify: Progress = verified ? 'done' : afterwards(started);
  return [
    step('Understand', statusOf(understood ? 'done' : 'working', phase), agentsDone(state)),
    step('Verify', statusOf(verify, phase), verifyDetail(state)),
  ];
}

/** RF-627: a run that wrote the package and ended with this code found items no task card builds. */
const PACKAGE_WITH_GAPS = 'RST-1806';

/**
 * RF-1015 (Q-44): the steps of a plan run: the brief it reads, the planner calls, the package it
 * writes and the checks on the package. A package written with gaps (RST-1806) has its package done
 * and its checks stopped (RF-627).
 */
function planSteps(state: RunState, phase: RunPhase): readonly Step[] {
  if (phase.kind === 'queued') {
    return (['Brief', 'Planner calls', 'Package', 'Checks'] as const).map((name) =>
      step(name, 'waiting'),
    );
  }
  const completed = completedOf(phase);
  const gaps = state.ended?.errorCode === PACKAGE_WITH_GAPS;
  const calls: Progress = completed || gaps ? 'done' : 'working';
  const written: Progress = completed || gaps ? 'done' : 'idle';
  const checked: Progress = completed ? 'done' : afterwards(gaps);
  return [
    step('Brief', 'done'),
    step('Planner calls', statusOf(calls, phase)),
    step('Package', statusOf(written, phase)),
    step('Checks', gaps ? 'stopped' : statusOf(checked, phase), gaps ? 'gaps found' : undefined),
  ];
}

// RF-1002, RF-1015
export function stepperOf(run: StepperRun, state: RunState, phase: RunPhase): readonly Step[] {
  if (run.stage === 'plan') return planSteps(state, phase);
  const report = step('Report', run.reportBuilt ? 'done' : 'waiting');
  if (phase.kind === 'queued') {
    return (['Snapshot', 'Scan', 'Understand', 'Verify'] as const)
      .map((name) => step(name, 'waiting'))
      .concat(report);
  }
  if (run.stage === 'scan') {
    return [
      ...scanSteps(run, state, phase),
      step('Understand', 'waiting'),
      step('Verify', 'waiting'),
      report,
    ];
  }
  const earlier = (name: StepName): Step => step(name, 'done');
  return [earlier('Snapshot'), earlier('Scan'), ...readerSteps(state, phase), report];
}
