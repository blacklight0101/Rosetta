import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import {
  parseProjectSettings,
  type ProjectSettings,
} from '../../../src/application/projects/project-settings.js';
import { OLLAMA_OUTPUT_TOKENS } from '../../../src/application/models/role-limits.js';
import { formatAmount, ranges, templateDefaults } from '../../../web/src/pages/setting-limits.js';

// RF-002, DEC-116, DEC-117, P2-15: the sliders start at the values of the settings template and are
// bounded by the ranges the server accepts, so a slider never offers a value the server refuses.

// Vitest runs from the repository root. The template file is read as data, so the defaults are
// compared with what the file says, path by path.
const raw: unknown = JSON.parse(
  await readFile(resolve(process.cwd(), 'templates/project-settings.json'), 'utf8'),
);

function at(node: unknown, path: readonly string[]): unknown {
  return path.reduce<unknown>(
    (current, key) =>
      typeof current === 'object' && current !== null ? Reflect.get(current, key) : undefined,
    node,
  );
}

// The template file has no ignore rules, which the schema requires; the range checks only need a
// valid document, so the typed base gets an empty set (it has no bearing on the numbers).
function withIgnoreRules(node: unknown): unknown {
  const scan = at(node, ['scan']);
  if (typeof node !== 'object' || node === null || typeof scan !== 'object' || scan === null) {
    return node;
  }
  return { ...node, scan: { ...scan, ignoreRules: '' } };
}

const parsedBase = parseProjectSettings(withIgnoreRules(raw));
if (!parsedBase.ok) throw new Error('The settings template does not parse.');
const base: ProjectSettings = parsedBase.value;

const DOLLAR = 1_000_000;
const micros = (dollars: number): number => Math.round(dollars * DOLLAR);

// RF-002, P2-29: an amount of a sentence groups its thousands, as a count does.
it('RF-002 an amount of a thousand dollars or more groups its thousands', () => {
  expect(formatAmount(1234.5, 'dollars')).toBe('$1,234.50');
  expect(formatAmount(-1_000_000, 'dollars')).toBe('-$1,000,000.00');
});

it('RF-002 the slider defaults equal the values of the settings template', () => {
  // Q-57: the template stores no output limit; the slider default is the Ollama default.
  expect(at(raw, ['roles', 'reader', 'maxOutputTokens'])).toBeUndefined();
  expect(templateDefaults.maxOutputTokens).toEqual(OLLAMA_OUTPUT_TOKENS);
  expect(at(raw, ['roles', 'reader', 'maxTurns'])).toBe(templateDefaults.maxTurns);
  expect(at(raw, ['budget', 'run', 'maxCostMicros'])).toBe(micros(templateDefaults.runCost));
  expect(at(raw, ['budget', 'run', 'maxTokens'])).toBe(templateDefaults.runTokens);
  expect(at(raw, ['budget', 'confirmAboveCostMicros'])).toBe(micros(templateDefaults.confirmAbove));
  expect(at(raw, ['scan', 'maxFileBytes'])).toBe(templateDefaults.maxFileBytes);
  expect(at(raw, ['scan', 'areaTokenBudget'])).toBe(templateDefaults.areaTokenBudget);
  expect(at(raw, ['scan', 'excerptMaxLines'])).toBe(templateDefaults.excerptMaxLines);
  expect(at(raw, ['agents', 'parallelism'])).toBe(templateDefaults.parallelism);
});

// Each setting: the document with that one value set (dollars for the amounts).
// The confirm threshold may not be above the run cost cap (DEC-117), so it is brought down with it.
const withRunCap = (dollars: number): ProjectSettings => ({
  ...base,
  budget: {
    ...base.budget,
    run: { ...base.budget.run, maxCostMicros: micros(dollars) },
    confirmAboveCostMicros: Math.min(base.budget.confirmAboveCostMicros, micros(dollars)),
  },
});

const cases: readonly {
  readonly name: string;
  readonly range: { readonly min: number; readonly max: number; readonly step: number };
  readonly document: (value: number) => ProjectSettings;
}[] = [
  {
    name: 'maxOutputTokens',
    range: ranges.maxOutputTokens,
    document: (value) => ({
      ...base,
      roles: { ...base.roles, verifier: { ...base.roles.verifier, maxOutputTokens: value } },
    }),
  },
  {
    name: 'maxTurns',
    range: ranges.maxTurns,
    document: (value) => ({
      ...base,
      roles: { ...base.roles, reader: { ...base.roles.reader, maxTurns: value } },
    }),
  },
  { name: 'runCost', range: ranges.runCost, document: (value) => withRunCap(value) },
  {
    name: 'confirmAbove',
    range: ranges.confirmAbove,
    document: (value) => ({
      ...withRunCap(ranges.runCost.max),
      budget: {
        ...withRunCap(ranges.runCost.max).budget,
        confirmAboveCostMicros: micros(value),
      },
    }),
  },
  {
    name: 'runTokens',
    range: ranges.runTokens,
    document: (value) => ({
      ...base,
      budget: { ...base.budget, run: { ...base.budget.run, maxTokens: value } },
    }),
  },
  {
    name: 'maxFileBytes',
    range: ranges.maxFileBytes,
    document: (value) => ({ ...base, scan: { ...base.scan, maxFileBytes: value } }),
  },
  {
    name: 'areaTokenBudget',
    range: ranges.areaTokenBudget,
    document: (value) => ({ ...base, scan: { ...base.scan, areaTokenBudget: value } }),
  },
  {
    name: 'excerptMaxLines',
    range: ranges.excerptMaxLines,
    document: (value) => ({ ...base, scan: { ...base.scan, excerptMaxLines: value } }),
  },
  {
    name: 'parallelism',
    range: ranges.parallelism,
    document: (value) => ({ ...base, agents: { parallelism: value } }),
  },
];

const accepted = (document: ProjectSettings): boolean => parseProjectSettings(document).ok;

it('RF-002 each slider range is the range the server accepts, edges included', () => {
  for (const { name, range, document } of cases) {
    expect(accepted(document(range.min)), `${name} at its minimum`).toBe(true);
    expect(accepted(document(range.max)), `${name} at its maximum`).toBe(true);
    expect(accepted(document(range.min - range.step)), `${name} below its minimum`).toBe(false);
    expect(accepted(document(range.max + range.step)), `${name} above its maximum`).toBe(false);
  }
});
