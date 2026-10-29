import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { plain, seededApiPlan } from '../../support/api-plan-harness.js';
import { oneStatement, ProposalScans, winFormsFiles } from '../../support/proposal-scans.js';

// RF-610, RF-645, DEC-184: with an own migration answer, Rosetta's strategy-fit check still runs, but
// against the default strategy as the reference. checks.md and the TRD say so and never claim the
// owner chose the default; no seam record is written for a strategy the owner did not choose.

const ownMigration = 'Move one module a week behind a feature flag.';

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-typed-fit-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function packageOf(sqlStatements?: typeof oneStatement): Promise<Record<string, string>> {
  const h = await seededApiPlan(dataDir, {
    brief: { typed: { migration: ownMigration } },
    harness: { scans: new ProposalScans(winFormsFiles, sqlStatements) },
  });
  await h.seedScan();
  const files = await h.handoffOf(await h.plan());
  return Object.fromEntries(Object.entries(files).map(([path, text]) => [path, plain(text)]));
}

describe('BuildPlan: a desktop application with an own migration answer', () => {
  for (const [name, statements] of [
    ['no database', undefined],
    ['a shared database', oneStatement],
  ] as const) {
    it(`RF-645 with ${name}, checks.md names the default as the reference and never as the owner's choice`, async () => {
      const files = await packageOf(statements);

      const checks = files['checks.md'] ?? '';
      expect(checks).toContain('## Migration strategy fit');
      expect(checks).not.toContain('The owner chose this strategy');
      expect(checks).toMatch(
        /Rosetta checked its default strategy, Strangler Fig, as the reference/u,
      );
    });

    it(`RF-645 with ${name}, the TRD fit line names the reference strategy and no seam record is written`, async () => {
      const files = await packageOf(statements);

      const trd = files['trd.md'] ?? '';
      expect(trd).not.toContain('Fit with the application:');
      expect(trd).toContain('Fit of Strangler Fig, the reference strategy, with the application:');
      const records = Object.entries(files).filter(([path]) => path.startsWith('decisions/'));
      expect(records.map(([, text]) => text).join('\n')).not.toContain(
        'Each phase replaces a part of the client',
      );
    });
  }
});
