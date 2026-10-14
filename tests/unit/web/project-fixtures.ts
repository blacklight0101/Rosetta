// The projects the page tests use: the shape of `GET /api/projects` (project-routes.ts) with the
// settings document of templates/project-settings.json (data-model.md section 3.1), shortened to
// the one provider the default roles use.

function buildTemplate() {
  const role = (maxOutputTokens: number) => ({
    provider: 'ollama',
    model: 'gemma4:e4b',
    maxOutputTokens,
  });
  return {
    schemaVersion: 1,
    providers: {
      ollama: {
        kind: 'ollama',
        keySource: 'user-then-server',
        toolMode: 'native',
        timeoutSeconds: 120,
        maxRetries: 3,
        contextTokens: 'auto',
      },
    },
    roles: {
      reader: { ...role(4096), maxTurns: 12 },
      verifier: role(2048),
      planner: role(4096),
      summariser: role(2048),
    },
    budget: {
      run: { maxCostMicros: 500_000, maxTokens: 2_000_000 },
      confirmAboveCostMicros: 250_000,
      allowUnpriced: false,
    },
    scan: {
      maxFileBytes: 1_000_000,
      areaTokenBudget: 60_000,
      excerptMaxLines: 400,
      ignoreRules: 'node_modules/\nbin/\nobj/\n',
      allowDenied: [],
    },
    agents: { parallelism: 1 },
    output: { transcripts: true },
  };
}

type TemplateSettings = ReturnType<typeof buildTemplate>;

export function templateSettings(): TemplateSettings {
  return buildTemplate();
}

export function projectOf(
  id: string,
  name: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    name,
    sourceUrl: `https://github.com/${name}`,
    ref: '',
    subpath: '',
    settings: templateSettings(),
    settingsVersion: 1,
    createdAt: '2026-10-12T09:30:00.000Z',
    updatedAt: '2026-10-12T09:30:00.000Z',
    ...overrides,
  };
}

/** The totals of a project without a call: what `GET /api/projects/overview` answers for one. */
const zeroTotals = {
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cachedInputTokens: 0,
  cost: [],
  unknownCostCalls: 0,
  priceTableVersions: [],
};

/** A row of `GET /api/projects/overview`: the project, its run count, totals and latest run. */
export function overviewRow(
  project: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { project, runs: 0, totals: zeroTotals, lastRun: null, ...overrides };
}

/** The latest run of an overview row; a queued one carries its `position`. */
export function lastRunOf(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'r-1',
    runId: '20261012-093000-scan',
    stage: 'scan',
    queueState: 'Ended',
    endState: 'Completed',
    queuedAt: '2026-10-12T09:30:00.000Z',
    startedAt: '2026-10-12T09:30:00.000Z',
    endedAt: '2026-10-12T09:31:00.000Z',
    position: null,
    ...overrides,
  };
}
