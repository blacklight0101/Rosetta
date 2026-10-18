import { json } from './fake-api.js';
import { runPath } from './live-run-helpers.js';

// RF-231, RF-209: the answers of GET /api/runs/:runId/understanding and POST .../deepen/estimate for
// the page tests (the shapes of src/presentation/web/understanding-view.ts and deepen-routes.ts).

export const understandingPath = `GET ${runPath}/understanding`;
export const estimatePath = `POST ${runPath}/deepen/estimate`;
export const startPath = `POST ${runPath}/deepen`;

const library = { files: 4, tokens: 12_300, claims: 3 };

function figures(change: Record<string, unknown>) {
  return {
    firstPartyCoverage: 0.4231,
    firstPartyTokens: 28_362,
    firstPartyReadTokens: 12_000,
    filesNotReadCount: 12,
    supported: 68,
    rejected: 50,
    supportedShare: 68 / 118,
    notJudged: 3,
    rejectedUnresolved: 41,
    supportedAfterReread: 0,
    thirdParty: library,
    wellCovered: false,
    ...change,
  };
}

export function measures(change: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...figures(change),
    filesNotRead: [
      { path: 'Orders/OrderService.cs', tokens: 1800 },
      { path: 'Catalog/Search.cs', tokens: 900 },
    ],
  };
}

/** The measures as the manifest keeps them for a Deepen: the files not read are only counted. */
function summary(change: Record<string, unknown>) {
  const { filesNotReadCount, ...rest } = figures(change);
  return { ...rest, filesNotRead: filesNotReadCount };
}

export function understanding(measuresBody: unknown, deepen: unknown = null): Response {
  return json(200, { measures: measuresBody, deepen });
}

export const deepenRecord = {
  parentRunId: 'parent-uuid',
  parentRunKey: '20261001-090000-understand',
  maxRounds: 3,
  coveragePass: true,
  roundsDone: 2,
  stopReason: 'noProgress',
  outOfScope: [
    { claimId: 'BR-004.c1', reason: 'Every citation is in third-party or generated code.' },
    { claimId: 'BR-009.c2', reason: 'Every citation is in third-party or generated code.' },
  ],
  rounds: [],
  before: summary({}),
  after: summary({
    firstPartyCoverage: 0.55,
    filesNotReadCount: 7,
    supported: 90,
    rejected: 53,
    notJudged: 0,
    rejectedUnresolved: 21,
    supportedAfterReread: 19,
  }),
};

const point = (cost: number) => ({
  inputTokens: cost / 10,
  outputTokens: cost / 100,
  costMicros: String(cost),
});
const range = (low: number, likely: number, high: number) => ({
  low: point(low),
  likely: point(likely),
  high: point(high),
});

function role(name: string, kind: string, provider: string) {
  return {
    ...{ role: name, provider, kind, model: 'model-x', keySource: 'user', priced: true },
    ...range(1, 2, 3),
  };
}

export const localRoles = ['reader', 'verifier', 'summariser'].map((name) =>
  role(name, 'ollama', 'ollama'),
);
export const cloudRoles = ['reader', 'verifier', 'summariser'].map((name) =>
  role(name, 'openai', 'openai'),
);

export function deepenEstimate(change: Record<string, unknown> = {}): Response {
  return json(200, {
    priceTableVersion: '2026-10-11',
    currency: 'USD',
    maxRounds: 3,
    coveragePass: true,
    plan: { judge: 10, reread: 40, outOfScope: 6, unreadFiles: 12, unreadTokens: 3000 },
    roles: localRoles,
    round: range(200_000, 400_000, 900_000),
    allRounds: range(600_000, 1_200_000, 2_700_000),
    cap: { maxCostMicros: 2_000_000, maxTokens: 1_000_000 },
    overCap: { round: false, allRounds: true },
    ...change,
  });
}
