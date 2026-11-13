import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ModelRouter } from '../../../support/calibration-harness.js';
import { labParts, verdict } from '../../../support/lab-harness.js';
import {
  overviewArgs,
  runLab,
  verifierArgs,
  writtenResults,
} from '../../../support/lab-run-helpers.js';
import { runLabCompare } from '../../../../src/presentation/lab/lab-command.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1409: `npm run lab -- --split tune|held-back --sample n` over the fake provider. In the sample
// set verifier-claim-sample, vc-04 is held back and the other three are tune.

const temp = useTempRoot('rosetta-lab-selection-');
const out = (): string => join(temp.path, 'lab-out');
const answers = [
  verdict('Supported'),
  verdict('Rejected'),
  verdict('Rejected'),
  verdict('Rejected'),
];

describe('the lab run over one side or a sample', () => {
  it('RF-1409 sends only the tune cases and records the selection', async () => {
    const router = new ModelRouter({ 'model-a': answers });

    const { code } = await runLab(labParts({ outputDir: out(), router }), {
      ...verifierArgs,
      split: 'tune',
    });
    const [results] = await writtenResults(out());

    expect(code).toBe(0);
    expect(results?.cases.map((each) => each.caseId)).toEqual(['vc-01', 'vc-02', 'vc-03']);
    expect(results?.planned).toBe(3);
    expect(results?.selection).toEqual({ split: 'tune', sample: null });
    expect(router.requests).toHaveLength(3);
  });

  it('RF-1409 sends only the held-back cases', async () => {
    const router = new ModelRouter({ 'model-a': answers });

    await runLab(labParts({ outputDir: out(), router }), { ...verifierArgs, split: 'held-back' });
    const [results] = await writtenResults(out());

    expect(results?.cases.map((each) => each.caseId)).toEqual(['vc-04']);
  });
});

describe('the lab run over a sample', () => {
  it('RF-1409 sends the first n cases by id of the side asked, and says so in the plan', async () => {
    const router = new ModelRouter({ 'model-a': answers });

    const { lines } = await runLab(labParts({ outputDir: out(), router }), {
      ...verifierArgs,
      ...{ split: 'tune', sample: 2 },
    });
    const [results] = await writtenResults(out());

    expect(results?.cases.map((each) => each.caseId)).toEqual(['vc-01', 'vc-02']);
    expect(results?.selection).toEqual({ split: 'tune', sample: 2 });
    expect(lines.join('\n')).toContain('over 2 cases');
    expect(lines.join('\n')).toContain('split tune, sample 2');
  });

  it('RF-1409 sends nothing when the side has no case, even with --yes', async () => {
    const router = new ModelRouter({ 'model-a': answers });

    const { code, lines } = await runLab(labParts({ outputDir: out(), router }), {
      ...overviewArgs,
      split: 'held-back',
    });

    expect(code).toBe(1);
    expect(router.requests).toHaveLength(0);
    expect(lines.join('\n')).toContain('no case');
  });
});

describe('the lab comparison of selections', () => {
  it('RF-1409 refuses to compare a run of one side with a run of every case', async () => {
    const router = new ModelRouter({ 'model-a': [...answers, ...answers] });
    const parts = labParts({ outputDir: out(), router });
    await runLab(parts, { ...verifierArgs, split: 'tune' });
    await runLab(parts, verifierArgs);
    const [first, second] = await writtenResults(out());
    const lines: string[] = [];

    const code = await runLabCompare(out(), first?.id ?? '', second?.id ?? '', (line) => {
      lines.push(line);
    });

    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('selection');
  });
});
