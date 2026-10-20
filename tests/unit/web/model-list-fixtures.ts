import { screen } from '@testing-library/preact';
import { accountBody, cap } from './admin-fixtures.js';
import { json, type Answer } from './fake-api.js';

// RF-405, DEC-156: the answers of the model lists and the Default models page for the tests of the
// model dropdowns.

const openai = json(200, {
  provider: 'openai',
  models: [
    { model: 'gpt-5-nano', label: 'GPT-5 nano', priced: true },
    { model: 'gpt-5-future', label: 'GPT-5 future', priced: false },
  ],
});
const anthropic = json(200, {
  provider: 'anthropic',
  models: [{ model: 'claude-opus-5-5', label: 'Claude Opus 5.5', priced: false }],
});
const installed = json(200, {
  provider: 'ollama',
  models: [
    { model: 'gemma4:e4b', label: 'gemma4:e4b', priced: true },
    { model: 'qwen3:8b', label: 'qwen3:8b', priced: true },
  ],
});
export const ollamaDown = json(200, {
  provider: 'ollama',
  models: [],
  reason: 'Ollama could not be reached.',
});

export const withRoles = (roles: unknown): Readonly<Record<string, Answer>> => ({
  'GET /api/admin/users': json(200, { users: [accountBody('u-root', 'blacklight')] }),
  'GET /api/admin/caps': json(200, cap('500000', '1000000', '10000000')),
  'GET /api/admin/default-roles': json(200, { roles }),
  'GET /api/models/openai': openai,
  'GET /api/models/anthropic': anthropic,
  'GET /api/models/ollama': installed,
});

export const savedAs = (roles: unknown): Answer => json(200, { roles });

export function selectOf(label: string): HTMLSelectElement {
  const field = screen.getByLabelText(label);
  if (!(field instanceof HTMLSelectElement)) throw new Error(`${label} is not a select.`);
  return field;
}

export const optionTexts = (select: HTMLSelectElement): string[] =>
  Array.from(select.options).map((option) => option.textContent);

export const ready = (): Promise<HTMLElement> => screen.findByLabelText('Reader provider');
