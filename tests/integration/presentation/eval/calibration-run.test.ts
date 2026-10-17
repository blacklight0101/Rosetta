import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCalibrationResults } from '../../../../src/application/eval/calibration-results.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { loadCalibrationSet } from '../../../../src/infrastructure/eval/calibration-set-file.js';
import { calibrationReport } from '../../../../src/presentation/eval/calibration-report.js';
import { runCalibration } from '../../../../src/presentation/eval/compose-calibration.js';
import {
  ModelRouter,
  answersFor,
  calibrationParts,
  evalFolder,
} from '../../../support/calibration-harness.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-305, DEC-57, ADR-008, RF-143: `npm run eval -- --calibration` judges the hand-labelled claims
// with the `verifier` role of each chosen model, through the real guarded provider factory, and
// reports the agreement rate per model and the disagreements. The fake provider replays the answers;
// no real model is called.

const temp = useTempRoot('rosetta-calibration-run-');
const judgeA = { provider: 'fake', model: 'judge-a' };
const judgeB = { provider: 'fake', model: 'judge-b' };

async function committed() {
  const loaded = await loadCalibrationSet(evalFolder, 'calibration/webforms-shop.json');
  if (!loaded.ok) throw new Error(loaded.error);
  return loaded.value;
}

/** Model A disagrees twice; model B five times and cannot be read once. */
async function twoModels() {
  const loaded = await committed();
  const router = new ModelRouter({
    'judge-a': answersFor(loaded.set, { wrong: [2, 20] }),
    'judge-b': answersFor(loaded.set, { wrong: [0, 1, 16, 17, 18], unreadable: [5] }),
  });
  const parts = calibrationParts({ outputDir: join(temp.path, 'out'), router });
  const result = await runCalibration(parts, loaded, [judgeA, judgeB]);
  if (!result.ok) throw new Error(result.error.message);
  return { loaded, router, summary: result.value };
}

async function written(): Promise<unknown> {
  const [id] = await readdir(join(temp.path, 'out'));
  if (id === undefined) throw new Error('No calibration folder');
  return JSON.parse(await readFile(join(temp.path, 'out', id, 'calibration.json'), 'utf8'));
}

describe('the calibration run with the fake provider', () => {
  it('RF-305 states the agreement rate of each model with the hand labels', async () => {
    const { summary } = await twoModels();
    const [a, b] = summary.results.models;

    expect(a).toMatchObject({ model: 'judge-a', claims: 30, agreed: 28, agreementRate: 0.933333 });
    expect(b).toMatchObject({ model: 'judge-b', claims: 30, agreed: 24, agreementRate: 0.8 });
  });

  it('RF-305 lists the disagreements of each model with the verifier reason', async () => {
    const { summary } = await twoModels();
    const [a, b] = summary.results.models;

    expect(a?.disagreements.map((d) => [d.claimId, d.label, d.verdict])).toEqual([
      ['cal-03', 'Supported', 'Rejected'],
      ['cal-21', 'Rejected', 'Supported'],
    ]);
    expect(a?.disagreements[0]?.reason).toBe('Judgement 3 says so.');
    expect(b?.disagreements.map((d) => d.claimId)).toEqual([
      'cal-01',
      'cal-02',
      'cal-06',
      'cal-17',
      'cal-18',
      'cal-19',
    ]);
  });

  it('RF-305 tells a claim called Supported against its label from one wrongly rejected', async () => {
    const { summary } = await twoModels();
    const [a, b] = summary.results.models;

    expect(a).toMatchObject({ falseSupported: 1, falseRejected: 1, unjudged: 0 });
    expect(b).toMatchObject({ falseSupported: 3, falseRejected: 2, unjudged: 1 });
  });
});

describe('the calibration run and its files', () => {
  it('RF-305 writes calibration.json, which parses, with the models, prompts and set it used', async () => {
    const { loaded } = await twoModels();
    const parsed = parseCalibrationResults(await written());
    if (!parsed.ok) throw new Error(parsed.error.join('; '));

    expect(parsed.value).toMatchObject({
      calibrationSetVersion: loaded.set.version,
      calibrationSetSha256: loaded.sha256,
      claims: 30,
      rosettaVersion: '1.2.3-test',
      at: '2026-10-17T09:30:00.000Z',
    });
    expect(parsed.value.models.map((m) => [m.provider, m.model])).toEqual([
      ['fake', 'judge-a'],
      ['fake', 'judge-b'],
    ]);
    expect(parsed.value.models[0]?.modelVersion).toBe('fake-model-2026-10-01');
    expect(Object.keys(parsed.value.promptVersions)).toEqual([
      'verifier/claim.v1.md',
      'verifier/retry.v1.md',
    ]);
  });

  it('RF-305 prints the agreement per model and every disagreement', async () => {
    const { summary } = await twoModels();
    const text = calibrationReport(summary).join('\n');

    expect(text).toContain('fake judge-a: agreement 0.933 (28 of 30 claims)');
    expect(text).toContain('fake judge-b: agreement 0.800 (24 of 30 claims)');
    expect(text).toContain('cal-03 labelled Supported, judged Rejected: Judgement 3 says so.');
    expect(text).toContain('cal-21 labelled Rejected, judged Supported');
    expect(text).toContain('cal-06 labelled Supported, not judged');
  });
});

