import { describe, expect, it } from 'vitest';
import {
  claimOf,
  claimsOf,
  completedRun,
  deepenOf,
  readerTasksAsked,
} from '../../support/deepen-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';

// RF-209, RF-302, RF-231, ADR-005: a Deepen of a completed understand run, with recorded answers.
// The completed run rejected its Catalog claim (BR-001.c1) and supported its Services claim.

const temp = useTempRoot('rosetta-deepen-rounds-');
const REJECTED_REASON = 'The cited lines set a label to a fixed text; they never load the catalog.';

async function rejectedAgain() {
  const { h, run } = await completedRun({
    dataDir: temp.path,
    recording: 'deepen-no-progress.json',
    verifierRecording: 'verifier-deepen-no-progress.json',
  });
  const deepen = await h.deepen(run, { coveragePass: false });
  if (!deepen.ok) throw new Error(deepen.error);
  return { h, run, deep: deepen.value };
}

describe('RF-209 a Deepen whose re-read is rejected again', UNDERSTAND_TIMEOUT, () => {
  it('RF-209 ends with no progress after a round that added no Supported claim and read no new file', async () => {
    const { h, deep } = await rejectedAgain();

    expect(deep.endState).toBe('Completed');
    expect(await deepenOf(h, deep)).toMatchObject({ stopReason: 'noProgress', roundsDone: 1 });
  });

  it('RF-209 re-reads the rejected first-party claim with the verifier reason, once', async () => {
    const { h, deep } = await rejectedAgain();

    expect((await deepenOf(h, deep)).rounds[0]?.reread).toEqual([
      { claimId: 'BR-001.c1', reason: REJECTED_REASON },
    ]);
    const asked = h.providers
      .requests()
      .filter((request) => request.context.agentTaskId === 'reader-003');
    expect(JSON.stringify(asked[0]?.messages)).toContain(REJECTED_REASON);
  });

  it('RF-302 records the id a replacement replaces and keeps the rejected claim Rejected with its reason', async () => {
    const { h, run, deep } = await rejectedAgain();

    expect(await claimOf(h, deep, 'BR-003.c1')).toMatchObject({
      status: 'Rejected',
      replaces: 'BR-001.c1',
    });
    const kept = await claimOf(h, deep, 'BR-001.c1');
    expect(kept).toMatchObject({ status: 'Rejected', verdict: { reason: REJECTED_REASON } });
    expect(await claimsOf(h, run)).toHaveLength(2);
  });
});

describe('RF-209 a replacement rejected again', UNDERSTAND_TIMEOUT, () => {
  it('RF-209 does not re-read a replacement that was rejected again in the same Deepen', async () => {
    const { h } = await rejectedAgain();

    expect(readerTasksAsked(h).filter((id) => id >= 'reader-003')).toEqual([
      'reader-003',
      'reader-003',
    ]);
  });

  it('RF-209 never shows the verifier the earlier rejection when it judges a replacement (ADR-005)', async () => {
    const { h } = await rejectedAgain();

    const judged = h.providers.verifierRequests();
    expect(judged).toHaveLength(3);
    expect(JSON.stringify(judged[2])).toContain('The name label shows the text Item');
    expect(JSON.stringify(judged[2])).not.toContain(REJECTED_REASON);
    expect(JSON.stringify(judged[2])).not.toContain('BR-001.c1');
  });
});

describe('RF-209 a Deepen round that re-reads and reads unread files', UNDERSTAND_TIMEOUT, () => {
  async function deepened(maxRounds: number) {
    const { h, run } = await completedRun({
      dataDir: temp.path,
      recording: 'deepen-coverage.json',
      verifierRecording: 'verifier-deepen-supported.json',
    });
    const deepen = await h.deepen(run, { maxRounds });
    if (!deepen.ok) throw new Error(deepen.error);
    return { h, deep: deepen.value };
  }

  it('RF-209 ends at the round limit after a round with progress', async () => {
    const { h, deep } = await deepened(1);

    expect(deep.endState).toBe('Completed');
    expect(await deepenOf(h, deep)).toMatchObject({ stopReason: 'roundLimit', roundsDone: 1 });
  });

  it('RF-209 reads the first-party file no task read and verifies every new claim with both steps', async () => {
    const { h, deep } = await deepened(1);

    const [round] = (await deepenOf(h, deep)).rounds;
    expect(round?.filesRead).toEqual(['Catalog/Details.aspx']);
    expect(round?.newClaims).toEqual([
      { claimId: 'BR-003.c1', status: 'Supported', replaces: 'BR-001.c1' },
      { claimId: 'BR-004.c1', status: 'Supported' },
    ]);
    expect(h.providers.verifierRequests()).toHaveLength(4);
  });

  it('RF-231 shows each measure before and after, with supported after a re-read apart', async () => {
    const { h, deep } = await deepened(1);

    const { before, after } = await deepenOf(h, deep);
    expect(before).toMatchObject({ supported: 1, rejected: 1, rejectedUnresolved: 1 });
    expect(before?.supportedAfterReread).toBe(0);
    expect(after).toMatchObject({ supported: 3, rejected: 1, rejectedUnresolved: 0 });
    expect(after?.supportedAfterReread).toBe(1);
    expect(after?.filesNotRead).toBe(0);
    expect(before?.filesNotRead).toBe(1);
  });
});

describe('RF-209 a Deepen of a run with an Unverified claim', UNDERSTAND_TIMEOUT, () => {
  it('RF-209 judges the Unverified claim, then ends when a round has nothing left to do', async () => {
    const { h, run } = await completedRun({
      dataDir: temp.path,
      recording: 'deepen-judge.json',
      verifierRecording: 'verifier-deepen-judge.json',
    });
    expect((await claimOf(h, run, 'BR-001.c1')).status).toBe('Unverified');

    const deepen = await h.deepen(run, { coveragePass: false });

    if (!deepen.ok) throw new Error(deepen.error);
    expect((await claimOf(h, deepen.value, 'BR-001.c1')).status).toBe('Supported');
    const record = await deepenOf(h, deepen.value);
    expect(record.rounds.map((round) => round.judged)).toEqual([['BR-001.c1']]);
    expect(record.stopReason).toBe('noProgress');
    expect((await claimOf(h, run, 'BR-001.c1')).status).toBe('Unverified');
  });
});

describe('RNF-004 the manifest of a Deepen run', UNDERSTAND_TIMEOUT, () => {
  it('RNF-004 DEC-157 records the re-read prompt version that carries the grouping rule', async () => {
    const { h, deep } = await rejectedAgain();

    const manifest = await h.manifestOf(deep);

    expect(manifest.promptVersions['reader/reread.v2.md']?.version).toBe('v2');
    expect(manifest.promptVersions['reader/reread.v1.md']).toBeUndefined();
  });
});
