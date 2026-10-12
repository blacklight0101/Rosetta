import { createHash } from 'node:crypto';
import { cp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { catalogueGroups, defaultPrinciples } from '../../../../src/domain/planning/catalogue.js';
import { loadCatalogue } from '../../../../src/infrastructure/prompts/catalogue-files.js';
import { failureOf } from '../../../support/failure-of.js';
import { principleFileText } from '../../../support/catalogue-fixtures.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-606, DEC-73, DEC-74, DEC-84, DEC-85: the shipped catalogue under prompts/catalogue/.

const shipped = await loadCatalogue('prompts');

/** The entries RF-606 names, per group, sorted by id. */
const expectedIds = {
  'design-principles': ['antipatterns', 'design-patterns', 'dry', 'kiss', 'solid', 'yagni'],
  method: ['requirements', 'sdd', 'tdd'],
  'architecture-styles': [
    'clean',
    'event-driven',
    'hexagonal',
    'layered',
    'microservices',
    'modular-monolith',
  ],
  modernisation: ['approval-tests', 'mikado', 'parallel-change', 'strangler-fig'],
  'quality-gates': ['ci-gates', 'honest-coverage', 'testing-pyramid'],
  documentation: ['adrs', 'api-contracts', 'docs-as-code'],
  security: ['owasp-top-10', 'secure-sdlc', 'security-by-design', 'stride'],
  delivery: ['build-once', 'containers', 'dora-metrics', 'observability'],
  'ai-assisted-build': ['agent-instructions', 'human-review', 'plan-before-build'],
} as const;

async function catalogueSha256(folder: string): Promise<string> {
  const hash = createHash('sha256');
  for (const name of (await readdir(folder)).sort()) {
    hash.update(`${name}\n`).update(await readFile(join(folder, name)));
  }
  return hash.digest('hex');
}

describe('the shipped catalogue', () => {
  it('RF-606 lists every group of RF-606 with its entries, in group order', () => {
    expect(shipped.entries.map((entry) => entry.id)).toEqual(
      catalogueGroups.flatMap((group) => expectedIds[group]),
    );
    for (const entry of shipped.entries) {
      expect(expectedIds[entry.group]).toContain(entry.id);
    }
  });

  it.each(shipped.entries.map((entry) => [entry.id, entry] as const))(
    'RF-606 %s has a one-line rule, why it matters and how to check it',
    (_id, entry) => {
      expect(entry.rule).toMatch(/^[^\n]{10,200}$/u);
      expect(entry.why.length).toBeGreaterThan(20);
      expect(entry.check.length).toBeGreaterThan(20);
    },
  );

  it('RF-608 holds the six architecture styles, each with selection criteria', () => {
    expect(shipped.styles.map((style) => style.id)).toEqual(expectedIds['architecture-styles']);
    for (const style of shipped.styles) {
      expect(style.chooseWhen.length).toBeGreaterThanOrEqual(2);
      expect(style.avoidWhen.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('the shipped catalogue defaults and version', () => {
  it('RF-606 a new brief switches on exactly the DEC-74 defaults', () => {
    expect(defaultPrinciples(shipped)).toEqual([
      'adrs',
      'ci-gates',
      'dry',
      'honest-coverage',
      'kiss',
      'sdd',
      'security-by-design',
      'solid',
      'tdd',
      'testing-pyramid',
      'yagni',
    ]);
  });

  it('RF-606 is read with its version and the SHA-256 of its files', async () => {
    expect(shipped.version).toBe(1);
    expect(shipped.sha256).toBe(await catalogueSha256('prompts/catalogue'));
  });

  it('RF-606 the README credits the master as the source of the curriculum', async () => {
    const readme = await readFile('prompts/catalogue/readme.v1.md', 'utf8');

    expect(readme).toContain('Master en Desarrollo con IA');
    expect(readme).toContain('BIG School');
  });
});

describe('loadCatalogue refusals', () => {
  const temp = useTempRoot('rst-catalogue-');
  const folder = (): string => join(temp.path, 'catalogue');

  async function copyCatalogue(): Promise<void> {
    await cp('prompts/catalogue', folder(), { recursive: true });
  }

  it('RF-606 refuses a catalogue with two versions of one entry', async () => {
    await copyCatalogue();
    await writeFile(join(folder(), 'solid.v2.md'), principleFileText());

    const failure = await failureOf(loadCatalogue(temp.path));

    expect(failure).toMatchObject({ code: ERROR_CODES.configurationInvalid });
  });

  it('RF-606 refuses a catalogue file whose name carries no version', async () => {
    await copyCatalogue();
    await writeFile(join(folder(), 'notes.md'), 'Notes.\n');

    const failure = await failureOf(loadCatalogue(temp.path));

    expect(failure).toMatchObject({ code: ERROR_CODES.configurationInvalid });
  });

  it('RF-606 refuses a catalogue without its README', async () => {
    await copyCatalogue();
    await rm(join(folder(), 'readme.v1.md'));

    const failure = await failureOf(loadCatalogue(temp.path));

    expect(failure).toMatchObject({ code: ERROR_CODES.configurationInvalid });
  });

  it('RF-606 refuses a missing catalogue folder', async () => {
    const failure = await failureOf(loadCatalogue(temp.path));

    expect(failure).toMatchObject({ code: ERROR_CODES.configurationInvalid });
  });
});
