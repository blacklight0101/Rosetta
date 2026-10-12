// The projects the page tests use: the shape of `GET /api/projects` (project-routes.ts) with the
// settings document of templates/project-settings.json (data-model.md section 3.1), shortened to
// the one provider the default roles use.

export function templateSettings() {
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

export function projectOf(id: string, name: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name,
    sourceUrl: `https://github.com/${name}`,
    ref: '',
    subpath: '',
    settings: templateSettings(),
    createdAt: '2026-10-12T09:30:00.000Z',
    updatedAt: '2026-10-12T09:30:00.000Z',
    ...overrides,
  };
}
