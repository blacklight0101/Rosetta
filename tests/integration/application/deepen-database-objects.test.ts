import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { copyFixture } from '../../support/scan-harness.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';
import { deepenOf } from '../../support/deepen-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';

// P5-36, RF-104, RF-209, RF-230: a SQL script with a table, a view, a procedure, a trigger and a
// function. The first run states only the table; coverage.md lists the other four as "no card";
// a Deepen reads them first and each then has a card that states what it does. Recorded answers
// only (the script is synthetic, shaped like the schema scripts of the 2026-10-24 benchmark).

const data = useTempRoot('rosetta-db-objects-data-');
const repo = useTempRoot('rosetta-db-objects-repo-');

async function ran() {
  await copyFixture('webforms-csharp', repo.path);
  await mkdir(join(repo.path, 'Clinic'), { recursive: true });
  await copyFile('tests/fixtures/sql/clinic.sql', join(repo.path, 'Clinic', 'clinic.sql'));
  const h = await createUnderstandHarness({
    dataDir: data.path,
    repository: repo.path,
    sqlPack: true,
    recording: 'deepen-database-objects.json',
    verifierRecording: 'verifier-deepen-database-objects.json',
  });
  await h.scan();
  const run = await h.understand({ areas: ['Clinic'] });
  expect(run.endState).toBe('Completed');
  return { h, run };
}

describe('P5-36 database objects in coverage and in a Deepen', UNDERSTAND_TIMEOUT, () => {
  it('P5-36 coverage.md of the first run lists the table with its card and the other four as no card', async () => {
    const { h, run } = await ran();

    const md = await readFile(join(h.runFolder(run), 'coverage.md'), 'utf8');

    expect(md).toContain('## Database objects');
    expect(md).toMatch(/\| Visit \| table \| Clinic\/clinic\.sql:4-10 \| BR-001 \|/u);
    for (const name of ['TopVisits', 'CloseVisit', 'VisitAudit', 'fnShort']) {
      expect(md).toMatch(
        new RegExp(
          `\\| ${name} \\| [a-z-]+ \\| Clinic/clinic\\.sql:\\d+-\\d+ \\| no card \\|`,
          'u',
        ),
      );
    }
  });

  it('P5-36 a Deepen reads the objects first and each ends with a card that states it', async () => {
    const { h, run } = await ran();

    const deepen = await h.deepen(run, { coveragePass: false });
    if (!deepen.ok) throw new Error(deepen.error);

    const record = await deepenOf(h, deepen.value);
    expect(record.rounds[0]?.newClaims.map((claim) => claim.status)).toEqual([
      'Supported',
      'Supported',
      'Supported',
      'Supported',
    ]);
    const md = await readFile(join(h.runFolder(deepen.value), 'coverage.md'), 'utf8');
    expect(md).not.toMatch(/\| (?:no card|named only) \|/u);
    expect(md).toMatch(/\| TopVisits \| view \| Clinic\/clinic\.sql:14-16 \| BR-00\d \|/u);
    expect(md).toMatch(/\| CloseVisit \| procedure \| Clinic\/clinic\.sql:18-23 \| BR-00\d \|/u);
    const folder = join(h.runFolder(deepen.value), 'cards', 'BR');
    const stated = (
      await Promise.all(
        ['BR-002', 'BR-003'].map((id) => readFile(join(folder, `${id}.md`), 'utf8')),
      )
    ).join('\n');
    expect(stated).toMatch(/top 20/iu);
    expect(stated).toContain('NotifyPatient');
    expect(stated).toContain('NotifyDoctor');
  });
});
