import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ModelRouter } from '../../../support/calibration-harness.js';
import { CALL_COST_MICROS, labParts, verdict } from '../../../support/lab-harness.js';
import {
  overviewArgs,
  runLab,
  verifierArgs,
  writtenResults,
} from '../../../support/lab-run-helpers.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1400, RF-1401, RF-1403, ADR-008: `npm run lab` over the fake provider. The model answers from a
// script, through the real guarded provider factory; no real model is called.

const temp = useTempRoot('rosetta-lab-run-');
const out = (): string => join(temp.path, 'lab-out');

/** vc-01 valid, vc-02 repaired, vc-03 valid but against its label, vc-04 never readable. */
const script = [
  verdict('Supported'),
  ...['Maybe.', verdict('Rejected')],
  verdict('Rejected'),
  ...['Maybe.', 'Perhaps.'],
];

describe('the lab run with the fake provider', () => {
  it('RF-1403 writes one result per case with the deterministic metrics', async () => {
    const router = new ModelRouter({ 'model-a': script });

    const { code } = await runLab(labParts({ outputDir: out(), router }), verifierArgs);
    const [results] = await writtenResults(out());

    expect(code).toBe(0);
    expect(results?.cases.map((each) => [each.caseId, each.detail, each.agreed])).toEqual([
      ['vc-01', 'Supported', true],
      ['vc-02', 'Rejected', true],
      ['vc-03', 'Rejected', false],
      ['vc-04', 'Unverified', false],
    ]);
    expect(results?.cases.map((each) => [each.validFirstTry, each.repaired, each.usable])).toEqual([
      [true, false, true],
      [false, true, true],
      [true, false, true],
      [false, false, false],
    ]);
    expect(results?.cases[1]).toMatchObject({ calls: 2, inputTokens: 800, outputTokens: 60 });
    expect(results?.cases[1]).toMatchObject({ latencyMs: 500, costMicros: 2 * CALL_COST_MICROS });
    expect(results?.cases[0]).toMatchObject({ rstCode: null, refused: false, split: 'tune' });
    expect(results?.cases[3]?.split).toBe('held-back');
  });

  it('RF-1403 records the date, model, model version, prompt hash and case set with the results', async () => {
    const router = new ModelRouter({ 'model-a': script });

    await runLab(labParts({ outputDir: out(), router }), verifierArgs);
    const [results] = await writtenResults(out());

    expect(results).toMatchObject({
      at: '2026-11-13T09:30:00.000Z',
      rosettaVersion: '1.2.3-test',
      endState: 'Completed',
      planned: 4,
      prompt: { id: 'verifier/claim', name: 'verifier/claim.v5.md', version: 'v5' },
      model: { provider: 'fake', model: 'model-a' },
      caseSet: { version: 'verifier-claim-sample-1' },
    });
    expect(results?.prompt.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(results?.model.modelVersion).not.toBeNull();
  });
});

describe('the lab run over other versions and prompts', () => {
  it('RF-1400 renders the version it is given over the same inputs: a draft file replaces the system prompt', async () => {
    const draft = join(temp.path, 'draft.md');
    await writeFile(draft, 'You are the draft verifier.\n');
    const router = new ModelRouter({ 'model-a': [...script, ...script] });
    const parts = labParts({ outputDir: out(), router });

    await runLab(parts, verifierArgs);
    await runLab(parts, { ...verifierArgs, version: draft });
    const [current, drafted] = await writtenResults(out());

    const systems = router.requests.map((request) => request.system);
    expect(systems[0]).toBe(await readFile(join('prompts', 'verifier', 'claim.v5.md'), 'utf8'));
    expect(systems[6]).toBe('You are the draft verifier.\n');
    expect(router.requests[0]?.messages[0]).toEqual(router.requests[6]?.messages[0]);
    expect(drafted?.prompt).toMatchObject({ name: 'draft.md', version: 'file' });
    expect(drafted?.prompt.sha256).not.toBe(current?.prompt.sha256);
  });

  it('RF-1400 wires a second prompt of another role: the overview of the summariser', async () => {
    const answer = JSON.stringify({ application: [{ text: 'A shop.', cards: ['C-001'] }] });
    const router = new ModelRouter({ 'model-a': [answer, 'Sorry, no.'] });

    const { code } = await runLab(labParts({ outputDir: out(), router }), overviewArgs);
    const [results] = await writtenResults(out());

    expect(code).toBe(0);
    expect(router.requests.map((request) => request.context.role)).toEqual([
      'summariser',
      'summariser',
    ]);
    expect(results?.cases.map((each) => [each.caseId, each.validFirstTry, each.agreed])).toEqual([
      ['ov-01', true, null],
      ['ov-02', false, null],
    ]);
  });
});

describe('the lab run with repetitions', () => {
  it('RF-1400 repeats every case as often as asked', async () => {
    const router = new ModelRouter({
      'model-a': Array.from({ length: 8 }, () => verdict('Supported')),
    });

    await runLab(labParts({ outputDir: out(), router }), {
      ...verifierArgs,
      ...{ cases: 'verifier-claim-sample', repetitions: 2 },
      prompt: 'verifier/claim',
    });
    const [results] = await writtenResults(out());

    expect(results?.planned).toBe(8);
    expect(results?.cases.map((each) => [each.caseId, each.repetition]).slice(0, 2)).toEqual([
      ['vc-01', 1],
      ['vc-01', 2],
    ]);
  });
});

describe('the lab run when it must not start', () => {
  it('RF-1400 sends nothing without --yes and shows the plan', async () => {
    const router = new ModelRouter({ 'model-a': script });

    const { code, lines } = await runLab(labParts({ outputDir: out(), router }), {
      ...verifierArgs,
      yes: false,
    });

    expect(code).toBe(1);
    expect(router.requests).toHaveLength(0);
    expect(lines.join('\n')).toContain('Nothing was sent');
    expect(lines.join('\n')).toContain('verifier/claim');
  });

  it('RF-1400 stops before any call for an unknown prompt, a set of another prompt or an unknown version', async () => {
    const router = new ModelRouter({ 'model-a': script });
    const parts = labParts({ outputDir: out(), router });

    const unknown = await runLab(parts, { ...verifierArgs, prompt: 'planner/none' });
    const mismatch = await runLab(parts, { ...verifierArgs, cases: 'overview-sample' });
    const version = await runLab(parts, { ...verifierArgs, version: 'v99' });

    expect([unknown.code, mismatch.code, version.code]).toEqual([1, 1, 1]);
    expect(unknown.lines.join('\n')).toContain('planner/none');
    expect(mismatch.lines.join('\n')).toContain('summariser/overview');
    expect(router.requests).toHaveLength(0);
  });
});
