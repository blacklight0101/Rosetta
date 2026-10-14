import { fileURLToPath } from 'node:url';
import type { Project } from '../../src/application/projects/project.js';
import { settingsForNewProject } from '../../src/application/projects/default-settings.js';
import type { ProjectSettings } from '../../src/application/projects/project-settings.js';
import { loadProjectTemplate } from '../../src/infrastructure/files/project-template.js';
import { fixtureNow } from './account-fixtures.js';

// RF-010, RF-002: the shipped template (`templates/`) as the valid project settings of tests, and
// projects built from it. A test that needs an invalid document edits a copy with `settingsWith`.

const templatesFolder = fileURLToPath(new URL('../../templates/', import.meta.url));

/** The shipped default settings: what `CreateProject` stores before the server defaults apply. */
export const templateSettings: ProjectSettings = await loadProjectTemplate(templatesFolder);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A copy of the template as plain JSON with some fields set: keys are dotted paths
 * (`budget.run.maxCostMicros`), a value of `undefined` removes the field.
 */
export function settingsWith(changes: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const copy: unknown = JSON.parse(JSON.stringify(templateSettings));
  if (!isRecord(copy)) throw new Error('The template is not an object');
  for (const [path, value] of Object.entries(changes)) {
    const names = path.split('.');
    const last = names.pop() ?? '';
    let target: unknown = copy;
    for (const name of names) target = isRecord(target) ? target[name] : undefined;
    if (!isRecord(target)) throw new Error(`The template has no ${path}`);
    if (value === undefined) Reflect.deleteProperty(target, last);
    else target[last] = value;
  }
  return copy;
}

/** DEC-117: the top of the run cost cap, 100 USD in micros. */
export const maxRunCostMicros = 100_000_000;

let projectCount = 0;

/** A valid project with generated values; a test overrides what it needs. */
export function sampleProject(overrides: Partial<Project> = {}): Project {
  projectCount += 1;
  const number = String(projectCount).padStart(12, '0');
  return {
    id: `00000000-0000-4000-a000-${number}`,
    userId: '00000000-0000-4000-9000-000000000001',
    name: `owner/repo-${number}`,
    sourceUrl: `https://github.com/owner/repo-${number}`,
    ref: '',
    subpath: '',
    settings: templateSettings,
    settingsVersion: 1,
    createdAt: fixtureNow,
    updatedAt: fixtureNow,
    ...overrides,
  };
}

/** The settings a new project gets when the server has no default models: the template, reduced. */
export const newProjectSettings: ProjectSettings = settingsForNewProject(templateSettings, {});
