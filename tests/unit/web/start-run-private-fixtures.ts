import { json } from './fake-api.js';
import { projectOf, templateSettings } from './project-fixtures.js';
import { estimateOf, roleOf, type RoleBody } from './start-run-fixtures.js';

// The answers the second confirmation of the start page reads (RF-132): an uploaded project whose
// settings use cloud providers, and the estimates of its roles.

const free = ['0', '0', '0'] as const;
const paid = ['120000', '100000', '800000'] as const;

const ollamaReader: RoleBody = roleOf({
  ...{ role: 'reader', provider: 'ollama', kind: 'ollama', model: 'gemma4:e4b', costs: free },
});
const ollamaVerifier: RoleBody = roleOf({
  ...{ role: 'verifier', provider: 'ollama', kind: 'ollama', model: 'gemma4:e4b', costs: free },
});
const openAiReader: RoleBody = roleOf({
  ...{ role: 'reader', provider: 'openai', kind: 'openai', model: 'gpt-5-nano', costs: paid },
  keySource: 'server',
});
const anthropicVerifier: RoleBody = roleOf({
  ...{ role: 'verifier', provider: 'anthropic', kind: 'anthropic', model: 'claude-x' },
  ...{ costs: paid, keySource: 'server' },
});

/** The reader on OpenAI, the verifier on Ollama. */
export const oneCloudRole = estimateOf([openAiReader, ollamaVerifier]);
/** The reader on OpenAI and the verifier on Anthropic. */
export const twoCloudProviders = estimateOf([openAiReader, anthropicVerifier]);
/** Every role on Ollama. */
export const allLocalRoles = estimateOf([ollamaReader, ollamaVerifier]);

/** The zip the project holds (RF-128); without one Start stays off. */
const stored = { fileName: 'orderdesk.zip', uploadedAt: '2026-10-19T09:00:00.000Z' };

function cloudSettings(): Record<string, unknown> {
  const settings = templateSettings();
  const openai = { ...settings.providers.ollama, kind: 'openai', keySource: 'user-then-server' };
  const role = (maxOutputTokens: number) => ({
    provider: 'openai',
    model: 'gpt-5-nano',
    maxOutputTokens,
  });
  return {
    ...settings,
    providers: { ollama: settings.providers.ollama, openai },
    roles: {
      reader: { ...role(4096), maxTurns: 12 },
      verifier: role(2048),
      planner: role(16384),
      summariser: role(2048),
    },
  };
}

/** An uploaded project named OrderDesk whose roles all use OpenAI. */
export const uploadProject = projectOf('p-1', 'OrderDesk', {
  sourceKind: 'upload',
  sourceUrl: '',
  source: stored,
  settings: cloudSettings(),
});

export const uploadProjectAnswer = json(200, uploadProject);

/** The same project after the switch to Ollama: every role on `ollama`, its model `gemma4:e4b`. */
export const uploadProjectOnOllama = projectOf('p-1', 'OrderDesk', {
  sourceKind: 'upload',
  sourceUrl: '',
  source: stored,
  settingsVersion: 2,
  settings: templateSettings(),
});
