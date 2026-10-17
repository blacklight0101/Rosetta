import type { ReplayModel, ReplayStep } from '../../src/application/report/replay-model.js';
import type {
  ReportCard,
  ReportCost,
  ReportCoverage,
  ReportModel,
  ReportProjectTotals,
  ReportQuestion,
} from '../../src/application/report/report-model.js';

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
    generatedAt: '2026-10-12T11:00:00.000Z',
    coverage: plainCoverage,
    cost: plainCost,
    projectTotals: plainProjectTotals,
    questions: plainQuestions,
    ...overrides,
  };
}

// RF-500, RF-1010: the dashboard, question and cost parts of a report model.

export const plainCoverage: ReportCoverage = {
  filesListed: 5,
  filesRead: 4,
  readTokenShare: 0.81,
  areas: [
    { area: 'orders', filesListed: 3, filesRead: 3, readTokenShare: 1 },
    { area: 'catalog', filesListed: 2, filesRead: 1, readTokenShare: 0.4, note: 'not read' },
  ],
};

export const plainQuestions: readonly ReportQuestion[] = [
  {
    cardId: 'OQ-001',
    question: 'Is a catalog item with zero stock still shown?',
    context: 'Catalog/List.cs:10-12 filters on price only',
    answer: '',
  },
  {
    cardId: 'OQ-002',
    question: 'Is the mock catalog service used in production?',
    context: 'Services/MockCatalog.cs:1-30 registers the mock',
    answer: 'No, demo only.',
  },
];

const costLine = { inputTokens: 3000, outputTokens: 300, cachedInputTokens: 600, calls: 2 };

export const plainCost: ReportCost = {
  currency: 'USD',
  priceTableVersion: '2026-10-01',
  totals: {
    inputTokens: 3600,
    outputTokens: 330,
    cachedInputTokens: 600,
    cacheWriteInputTokens: 120,
    calls: 3,
    costMicros: 4000,
    cacheWriteCostMicros: 300,
    unpricedCalls: 0,
  },
  byRole: [
    { key: 'reader', ...costLine, costMicros: 3000 },
    {
      key: 'verifier',
      inputTokens: 600,
      outputTokens: 30,
      cachedInputTokens: 0,
      calls: 1,
      costMicros: 1000,
    },
  ],
  byProvider: [{ key: 'fake', ...costLine, calls: 3, costMicros: 4000 }],
  byModel: [{ key: 'fake model-a', ...costLine, calls: 3, costMicros: 4000 }],
};

const plainProjectTotals: ReportProjectTotals = {
  calls: 12,
  inputTokens: 1_000_000,
  outputTokens: 310_000,
  cachedInputTokens: 0,
  cost: [{ currency: 'USD', costMicros: 3_990_000 }],
  unknownCostCalls: 0,
};
