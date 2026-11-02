import type { RunEvent } from '../../api/run-events.js';
import { usageData } from './event-data.js';
import type { PlanCallState, RunState } from './run-state.js';

// RF-1015, RF-1002 (P7-25): the planner calls of a plan run as the page tells them from the events:
// `plan.call.started` opens a call under the agent task of the document, `usage.recorded` of the same
// task adds its tokens and cost and ends the call. A document that needs more than one answer (a
// continuation, a repair) starts its task again; the tokens add up.

/** The calls of a plan run in the order the planner makes them; the gap round comes only when needed. */
const ORDER = [
  'package',
  'prd',
  'data-model',
  'flows',
  'api-contract',
  'ux',
  'coverage',
  'gap',
] as const;

const LABELS: Readonly<Record<string, string>> = {
  package: 'Plan package',
  prd: 'PRD',
  'data-model': 'Data model',
  flows: 'Flows',
  'api-contract': 'API contract',
  ux: 'UX document',
  coverage: 'Coverage check',
  gap: 'Gap round',
};

const PREFIX = 'planner-';

/** The name of a call for the page; an id this page does not know is shown as it is. */
export const callLabel = (call: string): string => LABELS[call] ?? call;

const callOf = (agentTaskId: string): string => agentTaskId.slice(PREFIX.length);

const isPlannerTask = (id: string | undefined): id is string => id?.startsWith(PREFIX) === true;

function upsert(
  state: RunState,
  id: string,
  change: (call: PlanCallState) => PlanCallState,
): RunState {
  const blank: PlanCallState = {
    ...{ agentTaskId: id, call: callOf(id), startedAt: undefined, running: false },
    ...{ inputTokens: 0, outputTokens: 0, costMicros: undefined },
  };
  const known = state.planCalls.some((each) => each.agentTaskId === id);
  const calls = known ? state.planCalls : [...state.planCalls, blank];
  return {
    ...state,
    planCalls: calls.map((each) => (each.agentTaskId === id ? change(each) : each)),
  };
}

// RF-1015
export function onPlanCallStarted(state: RunState, event: RunEvent): RunState {
  if (!isPlannerTask(event.agentTaskId)) return state;
  const idle = {
    ...state,
    planCalls: state.planCalls.map((each) => ({ ...each, running: false })),
  };
  return upsert(idle, event.agentTaskId, (call) => ({
    ...call,
    startedAt: event.at,
    running: true,
  }));
}

// RF-1015
export function onPlanUsage(state: RunState, event: RunEvent): RunState {
  const parsed = usageData.safeParse(event.data);
  if (!parsed.success || !isPlannerTask(event.agentTaskId)) return state;
  const { tokens, costMicros } = parsed.data;
  return upsert(state, event.agentTaskId, (call) => ({
    ...call,
    running: false,
    inputTokens: call.inputTokens + (tokens?.inputTokens ?? 0),
    outputTokens: call.outputTokens + (tokens?.outputTokens ?? 0),
    costMicros: costMicros === undefined ? call.costMicros : (call.costMicros ?? 0) + costMicros,
  }));
}

/** The call whose answer the planner is waiting for; undefined between calls. */
export const workingCall = (state: RunState): PlanCallState | undefined =>
  state.planCalls.findLast((call) => call.running);

/** The call that follows, by the usual order; undefined once the usual calls have all started. */
export function nextCall(state: RunState): string | undefined {
  const seen = new Set(state.planCalls.map((call) => call.call));
  return ORDER.filter((call) => call !== 'gap').find((call) => !seen.has(call));
}

/** RF-1015: what the "Planner calls" step says: the call that runs, or the one that comes next. */
export function planStepDetail(state: RunState): string | undefined {
  const working = workingCall(state);
  if (working !== undefined) return `${callLabel(working.call)} running`;
  const next = nextCall(state);
  return next === undefined ? undefined : `next: ${callLabel(next)}`;
}

/** `m:ss` for the seconds a call has been running. */
export function secondsLabel(startedAt: string | undefined, now: number): string {
  const start = startedAt === undefined ? Number.NaN : Date.parse(startedAt);
  const seconds = Number.isNaN(start) ? 0 : Math.max(0, Math.floor((now - start) / 1000));
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
}
