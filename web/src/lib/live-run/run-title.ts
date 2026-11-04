import { interruptedPhrase } from '../interrupted-word.js';
import type { RunPhase } from './run-phase.js';
import type { RunState } from './run-state.js';

// RF-1015 (P8-27, UX-11): the title of a run page names the kind of run and where it stands, for
// example "Scan, done", "Understand, running" or "Deepen round 2, done". It never says "Live run".

export interface RunTitleInput {
  readonly stage: string;
  readonly phase: RunPhase;
  readonly state: RunState;
}

const kinds: Readonly<Record<string, string>> = {
  scan: 'Scan',
  understand: 'Understand',
  plan: 'Plan',
};

const endWords: Readonly<Record<string, string>> = {
  Completed: 'done',
  CapReached: 'stopped at its cap',
  Failed: 'failed',
};

function kindOf(input: RunTitleInput): string {
  const { deepen } = input.state;
  if (deepen !== undefined) {
    return deepen.rounds.length === 0 ? 'Deepen' : `Deepen round ${String(deepen.rounds.length)}`;
  }
  return kinds[input.stage] ?? 'Run';
}

function stateOf(phase: RunPhase): string {
  switch (phase.kind) {
    case 'queued':
      return 'waiting in the queue';
    case 'running':
      return 'running';
    case 'awaiting':
      return 'waiting for approval';
    case 'ended':
      // P8-111: an interrupted run is worded by why it ended.
      if (phase.endState === 'Interrupted') return interruptedPhrase(phase.endReason);
      return endWords[phase.endState] ?? 'stopped';
  }
}

// RF-1015
export function runTitleOf(input: RunTitleInput): string {
  return `${kindOf(input)}, ${stateOf(input.phase)}`;
}
