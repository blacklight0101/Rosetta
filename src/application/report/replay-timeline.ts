import { z } from 'zod';
import { formatUsd, microUsd } from '../../domain/budget/money.js';
import type { RunEvent } from '../../domain/runs/run-event.js';
import type { ReplayAgent, ReplayKind, ReplayModel, ReplayStep } from './replay-model.js';

// RF-506, data-model.md section 3.9: the steps, agents and running cost of a run, built from its
// events. A type the page does not know, and an event whose data does not fit its type, are left
// out: new event types may appear without a version bump, and a damaged line must not hide the
// rest of the run.

interface Draft {
  readonly kind: ReplayKind;
  readonly label: string;
  readonly text: string;
}

const count = z.number().int().min(0);
const text = z.string();

const plural = (n: number, word: string): string => `${String(n)} ${word}${n === 1 ? '' : 's'}`;
const sha12 = (sha: string): string => sha.slice(0, 12);
const dollars = (micros: number): string => formatUsd(microUsd(BigInt(Math.trunc(micros))));

/** Sorted `key=value` pairs of the arguments a tool call shows: text and numbers only. */
function argumentsText(args: Record<string, unknown>): string {
  return Object.entries(args)
    .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ');
}

type Handler = (data: Record<string, unknown>) => Draft | undefined;

/** A handler that reads its data with a schema; data that does not fit gives no step. */
function reading<T extends z.ZodType>(schema: T, make: (value: z.output<T>) => Draft): Handler {
  return (data) => {
    const parsed = schema.safeParse(data);
    return parsed.success ? make(parsed.data) : undefined;
  };
}

const turnData = z.object({ turn: count, inputTokens: count, outputTokens: count });
const toolCalled = z.object({ tool: text, args: z.record(z.string(), z.unknown()) });
const toolResult = z.object({
  tool: text,
  ok: z.boolean(),
  linesReturned: count.optional(),
  refusedReason: text.optional(),
});

function toolOutcome(value: z.output<typeof toolResult>): string {
  if (!value.ok) return `${value.tool}: refused (${value.refusedReason ?? 'no reason given'})`;
  const lines = value.linesReturned === undefined ? '' : `, ${plural(value.linesReturned, 'line')}`;
  return `${value.tool}: ok${lines}`;
}

/** The handlers for the events of a run's start: the source, the download and the scan. */
const setupHandlers: Readonly<Record<string, Handler>> = {
  'run.started': reading(z.object({ stage: text }), (v) => ({
    kind: 'run',
    label: 'Run started',
    text: `Stage ${v.stage}`,
  })),
  'source.resolved': reading(z.object({ url: text, ref: text, commitSha: text }), (v) => ({
    kind: 'source',
    label: 'Source resolved',
    text: `${v.url} @ ${v.ref}, commit ${sha12(v.commitSha)}`,
  })),
  'source.downloaded': reading(
    z.object({ fileCount: count, totalBytes: count, cached: z.boolean() }),
    (v) => ({
      kind: 'source',
      label: 'Source downloaded',
      text: `${String(v.fileCount)} files, ${String(v.totalBytes)} bytes, ${v.cached ? 'cached' : 'downloaded'}`,
    }),
  ),
  'scan.completed': reading(z.object({ files: count, areas: count }), (v) => ({
    kind: 'scan',
    label: 'Scan completed',
    text: `${String(v.files)} files in ${plural(v.areas, 'area')}`,
  })),
};

const areaData = z.object({ area: text, role: text, model: text });
const agentLine = (v: z.output<typeof areaData>): string => `${v.area}: ${v.role} (${v.model})`;

/** The handlers for an agent's work: its start, turns, tools, cards and end. */
const agentHandlers: Readonly<Record<string, Handler>> = {
  'agent.planned': reading(areaData, (v) => ({
    kind: 'agent',
    label: 'Agent planned',
    text: agentLine(v),
  })),
  'agent.started': reading(areaData, (v) => ({
    kind: 'agent',
    label: 'Agent started',
    text: agentLine(v),
  })),
  'agent.turn': reading(turnData, (v) => ({
    kind: 'turn',
    label: 'Turn',
    text: `Turn ${String(v.turn)}: ${String(v.inputTokens)} tokens in, ${String(v.outputTokens)} out`,
  })),
  'agent.tool.called': reading(toolCalled, (v) => ({
    kind: 'tool',
    label: 'Tool call',
    text: `${v.tool} ${argumentsText(v.args)}`.trim(),
  })),
  'agent.tool.result': reading(toolResult, (v) => ({
    kind: 'tool',
    label: 'Tool result',
    text: toolOutcome(v),
  })),
  'agent.card.proposed': reading(z.object({ cardId: text, title: text, claims: count }), (v) => ({
    kind: 'card',
    label: 'Card proposed',
    text: `${v.cardId} ${v.title} (${plural(v.claims, 'claim')})`,
  })),
  'agent.ended': reading(z.object({ state: text, turns: count, cards: count }), (v) => ({
    kind: 'agent',
    label: 'Agent ended',
    text: `${v.state}, ${plural(v.turns, 'turn')}, ${plural(v.cards, 'card')}`,
  })),
};

const budgetScope = z.object({ scope: text });

