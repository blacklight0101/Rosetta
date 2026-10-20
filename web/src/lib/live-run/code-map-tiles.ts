import type { AgentPanelState, RunState } from './run-state.js';
import { endedWithoutCard } from './run-summary.js';

// RF-1016, DEC-137: the tiles of the living code map. One tile per area of the code map, sized by the
// tokens its area is estimated to take, in the state its reader agents are in. Third-party areas
// that the run did not take are drawn as library, left out. Names come from the repository and are
// kept as plain strings; the page shows them as text.

export type TileState = 'waiting' | 'reading' | 'done' | 'gap' | 'library';

export interface CodeAreaInfo {
  readonly name: string;
  readonly estimatedTokens: number;
  readonly thirdParty: boolean;
  /** The files the code map lists in the area, when the estimate said. */
  readonly files?: number;
}

export interface Tile {
  readonly name: string;
  readonly state: TileState;
  readonly tokens: number;
  readonly filesRead: number;
  readonly cards: number;
  readonly agentTaskId: string | undefined;
  /** Grid columns (2 to 4) and rows (1 to 3) the tile spans. */
  readonly columns: number;
  readonly rows: number;
  /** Whole percent of the area's estimate a reading agent has used, 5 to 95; else undefined. */
  readonly progress: number | undefined;
}

interface Known {
  readonly name: string;
  readonly tokens: number;
  readonly thirdParty: boolean;
}

const MAX_PROGRESS = 95;
const MIN_PROGRESS = 5;

function readersOf(state: RunState): readonly AgentPanelState[] {
  return state.agents.filter((agent) => agent.role === 'reader' && agent.area !== '');
}

/** The state of an area from its agents: working beats waiting, which beats failed, which beats done. */
function stateOfAgents(agents: readonly AgentPanelState[]): TileState {
  if (agents.some((agent) => agent.state === 'Running')) return 'reading';
  if (agents.some((agent) => agent.state === 'Planned')) return 'waiting';
  if (agents.some(endedWithoutCard)) return 'gap';
  return 'done';
}

/** An area no agent was given: library, not covered once the run planned its work, else waiting. */
function stateWithoutAgents(area: Known, planned: boolean): TileState {
  if (area.thirdParty) return 'library';
  return planned ? 'gap' : 'waiting';
}

function progressOf(agents: readonly AgentPanelState[], tokens: number): number | undefined {
  if (!(tokens > 0)) return undefined;
  const used = agents.reduce((sum, agent) => sum + agent.inputTokens + agent.outputTokens, 0);
  return Math.min(MAX_PROGRESS, Math.max(MIN_PROGRESS, Math.round((used * 100) / tokens)));
}

/** Larger tiles for larger areas: at least 60% of the largest area, at least 30%, or less. */
function sizeOf(tokens: number, largest: number): { columns: number; rows: number } {
  const share = largest > 0 ? tokens / largest : 1;
  if (share >= 0.6) return { columns: 4, rows: 3 };
  if (share >= 0.3) return { columns: 3, rows: 2 };
  return { columns: 2, rows: 1 };
}

/** The areas to draw: the code map's, then agent areas it does not name; or the agents' alone. */
function knownAreas(readers: readonly AgentPanelState[], areas: readonly CodeAreaInfo[]): Known[] {
  const listed = areas.map((area) => ({
    name: area.name,
    tokens: area.estimatedTokens,
    thirdParty: area.thirdParty,
  }));
  const names = new Set(listed.map((area) => area.name));
  const fallback = Math.max(1, ...listed.map((area) => area.tokens));
  const extra = [...new Set(readers.map((agent) => agent.area))]
    .filter((name) => !names.has(name))
    .map((name) => ({ name, tokens: fallback, thirdParty: false }));
  return [...listed, ...extra];
}

function tileOf(area: Known, readers: readonly AgentPanelState[], largest: number): Tile {
  const mine = readers.filter((agent) => agent.area === area.name);
  const state =
    mine.length > 0 ? stateOfAgents(mine) : stateWithoutAgents(area, readers.length > 0);
  const size = state === 'library' ? { columns: 4, rows: 1 } : sizeOf(area.tokens, largest);
  return {
    name: area.name,
    state,
    tokens: area.tokens,
    filesRead: mine.reduce((sum, agent) => sum + agent.filesRead.length, 0),
    cards: mine.reduce((sum, agent) => sum + agent.cards.length, 0),
    agentTaskId: mine[0]?.agentTaskId,
    ...size,
    progress: state === 'reading' ? progressOf(mine, area.tokens) : undefined,
  };
}

// RF-1016
export function tilesOf(
  state: RunState,
  areas: readonly CodeAreaInfo[] | undefined,
): readonly Tile[] {
  const readers = readersOf(state);
  const known = knownAreas(readers, areas ?? []);
  const taken = new Set(readers.map((agent) => agent.area));
  const own = known.filter((area) => !area.thirdParty || taken.has(area.name));
  // The largest own area sets the size, so a big library does not shrink the others.
  const largest = Math.max(0, ...own.map((area) => area.tokens));
  const tiles = known.map((area) => tileOf(area, readers, largest));
  const left = (tile: Tile): boolean => tile.state === 'library';
  return [...tiles.filter((tile) => !left(tile)), ...tiles.filter(left)];
}
