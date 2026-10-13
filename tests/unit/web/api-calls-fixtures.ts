// RF-1011 (P1-37): the answers of the calls and logs routes as the page receives them.

export const runUuid = '2f0c4b1e-0000-4000-8000-0000000000c1';
export const runKey = '20261011-091204-understand';

export const callsPath = `/api/runs/${runUuid}/calls`;
export const logsPath = `/api/runs/${runUuid}/logs`;
export const transcriptPath = (seq: number): string => `${callsPath}/${String(seq)}/transcript`;

export interface CallWire {
  readonly seq: number;
  readonly callId: string;
  readonly attempt: number;
  readonly startedAt: string;
  readonly agentTaskId: string;
  readonly agent: string;
  readonly role: string;
  readonly provider: string;
  readonly kind: string;
  readonly model: string;
  readonly endpointHost: string;
  readonly timeToFirstTokenMs: number;
  readonly latencyMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly costMicros: number;
  readonly currency: string;
  readonly finishReason: string;
  readonly status: 'ok' | 'retried' | 'failed' | 'refused-by-cap';
  readonly errorCode?: string;
  readonly httpStatus?: number;
  readonly ollama?: {
    readonly loadDurationMs: number;
    readonly promptEvalDurationMs: number;
    readonly evalDurationMs: number;
    readonly tokensPerSecond: number;
  };
  readonly hasTranscript: boolean;
}

/** An answered attempt of the OpenAI verifier; no Ollama timings. */
export function cloud(seq: number, overrides: Partial<CallWire> = {}): CallWire {
  return {
    seq,
    callId: `${runKey}#${String(seq)}`,
    attempt: 1,
    startedAt: `2026-10-11T09:18:${String(10 + seq).padStart(2, '0')}.000Z`,
    agentTaskId: 'reader-001',
    agent: 'Catalog',
    role: 'verifier',
    provider: 'cloud',
    kind: 'openai',
    model: 'gpt-test',
    endpointHost: 'api.openai.com',
    timeToFirstTokenMs: 900,
    latencyMs: 2000,
    inputTokens: 2114,
    outputTokens: 186,
    cachedInputTokens: 0,
    costMicros: 5500,
    currency: 'USD',
    finishReason: 'stop',
    status: 'ok',
    hasTranscript: true,
    ...overrides,
  };
}

/** An answered attempt of the local reader, with Ollama's timings. */
export function local(seq: number, overrides: Partial<CallWire> = {}): CallWire {
  return {
    ...cloud(seq),
    role: 'reader',
    provider: 'local',
    kind: 'ollama',
    model: 'qwen3.5:9b',
    endpointHost: 'localhost',
    timeToFirstTokenMs: 1900,
    latencyMs: 4600,
    inputTokens: 7022,
    outputTokens: 98,
    costMicros: 0,
    ollama: {
      loadDurationMs: 210,
      promptEvalDurationMs: 1920,
      evalDurationMs: 3050,
      tokensPerSecond: 38,
    },
    ...overrides,
  };
}

const retried = {
  status: 'retried',
  errorCode: 'RST-1504',
  httpStatus: 429,
  finishReason: 'error',
  timeToFirstTokenMs: 0,
  latencyMs: 300,
  inputTokens: 0,
  outputTokens: 0,
  costMicros: 0,
  hasTranscript: false,
} as const;

const failed = {
  status: 'failed',
  errorCode: 'RST-1505',
  finishReason: 'error',
  timeToFirstTokenMs: 0,
  latencyMs: 30_000,
  inputTokens: 0,
  outputTokens: 0,
  costMicros: 0,
  hasTranscript: false,
} as const;

/** Two local answers, a 429 that was retried, the answer of the retry and a timeout that failed. */
export const sampleCalls: readonly CallWire[] = [
  local(1),
  local(2, { agent: 'Services', agentTaskId: 'reader-002', latencyMs: 3900 }),
  cloud(3, retried),
  cloud(4, { attempt: 2 }),
  cloud(5, { agent: 'Services', agentTaskId: 'reader-002', ...failed }),
];

export const sampleSummary = [
  {
    provider: 'cloud',
    role: 'verifier',
    calls: 3,
    retried: 1,
    failed: 1,
    refused: 0,
    errors: 2,
    latencyP50Ms: 2000,
    latencyP95Ms: 2000,
    firstTokenP50Ms: 900,
    firstTokenP95Ms: 900,
    tokensPerSecond: null,
    inputTokens: 7022,
    outputTokens: 98,
    costMicros: 5500,
  },
  {
    provider: 'local',
    role: 'reader',
    calls: 2,
    retried: 0,
    failed: 0,
    refused: 0,
    errors: 0,
    latencyP50Ms: 3900,
    latencyP95Ms: 4600,
    firstTokenP50Ms: 1900,
    firstTokenP95Ms: 1900,
    tokensPerSecond: 38,
    inputTokens: 14044,
    outputTokens: 196,
    costMicros: 0,
  },
] as const;

export function callsBody(
  overrides: Record<string, unknown> = {},
  calls: readonly CallWire[] = sampleCalls,
) {
  return {
    runKey,
    runState: 'Running',
    total: calls.length,
    calls,
    summary: sampleSummary,
    ...overrides,
  };
}

export interface LogWire {
  readonly at: string;
  readonly level: 'debug' | 'info' | 'warn' | 'error';
  readonly logger: string;
  readonly message: string;
  readonly code?: string;
}

export const sampleLogs: readonly LogWire[] = [
  { at: '2026-10-11T09:12:04.002Z', level: 'info', logger: 'runs', message: 'Run started.' },
  { at: '2026-10-11T09:12:05.100Z', level: 'debug', logger: 'agent', message: 'Turn 1 begins.' },
  {
    at: '2026-10-11T09:18:12.077Z',
    level: 'warn',
    logger: 'security',
    code: 'RST-2101',
    message: 'Masked a <b>password</b> before it was sent.',
  },
  {
    at: '2026-10-11T09:18:28.911Z',
    level: 'warn',
    logger: 'provider.openai',
    code: 'RST-1504',
    message: 'Rate limited, retry in 2.4 s.',
  },
  {
    at: '2026-10-11T09:17:51.630Z',
    level: 'error',
    logger: 'provider.openai',
    code: 'RST-1505',
    message: 'Timeout after 30 s.',
  },
];

export function logsBody(overrides: Record<string, unknown> = {}) {
  return {
    runKey,
    runState: 'Running',
    total: sampleLogs.length,
    entries: sampleLogs,
    counts: { debug: 1, info: 1, warn: 2, error: 1 },
    securityEvents: 1,
    ...overrides,
  };
}
