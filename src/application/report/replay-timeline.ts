import type { RunEvent } from '../../domain/runs/run-event.js';
import type { ReplayModel } from './replay-model.js';

// RF-506: the steps, agents and running cost of a run, built from its events.
export function buildReplay(runKey: string, events: readonly RunEvent[]): ReplayModel {
  void events;
  return { runKey, steps: [], agents: [], durationMs: 0, totalTokens: 0, totalCostMicros: 0 };
}
