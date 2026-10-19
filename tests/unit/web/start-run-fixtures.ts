import { failure, json } from './fake-api.js';
import { projectOf, templateSettings } from './project-fixtures.js';

// The answers the start page reads (project-routes.ts, run-routes.ts, estimate-view.ts): a project,
// the estimate of an understand run, an account daily cap and the run answers. Costs are decimal
// strings of micro-dollars.

export const projectPath = '/api/projects/p-1';
export const estimatePath = `${projectPath}/estimate`;
export const runsPath = `${projectPath}/runs`;

interface PointBody {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costMicros: string;
}

export interface RoleBody extends PointRange {
  readonly role: string;
  readonly provider: string;
  readonly kind: string;
  readonly model: string;
  readonly keySource: string;
  readonly priced: boolean;
}

interface PointRange {
  readonly low: PointBody;
  readonly likely: PointBody;
  readonly high: PointBody;
}

const point = (inputTokens: number, outputTokens: number, costMicros: string): PointBody => ({
  inputTokens,
  outputTokens,
  costMicros,
});

interface RoleOptions {
  readonly role: 'reader' | 'verifier';
  readonly provider: string;
  readonly kind: string;
  readonly model: string;
  readonly keySource?: string;
  readonly priced?: boolean;
  readonly costs: readonly [string, string, string];
}

export function roleOf(options: RoleOptions): RoleBody {
  const { role, provider, kind, model, costs } = options;
  const [low, likely, high] = costs;
  return {
    ...{ role, provider, kind, model },
    keySource: options.keySource ?? 'none',
    priced: options.priced ?? true,
    low: point(10_000, 1_000, low),
    likely: point(20_000, 2_000, likely),
    high: point(40_000, 4_000, high),
  };
}

const sum = (parts: readonly string[]): string =>
  parts.reduce((total, each) => total + BigInt(each), 0n).toString();

export function estimateOf(roles: readonly RoleBody[]): Record<string, unknown> {
  return {
    codeMap: { scannerVersion: 1, currentScannerVersion: 1, outdated: false },
    priceTableVersion: '2026-10-11',
    currency: 'USD',
    areas: [
      { name: 'Catalog', estimatedTokens: 12_000, files: 5, thirdParty: false },
      { name: 'Models', estimatedTokens: 8000, files: 3, thirdParty: false },
    ],
    assumptions: {
      turnsPerArea: { low: 4, likely: 8, high: 12 },
      outputTokensPerTurn: { low: 100, likely: 200, high: 400 },
      readSharePercent: { low: 30, likely: 50, high: 80 },
      verifierSharePercent: { low: 20, likely: 30, high: 50 },
      promptOverheadTokens: 1500,
      surfacePromptTokens: 900,
      surfaceOutputTokens: { low: 300, likely: 800, high: 2000 },
      contextLimitTokens: 6000,
      parallelism: 1,
      cachedInputPercent: 0,
    },
    roles,
    total: {
      low: point(20_000, 2000, sum(roles.map((role) => role.low.costMicros))),
      likely: point(40_000, 4000, sum(roles.map((role) => role.likely.costMicros))),
      high: point(80_000, 8000, sum(roles.map((role) => role.high.costMicros))),
    },
  };
}

/** Local reader on Ollama, nothing to pay. */
export const localEstimate = estimateOf([
  roleOf({
    role: 'reader',
    provider: 'ollama',
    kind: 'ollama',
    model: 'gemma4:e4b',
    costs: ['0', '0', '0'],
  }),
  roleOf({
    role: 'verifier',
    provider: 'ollama',
    kind: 'ollama',
    model: 'gemma4:e4b',
    costs: ['0', '0', '0'],
  }),
]);

/** Reader on OpenAI with the server's key: $0.12, $0.39 and $0.80. */
export const cloudEstimate = estimateOf([
  roleOf({
    role: 'reader',
    provider: 'openai',
    kind: 'openai',
    model: 'gpt-5-nano',
    keySource: 'server',
    costs: ['120000', '390000', '800000'],
  }),
  roleOf({
    role: 'verifier',
    provider: 'ollama',
    kind: 'ollama',
    model: 'gemma4:e4b',
    costs: ['0', '0', '0'],
  }),
]);

/** The reader on OpenAI with the server's key whose likely cost is `likely` micro-dollars. */
export const cloudEstimateAt = (likely: string): Record<string, unknown> =>
  estimateOf([
    roleOf({
      role: 'reader',
      provider: 'openai',
      kind: 'openai',
      model: 'gpt-5-nano',
      keySource: 'server',
      costs: ['120000', likely, '2000000'],
    }),
  ]);

