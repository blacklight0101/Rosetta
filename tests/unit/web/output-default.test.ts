import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import type { AgentRole } from '../../../src/application/ports/llm-provider.js';
import type { ModelList } from '../../../src/application/models/model-list.js';
import { roleLimits } from '../../../src/application/models/role-limits.js';
import {
  parseProjectSettings,
  type ProjectSettings,
} from '../../../src/application/projects/project-settings.js';
import { builtInOutput } from '../../../web/src/pages/setting-limits.js';

// RF-436, RF-405, Q-57, P8-76: the number the settings page shows for an output limit the project
// does not set is the limit a run gives the role, for every role, provider kind and model maximum.

const list: ModelList = {
  version: '2026-11-08',
  models: [
    { provider: 'anthropic', model: 'big', label: 'Big', maxOutputTokens: 128_000 },
    { provider: 'anthropic', model: 'bare', label: 'Bare' },
    { provider: 'openai', model: 'small', label: 'Small', maxOutputTokens: 3_000 },
    { provider: 'openai', model: 'edge', label: 'Edge', maxOutputTokens: 8_193 },
  ],
};

// Vitest runs from the repository root; the template is read as data (as settings-limits.test.ts does).
const raw: unknown = JSON.parse(
  await readFile(resolve(process.cwd(), 'templates/project-settings.json'), 'utf8'),
);
/** The template has no ignore rules, which the schema requires; they have no bearing on the limits. */
function withIgnoreRules(node: unknown): unknown {
  if (typeof node !== 'object' || node === null) return node;
  const scan: unknown = Reflect.get(node, 'scan');
  if (typeof scan !== 'object' || scan === null) return node;
  return { ...node, scan: { ...scan, ignoreRules: '' } };
}
const parsed = parseProjectSettings(withIgnoreRules(raw));
if (!parsed.ok) throw new Error('The settings template does not parse.');
const template: ProjectSettings = parsed.value;

/** The template with one role on this provider and model and no output limit stored. */
function settingsFor(role: AgentRole, provider: string, model: string): ProjectSettings {
  return { ...template, roles: { ...template.roles, [role]: { provider, model } } };
}

const roles: readonly AgentRole[] = ['reader', 'verifier', 'planner', 'summariser'];
const choices = [
  { provider: 'anthropic', model: 'big' },
  { provider: 'anthropic', model: 'bare' },
  { provider: 'openai', model: 'small' },
  { provider: 'openai', model: 'edge' },
  { provider: 'ollama', model: 'gemma4:e4b' },
  { provider: 'openai-compatible', model: 'local-llm' },
] as const;

const maximumOf = (model: string): number | undefined =>
  list.models.find((entry) => entry.model === model)?.maxOutputTokens;

it('RF-436 the default an unset output field shows is the limit the run gives the role', () => {
  for (const role of roles) {
    for (const choice of choices) {
      const settings = settingsFor(role, choice.provider, choice.model);
      const runs = roleLimits(settings, role, list).maxOutputTokens;
      const kind = settings.providers[choice.provider]?.kind;
      expect(builtInOutput(role, kind, maximumOf(choice.model)), `${role} ${choice.model}`).toBe(
        runs,
      );
    }
  }
});

it('RF-436 a hosted reader shows 8,192 and an Ollama reader 4,096', () => {
  expect(builtInOutput('reader', 'anthropic', 128_000)).toBe(8_192);
  expect(builtInOutput('reader', 'ollama', undefined)).toBe(4_096);
  expect(builtInOutput('verifier', 'openai', 3_000)).toBe(3_000);
});
