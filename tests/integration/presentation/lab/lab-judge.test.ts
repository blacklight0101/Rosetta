import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ModelRouter } from '../../../support/calibration-harness.js';
import { judgeReply, VERIFIER_IDS } from '../../../support/judge-harness.js';
import { CALL_COST_MICROS, labParts, verdict } from '../../../support/lab-harness.js';
import { runLab, verifierArgs, writtenResults } from '../../../support/lab-run-helpers.js';
import { runLabCompare } from '../../../../src/presentation/lab/lab-command.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1404, RF-1402, RF-1403: `npm run lab -- ... --judge` over the fake provider. The target model is
// model-a, the judge model-b; both sit behind the real guarded provider factory and the ledger gate.

const temp = useTempRoot('rosetta-lab-judge-');
const out = (): string => join(temp.path, 'lab-out');

/** vc-01 valid, vc-02 repaired, vc-03 valid, vc-04 never readable (as in the other lab tests). */
const targetScript = [
  verdict('Supported'),
  ...['Maybe.', verdict('Rejected')],
  verdict('Rejected'),
  ...['Maybe.', 'Perhaps.'],
];
const judged = { ...verifierArgs, judge: { provider: 'fake', model: 'model-b' } };
const times = (count: number, text: string): string[] => Array.from({ length: count }, () => text);
const good = judgeReply(VERIFIER_IDS, { grounding: 5, 'verdict-correct': 3 });

