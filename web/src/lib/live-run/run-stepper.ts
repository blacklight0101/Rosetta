import type { RunPhase } from './run-phase.js';
import type { RunState } from './run-state.js';
import { overviewOf } from './run-summary.js';

// RF-1002, RF-1004, design-system.md section 5 (pipeline stepper): the five steps of a run as the page
// can tell them from the events and the run row. A stage the run does not include stays waiting, and
// so does a step the run never reached; at most one step is current. The report is built from the page
// of a finished run, never by the run, so its step always waits.

type StepName = 'Snapshot' | 'Scan' | 'Understand' | 'Verify' | 'Report';
export type StepStatus = 'done' | 'current' | 'waiting';

export interface Step {
  readonly name: StepName;
  readonly status: StepStatus;
  /** The counts the artboard shows beside the name, for example `2 of 4 agents done`. */
  readonly detail: string | undefined;
}

export interface StepperRun {
  readonly stage: string;
  readonly commitSha: string | null;
}

type Progress = 'done' | 'working' | 'idle';

function step(name: StepName, status: StepStatus, detail?: string): Step {
  return { name, status, detail };
}

/** A step that has not finished is current while the run works on it and waiting otherwise. */
function statusOf(progress: Progress, running: boolean): StepStatus {
  if (progress === 'done') return 'done';
  return progress === 'working' && running ? 'current' : 'waiting';
}

function agentsDone(state: RunState): string | undefined {
  if (state.agents.length === 0) return undefined;
  const { done, failed } = overviewOf(state);
  const lost = failed === 0 ? '' : `, ${String(failed)} failed`;
  return `${String(done)} of ${String(state.agents.length)} agents done${lost}`;
}

function claimsChecked(state: RunState): string | undefined {
  if (state.claims.length === 0) return undefined;
  const checked = state.claims.filter((claim) => claim.status !== 'Proposed').length;
  return `${String(checked)} of ${String(state.claims.length)} claims checked`;
}

function everyAgentEnded(state: RunState): boolean {
  return (
    state.agents.length > 0 &&
    state.agents.every((agent) => agent.state !== 'Planned' && agent.state !== 'Running')
  );
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

function snapshotTaken(run: StepperRun, state: RunState): boolean {
  return (
    state.source?.commitSha !== undefined || run.commitSha !== null || state.scan !== undefined
  );
}

function completedOf(phase: RunPhase): boolean {
  return phase.kind === 'ended' && phase.endState === 'Completed';
}

/** The first two steps of a scan: the snapshot is done once its commit is known, the scan at its end. */
function scanSteps(run: StepperRun, state: RunState, phase: RunPhase): readonly Step[] {
  const running = phase.kind === 'running';
  const completed = completedOf(phase);
  const snapshot: Progress = snapshotTaken(run, state) || completed ? 'done' : 'working';
  const scan: Progress =
    state.scan !== undefined || completed ? 'done' : afterwards(snapshot === 'done');
  return [
    step('Snapshot', statusOf(snapshot, running)),
    step('Scan', statusOf(scan, running), filesAndAreas(state)),
  ];
}

/** An understand run starts from a scan that is already done. */
function readerSteps(state: RunState, phase: RunPhase): readonly Step[] {
  const running = phase.kind === 'running';
  const completed = completedOf(phase);
  const understood = everyAgentEnded(state) || completed;
  const verified = understood && (completed || everyClaimChecked(state));
  const verify = verified ? 'done' : afterwards(understood);
  return [
    step('Understand', statusOf(understood ? 'done' : 'working', running), agentsDone(state)),
    step('Verify', statusOf(verify, running), claimsChecked(state)),
  ];
}

// RF-1002
export function stepperOf(run: StepperRun, state: RunState, phase: RunPhase): readonly Step[] {
  const report = step('Report', 'waiting');
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