/** The handlers for the verifier's checks, the cost and the end of the run. */
const closingHandlers: Readonly<Record<string, Handler>> = {
  'verify.citation.checked': reading(
    z.object({ claimId: text, ok: z.boolean(), reason: text.optional() }),
    (v) => ({
      kind: 'verdict',
      label: 'Citation check',
      text: `${v.claimId}: ${v.ok ? 'citation ok' : `citation invalid${v.reason === undefined ? '' : ` - ${v.reason}`}`}`,
    }),
  ),
  'verify.judgement.started': reading(z.object({ claims: count }), (v) => ({
    kind: 'verdict',
    label: 'Judgement started',
    text: `${String(v.claims)} claims to judge`,
  })),
  'verify.claim.judged': reading(z.object({ claimId: text, status: text, reason: text }), (v) => ({
    kind: 'verdict',
    label: 'Verdict',
    text: `${v.claimId}: ${v.status} - ${v.reason}`,
  })),
  'verify.judgement.ended': reading(
    z.object({ supported: count, rejected: count, unverified: count, notJudged: count }),
    (v) => ({
      kind: 'verdict',
      label: 'Judgement ended',
      text: `${String(v.supported)} supported, ${String(v.rejected)} rejected, ${String(v.unverified)} unverified, ${String(v.notJudged)} not judged`,
    }),
  ),
  'usage.recorded': reading(z.object({ role: text, model: text, costMicros: count }), (v) => ({
    kind: 'cost',
    label: 'Usage',
    text: `${v.role} ${v.model}: ${dollars(v.costMicros)}`,
  })),
  'budget.warning': reading(budgetScope.extend({ sharePercent: count }), (v) => ({
    kind: 'budget',
    label: 'Budget warning',
    text: `${v.scope} at ${String(v.sharePercent)} percent of its cap`,
  })),
  'budget.capReached': reading(
    budgetScope.extend({ capMicros: count, spentMicros: count }),
    (v) => ({
      kind: 'budget',
      label: 'Budget cap reached',
      text: `${v.scope}: spent ${dollars(v.spentMicros)} of ${dollars(v.capMicros)}`,
    }),
  ),
  'question.answered': reading(z.object({ cardId: text }), (v) => ({
    kind: 'question',
    label: 'Question answered',
    text: v.cardId,
  })),
  'run.ended': reading(z.object({ endState: text }), (v) => ({
    kind: 'run',
    label: 'Run ended',
    text: v.endState,
  })),
};

const handlers: Readonly<Record<string, Handler>> = {
  ...setupHandlers,
  ...agentHandlers,
  ...closingHandlers,
};

/** The tokens of a model answer, or 0. */
function tokensOf(event: RunEvent): number {
  const parsed = turnData.safeParse(event.data);
  return event.type === 'agent.turn' && parsed.success
    ? parsed.data.inputTokens + parsed.data.outputTokens
    : 0;
}

const runTotals = z.object({ runTotals: z.object({ costMicros: count }) });
const endTotals = z.object({ totals: z.object({ costMicros: count }) });
const ownCost = z.object({ costMicros: count });

/** The run's cost after the event: its own total when it states one, else the sum of the usage. */
function costAfter(before: number, event: RunEvent): number {
  if (event.type === 'usage.recorded') {
    const total = runTotals.safeParse(event.data);
    if (total.success) return Math.max(before, total.data.runTotals.costMicros);
    const own = ownCost.safeParse(event.data);
    return own.success ? before + own.data.costMicros : before;
  }
  if (event.type === 'run.ended') {
    const total = endTotals.safeParse(event.data);
    return total.success ? Math.max(before, total.data.totals.costMicros) : before;
  }
  return before;
}

function offsetOf(at: string, first: string): number {
  const offset = Date.parse(at) - Date.parse(first);
  return Number.isFinite(offset) && offset > 0 ? offset : 0;
}

const endedData = z.object({ state: text, turns: count, cards: count });

/** The agent after a planned or started event: what the event names, the rest as it was. */
function announced(
  known: ReplayAgent | undefined,
  id: string,
  data: unknown,
): ReplayAgent | undefined {
  const named = areaData.safeParse(data);
  if (!named.success) return known;
  return {
    turns: 0,
    cards: 0,
    ...known,
    agentTaskId: id,
    ...named.data,
    state: known?.state ?? 'Planned',
  };
}

/** The agent after `agent.ended`; an end for an agent never announced is left out. */
function concluded(known: ReplayAgent | undefined, data: unknown): ReplayAgent | undefined {
  const ended = endedData.safeParse(data);
  return known === undefined || !ended.success ? known : { ...known, ...ended.data };
}

function agentsOf(events: readonly RunEvent[]): readonly ReplayAgent[] {
  const agents = new Map<string, ReplayAgent>();
  for (const { agentTaskId, type, data } of events) {
    if (agentTaskId === undefined) continue;
    const known = agents.get(agentTaskId);
    const next =
      type === 'agent.planned' || type === 'agent.started'
        ? announced(known, agentTaskId, data)
        : type === 'agent.ended'
          ? concluded(known, data)
          : known;
    if (next !== undefined) agents.set(agentTaskId, next);
  }
  return [...agents.values()];
}

// RF-506
export function buildReplay(runKey: string, events: readonly RunEvent[]): ReplayModel {
  const first = events[0]?.at ?? '';
  const steps: ReplayStep[] = [];
  let tokens = 0;
  let costMicros = 0;
  for (const event of events) {
    const draft = handlers[event.type]?.(event.data);
    if (draft === undefined) continue;
    tokens += tokensOf(event);
    costMicros = costAfter(costMicros, event);
    steps.push({
      seq: event.seq,
      at: event.at,
      offsetMs: offsetOf(event.at, first),
      ...draft,
      ...(event.agentTaskId === undefined ? {} : { agentTaskId: event.agentTaskId }),
      tokens,
      costMicros,
    });
  }
  return {
    runKey,
    steps,
    agents: agentsOf(events),
    durationMs: steps.at(-1)?.offsetMs ?? 0,
    totalTokens: tokens,
    totalCostMicros: costMicros,
  };
}