describe('the calibration run and its secrets', () => {
  it('RNF-003 masks a secret in a verifier reason before calibration.json is written', async () => {
    const loaded = await committed();
    const answers = answersFor(loaded.set);
    answers[0] = `Reason: The key ${fakeOpenAiKey} is shown.
Verdict: Rejected`;
    const router = new ModelRouter({ 'judge-a': answers });
    const parts = calibrationParts({ outputDir: join(temp.path, 'out'), router });
    const result = await runCalibration(parts, loaded, [judgeA]);

    expect(result.ok).toBe(true);
    expect(JSON.stringify(await written())).not.toContain(fakeOpenAiKey);
    expect(JSON.stringify(await written())).toContain('cal-01');
  });
});

describe('the calibration run and the verifier step', () => {
  it('RF-305 sends each claim with only the lines it cites, as data, to the verifier role', async () => {
    const { router } = await twoModels();
    const first = router.requests[0];
    const message = first?.messages[0]?.content ?? '';

    expect(first?.context.role).toBe('verifier');
    expect(first?.tools).toEqual([]);
    expect(message).toContain('Details.aspx.cs');
    expect(message).toContain('NameLabel.Text = item.Name;');
    expect(message).not.toContain('Checkout');
    expect(router.requests.filter((r) => r.model === 'judge-a')).toHaveLength(30);
  });

  it('RF-305 retries an answer that is no verdict once, then leaves the claim Unverified', async () => {
    const { router } = await twoModels();

    expect(router.requests.filter((r) => r.model === 'judge-b')).toHaveLength(31);
  });

  it('RF-141 masks a secret in a claim before it reaches the model', async () => {
    const loaded = await committed();
    const [first, ...rest] = loaded.set.claims;
    if (first === undefined) throw new Error('fixture');
    const set = { ...loaded.set, claims: [{ ...first, text: `Key ${fakeOpenAiKey}.` }, ...rest] };
    const router = new ModelRouter({ 'judge-a': answersFor(set) });
    const parts = calibrationParts({ outputDir: join(temp.path, 'out'), router });
    await runCalibration(parts, { ...loaded, set }, [judgeA]);

    expect(router.requests[0]?.messages[0]?.content).not.toContain(fakeOpenAiKey);
  });
});

describe('the calibration run and its cap', () => {
  it('RF-305 stops a model at its cap, leaves the rest of its claims Unverified and goes on', async () => {
    const loaded = await committed();
    const router = new ModelRouter(
      { 'judge-a': answersFor(loaded.set), 'judge-b': answersFor(loaded.set).slice(0, 10) },
      { 'judge-b': 11 },
    );
    const parts = calibrationParts({ outputDir: join(temp.path, 'out'), router });
    const result = await runCalibration(parts, loaded, [judgeA, judgeB]);
    if (!result.ok) throw new Error(result.error.message);
    const [a, b] = result.value.results.models;

    expect(a).toMatchObject({ endState: 'Completed', agreed: 30 });
    expect(b).toMatchObject({ endState: 'CapReached', agreed: 10, unjudged: 20 });
    expect(b?.disagreements).toHaveLength(20);
    expect(b?.disagreements[0]?.verdict).toBe('Unverified');
  });
});

describe('the calibration run and its refusals', () => {
  it('RF-305 refuses a citation the source does not hold before any model call', async () => {
    const loaded = await committed();
    const [first, ...rest] = loaded.set.claims;
    if (first === undefined) throw new Error('fixture');
    const citations = [{ path: 'Orders/Confirm.aspx.cs', startLine: 50, endLine: 60 }];
    const set = { ...loaded.set, claims: [{ ...first, citations }, ...rest] };
    const router = new ModelRouter({ 'judge-a': answersFor(set) });
    const parts = calibrationParts({ outputDir: join(temp.path, 'out'), router });
    const result = await runCalibration(parts, { ...loaded, set }, [judgeA]);

    expect(result).toMatchObject({ ok: false, error: { code: ERROR_CODES.configurationInvalid } });
    expect(result.ok ? '' : result.error.message).toContain('cal-01');
    expect(router.requests).toHaveLength(0);
    await expect(readdir(join(temp.path, 'out'))).rejects.toThrow();
  });

  it('ADR-007 lets the budget guard refuse a call whose worst case passes the cap', async () => {
    const loaded = await committed();
    const router = new ModelRouter({ 'contract-model': answersFor(loaded.set) });
    const parts = calibrationParts({
      ...{ outputDir: join(temp.path, 'out'), router, capMicros: 1, serverKeys: { openai: 'k' } },
    });
    const priced = { provider: 'openai', model: 'contract-model' };
    const result = await runCalibration(parts, loaded, [priced]);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.results.models[0]).toMatchObject({ endState: 'CapReached', agreed: 0 });
    expect(router.requests).toHaveLength(0);
  });

  it('RF-305 refuses a model whose provider the settings do not offer, before any call', async () => {
    const loaded = await committed();
    const router = new ModelRouter({});
    const parts = calibrationParts({ outputDir: join(temp.path, 'out'), router });
    const result = await runCalibration(parts, loaded, [{ provider: 'nowhere', model: 'x' }]);

    expect(result.ok).toBe(false);
    expect(router.requests).toHaveLength(0);
  });
});
