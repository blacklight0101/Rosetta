import { projectOf, templateSettings } from './project-fixtures.js';

// RF-605, RF-606, RF-608, RF-613: the answers the Plan setup page reads, as the server writes them.

const entry = (id: string, group: string, title: string, defaultOn: boolean) => ({
  id,
  group,
  title,
  rule: `Rule of ${title}.`,
  why: `Why of ${title}.`,
  check: `Check of ${title}.`,
  defaultOn,
});

export const catalogue = {
  version: 2026,
  entries: [
    entry('solid', 'design-principles', 'SOLID', true),
    entry('kiss', 'design-principles', 'KISS', true),
    entry('design-patterns', 'design-principles', 'Design patterns', false),
    entry('tdd', 'method', 'TDD, test-driven', true),
    entry('layered', 'architecture-styles', 'Layered (N-tier)', false),
    entry('modular-monolith', 'architecture-styles', 'Modular monolith', false),
    entry('hexagonal', 'architecture-styles', 'Hexagonal', false),
  ],
  migrations: [
    { id: 'strangler-fig', title: 'Strangler Fig', tradeOff: 'Safe, slow start.' },
    { id: 'parallel-change', title: 'Parallel Change', tradeOff: 'Two ways at once.' },
    { id: 'full-rewrite', title: 'Full rewrite', tradeOff: 'Risky, clean.' },
  ],
};

const defaultBrief = {
  savedAt: null,
  catalogueVersion: 2026,
  principles: ['solid', 'kiss', 'tdd'],
  architecture: { style: 'layered', recommended: [], evidence: [] },
  migration: 'strangler-fig',
  stack: [],
  context: {
    teamSize: null,
    experience: null,
    deadline: null,
    keepIntegrations: [],
    dataMigration: null,
  },
  buildMethod: { aiAssisted: false },
  defaulted: [
    'principles',
    'architecture',
    'migration',
    'stack.language-runtime',
    'stack.backend-framework',
    'stack.front-end',
    'stack.database',
    'stack.data-access',
    'stack.testing',
    'stack.hosting',
    'context.teamSize',
    'context.experience',
    'context.deadline',
    'context.keepIntegrations',
    'context.dataMigration',
    'buildMethod',
  ],
};

export const unsavedBrief = { saved: false, outOfDate: false, brief: defaultBrief };

export const savedBrief = {
  saved: true,
  outOfDate: false,
  brief: { ...defaultBrief, savedAt: '2026-10-12T09:00:00.000Z', defaulted: [] },
};

const layers = [
  'language-runtime',
  'backend-framework',
  'front-end',
  'database',
  'data-access',
  'testing',
  'hosting',
];

export const planOptions = {
  architecture: {
    recommended: 'modular-monolith',
    options: [
      {
        style: 'modular-monolith',
        strengths: ['One deployable unit'],
        costs: ['Modules must be policed'],
        evidence: ['BR-001'],
      },
      {
        style: 'hexagonal',
        strengths: ['Ports isolate the domain'],
        costs: ['More types'],
        evidence: ['FEAT-001'],
      },
    ],
  },
  stack: layers.map((layer) => ({ layer, options: [`${layer} A`, `${layer} B`] })),
};

const figure = (micros: string) => ({ inputTokens: 1000, outputTokens: 500, costMicros: micros });
const fits = (low: boolean, likely: boolean, high: boolean) => ({ low, likely, high });

export const planEstimate = {
  priceTableVersion: '2026-10-01',
  currency: 'USD',
  planner: {
    role: 'planner',
    provider: 'fake',
    kind: 'fake',
    model: 'contract-model',
    keySource: 'user',
    priced: true,
    low: figure('90000'),
    likely: figure('180000'),
    high: figure('400000'),
  },
  keyAvailable: true,
  assumptions: { calls: 2 },
  caps: [
    {
      kind: 'run-cost',
      unit: 'micros',
      limit: '2000000',
      spent: '0',
      remaining: '2000000',
      fits: fits(true, true, true),
    },
  ],
  withinCaps: fits(true, true, true),
};

export const cloudEstimate = {
  ...planEstimate,
  planner: { ...planEstimate.planner, provider: 'anthropic', kind: 'anthropic' },
};

export const startedPlanRun = {
  id: '5d1b3f0e-8c2a-4a77-9f3e-0d6a1b2c3d4e',
  runId: 'run-plan-1',
  stage: 'plan',
  queueState: 'queued',
  position: 1,
};

/** The project as `GET /api/projects/:id` answers it: the planner is a local Ollama model. */
export const localProject = projectOf('p-1', 'octo/demo');

/** The same project with an Anthropic planner: its code would leave this machine. */
export const cloudProject = projectOf('p-1', 'octo/demo', {
  settings: {
    ...templateSettings(),
    providers: {
      ...templateSettings().providers,
      anthropic: {
        kind: 'anthropic',
        keySource: 'user-then-server',
        toolMode: 'native',
        timeoutSeconds: 120,
        maxRetries: 3,
      },
    },
    roles: {
      ...templateSettings().roles,
      planner: { provider: 'anthropic', model: 'claude-sonnet', maxOutputTokens: 4096 },
    },
  },
});
