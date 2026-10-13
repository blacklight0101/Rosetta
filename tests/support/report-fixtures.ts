import type { ReplayModel, ReplayStep } from '../../src/application/report/replay-model.js';
import type { ReportCard, ReportModel } from '../../src/application/report/report-model.js';

// RF-504, RF-506, RF-507: report models of tests, made by hand so a test of a page writer does not
// depend on the code that builds a replay from events. A test overrides what it needs.

const counts = { Proposed: 0, CitationInvalid: 0, Supported: 1, Rejected: 0, Unverified: 0 };

export const plainCard: ReportCard = {
  id: 'BR-001',
  type: 'BR',
  title: 'Free shipping over 50',
  area: 'orders',
  path: 'cards/BR/BR-001.md',
  claimCounts: counts,
};

/** Text with a script element, an event-handler attribute and a `javascript:` link. */
export const hostileText =
  "<script>window.__pwned = 'script'</script> <img src=x onerror=\"window.__pwned='onerror'\"> [click](javascript:window.__pwned='link')";

export const hostileCard: ReportCard = {
  ...plainCard,
  id: 'BR-002',
  title: hostileText,
  path: 'cards/BR/BR-002.md',
};

function step(seq: number, overrides: Partial<ReplayStep> = {}): ReplayStep {
  return {
    seq,
    at: `2026-10-12T10:00:${String(seq * 2).padStart(2, '0')}.000Z`,
    offsetMs: (seq - 1) * 2000,
    kind: 'turn',
    label: 'Turn',
    text: `Turn ${String(seq)}: 100 tokens in, 10 out`,
    tokens: seq * 110,
    costMicros: seq * 500,
    ...overrides,
  };
}

export function plainReplay(overrides: Partial<ReplayModel> = {}): ReplayModel {
  return {
    runKey: '20261012-100000-understand',
    steps: [
      step(1, { kind: 'run', label: 'Run started', text: 'Stage understand' }),
      step(2, { agentTaskId: 'task-orders' }),
      step(3, { kind: 'run', label: 'Run ended', text: 'Completed' }),
    ],
    agents: [
      {
        agentTaskId: 'task-orders',
        area: 'orders',
        role: 'reader',
        model: 'model-a',
        state: 'Done',
        turns: 1,
        cards: 1,
      },
    ],
    durationMs: 4000,
    totalTokens: 330,
    totalCostMicros: 1500,
    ...overrides,
  };
}

export function reportModel(overrides: Partial<ReportModel> = {}): ReportModel {
  return {
    runKey: '20261012-100000-understand',
    stage: 'understand',
    endState: 'Completed',
    startedAt: '2026-10-12T10:00:00.000Z',
    endedAt: '2026-10-12T10:00:48.000Z',
    source: {
      url: 'https://github.com/octo/demo',
      commitSha: '3f786850e387550fdab836ed7e6dc881de23001b',
    },
    totals: { inputTokens: 3600, outputTokens: 330, costMicros: 4000, calls: 3 },
    documents: { spec: true, coverage: false, cost: true },
    cards: [plainCard],
    areas: [],
    replay: plainReplay(),
    ...overrides,
  };
}
