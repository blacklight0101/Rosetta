import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { claimOf, completedRun, deepenOf, readerTasksAsked } from '../../support/deepen-run.js';
import { copyFixture } from '../../support/scan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';

// P5-35, RF-209, RF-301, ADR-005: a claim rejected because the meaning it states (a status code) is
// defined in a comment of another file is re-read with the lines that define it. The repository is
// synthetic: a schema script whose comment gives the status codes, and a procedure that writes one.

const temp = useTempRoot('rosetta-deepen-defined-');
const AREA = 'Database Files';
const REASON = 'The cited lines write status 4 but do not say what 4 means.';

const schema = [
  '-- Appointment status codes (synthetic example)',
  '-- 0 = pending, 1 = confirmed, 2 = unseen by the doctor, 3 = completed, 4 = rejected',
  'CREATE TABLE Appointment (',
  '  Id INT PRIMARY KEY,',
  '  Status INT NOT NULL',
  ');',
  '',
].join('\n');
const procedure = [
  'CREATE PROCEDURE RejectAppointment @Id INT',
  'AS',
  'BEGIN',
  '  UPDATE Appointment SET Status = 4 WHERE Id = @Id;',
  'END',
  '',
].join('\n');

async function repositoryWithSchema(): Promise<string> {
  const repository = join(temp.path, 'repository');
  await copyFixture('webforms-csharp', repository);
  await mkdir(join(repository, AREA), { recursive: true });
  await writeFile(join(repository, AREA, 'Schema.sql'), schema, 'utf8');
  await writeFile(join(repository, AREA, 'Doctor.sql'), procedure, 'utf8');
  return repository;
}

/** The JSON of the rejected claims inside the task message (the prompt text itself names the field). */
function rejectedBlock(message: string): string {
  return message.split('\\"rejected\\": [')[1] ?? '';
}

async function deepened() {
  const h = await createUnderstandHarness({
    dataDir: temp.path,
    repository: await repositoryWithSchema(),
    recording: 'deepen-defined-elsewhere.json',
    verifierRecording: 'verifier-deepen-defined-elsewhere.json',
  });
  await h.scan();
  const run = await h.understand({ areas: [AREA] });
  const deepen = await h.deepen(run, { coveragePass: false, maxRounds: 1 });
  if (!deepen.ok) throw new Error(deepen.error);
  return { h, run, deep: deepen.value };
}

describe('P5-35 a claim rejected for a meaning defined elsewhere', UNDERSTAND_TIMEOUT, () => {
  it('RF-301 stores the reason kind with the Rejected verdict of the first judgement', async () => {
    const { h, run } = await deepened();

    expect(await claimOf(h, run, 'BR-001.c1')).toMatchObject({
      status: 'Rejected',
      verdict: { reason: REASON, reasonKind: 'definedElsewhere' },
    });
  });

  it('RF-209 asks the reader to find the lines that define the meaning, with the code map search', async () => {
    const { h } = await deepened();

    expect(new Set(readerTasksAsked(h).filter((id) => id >= 'reader-002'))).toEqual(
      new Set(['reader-002']),
    );
    const asked = h.providers
      .requests()
      .filter((request) => request.context.agentTaskId === 'reader-002');
    const first = JSON.stringify(asked[0]?.messages);
    expect(rejectedBlock(first)).toContain('\\"reasonKind\\": \\"definedElsewhere\\"');
    expect(first).toContain('lines that define that meaning');
    expect(asked.every((request) => request.context.role === 'reader')).toBe(true);
  });

  it('RF-209 judges the claim citing both ranges like any other and keeps the first verdict (ADR-005)', async () => {
    const { h, run, deep } = await deepened();

    const again = await claimOf(h, deep, 'BR-002.c1');
    expect(again).toMatchObject({ status: 'Supported', replaces: 'BR-001.c1' });
    expect(again.citations.map((citation) => citation.path)).toEqual([
      `${AREA}/Doctor.sql`,
      `${AREA}/Schema.sql`,
    ]);
    expect(await claimOf(h, deep, 'BR-001.c1')).toMatchObject({
      status: 'Rejected',
      verdict: { reason: REASON, reasonKind: 'definedElsewhere' },
    });
    expect(await claimOf(h, run, 'BR-001.c1')).toMatchObject({ status: 'Rejected' });
    const judged = h.providers.verifierRequests();
    expect(judged).toHaveLength(2);
    expect(JSON.stringify(judged[1])).not.toContain(REASON);
    expect((await deepenOf(h, deep)).rounds[0]?.newClaims).toEqual([
      { claimId: 'BR-002.c1', status: 'Supported', replaces: 'BR-001.c1' },
    ]);
  });
});

describe('P5-35 a claim rejected for another reason', UNDERSTAND_TIMEOUT, () => {
  it('RF-209 is re-read as before, without the search for a definition', async () => {
    const { h, run } = await completedRun({
      dataDir: temp.path,
      recording: 'deepen-no-progress.json',
      verifierRecording: 'verifier-deepen-no-progress.json',
    });
    const deepen = await h.deepen(run, { coveragePass: false });
    if (!deepen.ok) throw new Error(deepen.error);

    expect((await claimOf(h, run, 'BR-001.c1')).verdict?.reasonKind).toBeUndefined();
    const asked = h.providers
      .requests()
      .filter((request) => request.context.agentTaskId === 'reader-003');
    expect(asked.length).toBeGreaterThan(0);
    expect(rejectedBlock(JSON.stringify(asked[0]?.messages))).not.toContain('reasonKind');
  });
});
