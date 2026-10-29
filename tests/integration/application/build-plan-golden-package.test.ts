import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  dataModelPackage,
  hashesOf,
  type MigrationStrategy,
} from '../../support/package-hashes.js';

// P6-27, RF-610, DEC-190, ADR-008: a plan with a data model keeps the five fixed cards, and its
// package is byte for byte the package written before the data cards could be dropped. The hashes
// in tests/fixtures/plan-golden/data-model-package.sha256.json were taken from the package of the
// recorded planner answer (planner-package.json) before the change, one set per migration strategy.

const strategies: readonly MigrationStrategy[] = ['strangler-fig', 'parallel-change', 'rewrite'];

describe.each(strategies)('a plan with a data model: %s', (strategy) => {
  it('P6-27 RF-610 the package has the same files with the same bytes as before', async () => {
    const golden = JSON.parse(
      await readFile('tests/fixtures/plan-golden/data-model-package.sha256.json', 'utf8'),
    ) as Record<string, Record<string, string>>;

    const files = await dataModelPackage(strategy);

    expect(hashesOf(files)).toEqual(golden[strategy]);
    expect(files['tasks.md']).toContain('Build the data-access layer on the chosen database');
    expect(files['tasks.md']).toContain('Migrate the legacy data into the target tables');
  }, 120_000);
});
