import type { RunState } from './run-state.js';

// RF-1016: stub, replaced in the next commit.

export type TileState = 'waiting' | 'reading' | 'done' | 'gap' | 'library';

export interface CodeAreaInfo {
  readonly name: string;
  readonly estimatedTokens: number;
  readonly thirdParty: boolean;
}

export interface Tile {
  readonly name: string;
  readonly state: TileState;
  readonly tokens: number;
  readonly filesRead: number;
  readonly cards: number;
  readonly agentTaskId: string | undefined;
  readonly columns: number;
  readonly rows: number;
  readonly progress: number | undefined;
}

function notBuilt(): never {
  throw new Error('not built yet');
}

export function tilesOf(
  state: RunState,
  areas: readonly CodeAreaInfo[] | undefined,
): readonly Tile[] {
  return (areas ?? state.agents).slice(0, 0).map(notBuilt);
}