describe('a judged lab run', () => {
  it('RF-1404 scores every answered case against the family rubric and records the judge', async () => {
    const router = new ModelRouter({ 'model-a': targetScript, 'model-b': times(4, good) });

    const { code } = await runLab(labParts({ outputDir: out(), router }), judged);
    const [results] = await writtenResults(out());

    expect(code).toBe(0);
    expect(results?.cases.map((each) => each.judge?.overall)).toEqual([4, 4, 4, 4]);
    expect(results?.cases[0]?.judge?.criteria.map((each) => [each.id, each.score])).toEqual([
      ['grounding', 5],
      ['verdict-correct', 3],
      ['reason-quality', 4],
      ['form', 4],
    ]);
    expect(results?.cases[0]?.judge).toMatchObject({ state: 'scored', calls: 1 });
  });

  it('RF-1404 records the judge, its prompt and its rubric with their hashes', async () => {
    const router = new ModelRouter({ 'model-a': targetScript, 'model-b': times(4, good) });

    await runLab(labParts({ outputDir: out(), router }), judged);
    const [results] = await writtenResults(out());

    expect(results?.judge).toMatchObject({
      provider: 'fake',
      model: 'model-b',
      prompt: { name: 'lab/judge.v1.md', version: 'v1' },
      rubric: { family: 'verifier' },
    });
    expect(results?.judge?.rubric.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(results?.judge?.prompt.sha256).toMatch(/^[0-9a-f]{64}$/u);
  });
});

describe('the messages of a judged lab run', () => {
  it('RF-1404 sends the case, the answer and the label only as data blocks, to the judge model', async () => {
    const router = new ModelRouter({ 'model-a': targetScript, 'model-b': times(4, good) });

    await runLab(labParts({ outputDir: out(), router }), judged);
    const requests = router.requests.filter((request) => request.model === 'model-b');
    const first = requests[0];
    const content = first?.messages[0]?.content ?? '';

    expect(requests).toHaveLength(4);
    expect(first?.system).toContain('## verdict-correct');
    expect(first?.system).not.toContain('gold-tier');
    for (const source of ['lab_source', 'lab_answer', 'lab_label']) {
      expect(content).toContain(`"source":"${source}"`);
    }
    expect(content).toContain('A gold-tier customer gets 20 percent off the order total.');
    expect(content).toContain('Verdict: Supported');
  });
});

describe('the ledger of a judged lab run', () => {
  it('RF-1402 counts the judge calls in the same ledger as the target calls', async () => {
    const router = new ModelRouter({ 'model-a': targetScript, 'model-b': times(4, good) });

    await runLab(labParts({ outputDir: out(), router }), judged);
    const ledger = await readFile(join(out(), 'ledger.jsonl'), 'utf8');
    const settled = ledger.split('\n').filter((line) => line.includes('"t":"settle"'));
    const [results] = await writtenResults(out());

    expect(settled).toHaveLength(6 + 4);
    expect(results?.cases[0]?.judge?.costMicros).toBe(CALL_COST_MICROS);
    expect(results?.cases[0]?.costMicros).toBe(CALL_COST_MICROS);
  });
});

describe('a judged lab run that goes wrong', () => {
  it('RF-1404 records an unreadable reply as no score and goes on', async () => {
    const router = new ModelRouter({
      'model-a': targetScript,
      'model-b': ['Looks fine to me.', good, good, good],
    });

    const { code } = await runLab(labParts({ outputDir: out(), router }), judged);
    const [results] = await writtenResults(out());

    expect(code).toBe(0);
    expect(results?.cases[0]?.judge).toMatchObject({ state: 'unreadable', overall: null });
    expect(results?.cases[1]?.judge?.state).toBe('scored');
  });

  it('RF-1404 stops the invocation as Refused when a guard refuses a judge call', async () => {
    const router = new ModelRouter(
      { 'model-a': targetScript, 'model-b': times(4, good) },
      { 'model-b': 2 },
    );

    const { code } = await runLab(labParts({ outputDir: out(), router }), judged);
    const [results] = await writtenResults(out());

    expect(code).toBe(1);
    expect(results?.endState).toBe('Refused');
    expect(results?.cases).toHaveLength(2);
    expect(results?.cases[1]?.judge?.state).toBe('refused');
  });
});

describe('a judged lab run without a usable judge', () => {
  it('RF-1404 stops the invocation at the first judge call that fails and records its code', async () => {
    const router = new ModelRouter({ 'model-a': targetScript });

    const { code } = await runLab(labParts({ outputDir: out(), router }), judged);
    const [results] = await writtenResults(out());

    expect(code).toBe(1);
    expect(results?.endState).toBe('Refused');
    expect(results?.cases).toHaveLength(1);
    expect(results?.cases[0]?.judge).toMatchObject({ state: 'failed', calls: 0 });
    expect(results?.cases[0]?.judge?.rstCode).toMatch(/^RST-[0-9]{4}$/u);
    expect(results?.refusal).toContain('judge call failed');
  });

  it('RF-1404 sends nothing when the judge model has no price', async () => {
    const router = new ModelRouter({ 'model-a': targetScript });
    const args = { ...verifierArgs, judge: { provider: 'fake', model: 'model-z' } };

    const { code, lines } = await runLab(labParts({ outputDir: out(), router }), args);

    expect(code).toBe(1);
    expect(router.requests).toHaveLength(0);
    expect(lines.join('\n')).toContain('model-z');
  });

  it('RF-1404 adds no call and no judge field without --judge', async () => {
    const router = new ModelRouter({ 'model-a': targetScript });

    await runLab(labParts({ outputDir: out(), router }), verifierArgs);
    const [results] = await writtenResults(out());

    expect(router.requests).toHaveLength(6);
    expect(results?.judge).toBeUndefined();
    expect(results?.cases[0]?.judge).toBeUndefined();
  });
});

describe('the report of a judged lab run', () => {
  it('RF-1404 prints the judge means in the summary', async () => {
    const router = new ModelRouter({ 'model-a': targetScript, 'model-b': times(4, good) });

    const { lines } = await runLab(labParts({ outputDir: out(), router }), judged);

    const text = lines.join('\n');
    expect(text).toContain('Judge fake:model-b');
    expect(text).toContain('mean overall 4.0');
    expect(text).toContain('grounding 5.0');
  });

  it('RF-1403 shows the judge scores side by side in --compare', async () => {
    const router = new ModelRouter({
      'model-a': [...targetScript, ...targetScript],
      'model-b': [...times(4, good), ...times(4, judgeReply(VERIFIER_IDS, {}, 2))],
    });
    const parts = labParts({ outputDir: out(), router });
    await runLab(parts, judged);
    await runLab(parts, judged);
    const [first, second] = await writtenResults(out());
    const lines: string[] = [];

    await runLabCompare(out(), first?.id ?? '', second?.id ?? '', (line) => {
      lines.push(line);
    });

    const text = lines.join('\n');
    expect(text).toContain('judge 4.0');
    expect(text).toContain('judge 2.0');
    expect(text).toContain('mean overall');
  });
});
