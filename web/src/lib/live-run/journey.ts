import type { Tile } from './code-map-tiles.js';
import type { RunPhase } from './run-phase.js';
import type { AgentPanelState, RunState } from './run-state.js';

// RF-1015, DEC-137: the run journey of the page while a run works: map the code, read, check
// citations, explain, your questions. Exactly one step is current while the run works; the steps
// after it wait. What each step says is what the events show; nothing is promised that the run
// has not done (the overview and the questions come when the run ends).

export type JourneyStatus = 'done' | 'current' | 'later';

export interface JourneyStep {
  readonly key: 'map' | 'read' | 'check' | 'explain' | 'questions';
  readonly title: string;
  readonly detail: string;
  /** A sentence the step adds for people who want the whole story (shown as a tooltip and read out). */
  readonly note: string | undefined;
  readonly status: JourneyStatus;
}

export interface JourneyInput {
  readonly stage: string;
  readonly phase: RunPhase;
  readonly state: RunState;
  readonly tiles: readonly Tile[];
}

type Core = Pick<JourneyStep, 'status' | 'detail'> & { readonly note?: string | undefined };

const JUDGEMENT_NOTE =
  'Judgement comes in a later version; citations checked does not mean supported.';

const finished = (agent: AgentPanelState): boolean =>
  agent.state !== 'Planned' && agent.state !== 'Running';

const plural = (count: number, one: string, many: string): string =>
  `${String(count)} ${count === 1 ? one : many}`;

function mapStep(input: JourneyInput): Core {
  const { stage, phase, state, tiles } = input;
  if (phase.kind === 'queued') return { status: 'later', detail: 'waiting in the queue' };
  if (stage === 'scan') {
    if (state.scan === undefined) return { status: 'current', detail: 'reading the repository' };
    return {
      status: 'done',
      detail: `${String(state.scan.files)} files, ${String(state.scan.areas)} areas`,
    };
  }
  const library = tiles.filter((tile) => tile.state === 'library').length;
  const own = tiles.length - library;
  if (tiles.length === 0) return { status: 'done', detail: 'code map ready' };
  const left =
    library === 0 ? '' : `, ${plural(library, 'library folder', 'library folders')} left out`;
  return { status: 'done', detail: `${plural(own, 'area', 'areas')}${left}` };
}

function readers(state: RunState): readonly AgentPanelState[] {
  return state.agents.filter((agent) => agent.role === 'reader');
}

function readStep(input: JourneyInput, mapDone: boolean): Core {
  if (input.stage === 'scan') return { status: 'later', detail: 'in an Understand run' };
  if (!mapDone || input.phase.kind === 'queued') return { status: 'later', detail: 'area by area' };
  const all = readers(input.state);
  if (all.length === 0) return { status: 'current', detail: 'planning the areas' };
  const ended = all.filter(finished).length;
  return {
    status: ended === all.length ? 'done' : 'current',
    detail: `${String(ended)} of ${String(all.length)} areas`,
  };
}

function checkStep(state: RunState, readDone: boolean): Core {
  const { claims } = state;
  const checked = claims.filter((claim) => claim.status !== 'Proposed').length;
  const detail =
    claims.length === 0
      ? 'as cards arrive'
      : `${String(checked)} of ${String(claims.length)} citations checked`;
  const note = claims.length === 0 ? undefined : JUDGEMENT_NOTE;
  if (!readDone) return { status: 'later', detail, note };
  return { status: checked === claims.length ? 'done' : 'current', detail, note };
}

function explainStep(state: RunState): Core {
  const writers = state.agents.filter((agent) => agent.role === 'summariser');
  if (writers.length === 0) return { status: 'later', detail: 'overview after reading' };
  const working = writers.some((agent) => !finished(agent));
  return working
    ? { status: 'current', detail: 'writing the overview' }
    : { status: 'done', detail: 'overview written' };
}

// RF-1015
export function journeyOf(input: JourneyInput): readonly JourneyStep[] {
  const map = mapStep(input);
  const read = readStep(input, map.status === 'done');
  const check = checkStep(input.state, read.status === 'done');
  const explain = explainStep(input.state);
  const steps: readonly Omit<JourneyStep, 'status'>[] = [
    { key: 'map', title: 'Map the code', detail: map.detail, note: undefined },
    { key: 'read', title: 'Read', detail: read.detail, note: undefined },
    { key: 'check', title: 'Check citations', detail: check.detail, note: check.note },
    { key: 'explain', title: 'Explain', detail: explain.detail, note: undefined },
    { key: 'questions', title: 'Your questions', detail: 'after the overview', note: undefined },
  ];
  const statuses: readonly JourneyStatus[] = [
    map.status,
    read.status,
    check.status,
    explain.status,
    'later',
  ];
  return steps.map((step, index) => ({ ...step, status: statuses[index] ?? 'later' }));
}