/** The reader is priced ($0.39 likely); the verifier is on OpenAI too, with a model without a price. */
export const cloudWithUnpricedVerifier = estimateOf([
  roleOf({
    role: 'reader',
    provider: 'openai',
    kind: 'openai',
    model: 'gpt-5-nano',
    keySource: 'server',
    costs: ['120000', '390000', '800000'],
  }),
  roleOf({
    role: 'verifier',
    provider: 'openai',
    kind: 'openai',
    model: 'gpt-mystery',
    keySource: 'server',
    priced: false,
    costs: ['0', '0', '0'],
  }),
]);

/** The same with the reader's own key. */
export const ownKeyEstimate = estimateOf([
  roleOf({
    role: 'reader',
    provider: 'openai',
    kind: 'openai',
    model: 'gpt-5-nano',
    keySource: 'user',
    costs: ['120000', '390000', '800000'],
  }),
]);

/** A cloud verifier whose model has no price: its cost is zero and `priced` is false. */
export const unpricedEstimate = estimateOf([
  roleOf({
    role: 'reader',
    provider: 'ollama',
    kind: 'ollama',
    model: 'gemma4:e4b',
    costs: ['0', '0', '0'],
  }),
  roleOf({
    role: 'verifier',
    provider: 'anthropic',
    kind: 'anthropic',
    model: 'claude-mystery',
    keySource: 'server',
    priced: false,
    costs: ['0', '0', '0'],
  }),
]);

export const project = projectOf('p-1', 'octo/demo', { ref: 'main', subpath: 'src/legacy' });

export const projectAnswer = json(200, project);
export const noCodeMap = failure(409, 'RST-1203');

interface LimitsOptions {
  /** What is left of the user's day on the server's keys, of a $1.00 cap. */
  readonly dayLeft?: string;
  /** What is left of the server's month on its keys. */
  readonly monthLeft?: string;
  /** The user's own daily cap and what they spent on their own keys today; none by default. */
  readonly ownDay?: { readonly cap: string; readonly spent: string };
}

/** `GET /api/account/limits` (limit-routes.ts): amounts are decimal strings of micro-dollars. */
export function limitsAnswer(options: LimitsOptions = {}): Response {
  const { dayLeft = '1000000', monthLeft = '10000000', ownDay } = options;
  const own =
    ownDay === undefined
      ? null
      : {
          capMicros: ownDay.cap,
          spentMicros: ownDay.spent,
          remainingMicros: (BigInt(ownDay.cap) - BigInt(ownDay.spent)).toString(),
        };
  return json(200, {
    serverKeys: {
      userDay: {
        capMicros: '1000000',
        spentMicros: (1_000_000n - BigInt(dayLeft)).toString(),
        remainingMicros: dayLeft,
      },
      serverMonth: { remainingMicros: monthLeft },
    },
    ownKeys: { day: own },
  });
}

/** Nothing spent: the whole default day and month are left. */
export const roomyLimits = limitsAnswer();

/** The settings document of the fixture project with a run cap of $2.00. */
export function projectWithCap(capMicros: number): Record<string, unknown> {
  const settings = templateSettings();
  return projectOf('p-1', 'octo/demo', {
    settings: {
      ...settings,
      budget: { ...settings.budget, run: { maxCostMicros: capMicros, maxTokens: 2_000_000 } },
    },
  });
}

/** What `POST /api/projects/:id/runs` answers (runView and the position). */
export function runAnswer(
  stage: string,
  position: number | null,
  runKey = '20261012-100000-scan',
): Response {
  return json(202, {
    id: 'r-1',
    projectId: 'p-1',
    runId: runKey,
    stage,
    queueState: position === null ? 'Running' : 'Queued',
    endState: null,
    queuedAt: '2026-10-12T10:00:00.000Z',
    startedAt: position === null ? '2026-10-12T10:00:01.000Z' : null,
    endedAt: null,
    commitSha: null,
    totals: { costMicros: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
    position,
  });
}

/** The fixture project after another session changed the reader model and the area token budget. */
export function changedElsewhere(): Record<string, unknown> {
  const settings = templateSettings();
  return projectOf('p-1', 'octo/demo', {
    settings: {
      ...settings,
      roles: {
        ...settings.roles,
        reader: { ...settings.roles.reader, model: 'changed-elsewhere' },
      },
      scan: { ...settings.scan, areaTokenBudget: 12_345 },
    },
  });
}
