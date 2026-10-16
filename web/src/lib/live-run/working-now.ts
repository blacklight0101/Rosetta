import type { RunState } from './run-state.js';

// RF-1015: stub, replaced in the next commit.

export interface WorkingItem {
  readonly key: string;
  readonly role: string;
  readonly title: string;
  readonly text: string;
}

function notBuilt(): never {
  throw new Error('not built yet');
}

export function workingNowOf(state: RunState): readonly WorkingItem[] {
  return state.agents.slice(0, 0).map(notBuilt);
}
