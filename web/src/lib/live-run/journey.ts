import type { RunPhase } from './run-phase.js';
import type { Tile } from './code-map-tiles.js';
import type { RunState } from './run-state.js';

// RF-1015: stub, replaced in the next commit.

export type JourneyStatus = 'done' | 'current' | 'later';

export interface JourneyStep {
  readonly key: 'map' | 'read' | 'check' | 'explain' | 'questions';
  readonly title: string;
  readonly detail: string;
  readonly status: JourneyStatus;
}

export interface JourneyInput {
  readonly stage: string;
  readonly phase: RunPhase;
  readonly state: RunState;
  readonly tiles: readonly Tile[];
}

function notBuilt(): never {
  throw new Error('not built yet');
}

export function journeyOf(input: JourneyInput): readonly JourneyStep[] {
  return input.tiles.slice(0, 0).map(notBuilt);
}
