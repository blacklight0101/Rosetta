import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLedgerText } from '../../../../src/application/lab/spend-ledger.js';
import { ModelRouter } from '../../../support/calibration-harness.js';
import { labLimits, labParts, verdict } from '../../../support/lab-harness.js';
import { runLab, verifierArgs, writtenResults } from '../../../support/lab-run-helpers.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1402, DEC-231, ADR-007: the lab refuses a call that would pass a cap, from the shared ledger.

const temp = useTempRoot('rosetta-lab-caps-');
const out = (name: string): string => join(temp.path, name);
const answers = Array.from({ length: 8 }, () => verdict('Supported'));

describe('the lab caps', () => {
  it('RF-1402 books every answered call to lab-out/ledger.jsonl with its cost', async () => {
    const router = new ModelRouter({ 'model-a': answers });

    await runLab(labParts({ outputDir: out('a'), router }), verifierArgs);
    const lines = parseLedgerText(await readFile(join(out('a'), 'ledger.jsonl'), 'utf8'));

    expect(lines.filter((line) => line.t === 'hold')).toHaveLength(4);
    expect(
      lines.filter((line) => line.t === 'settle').map((line) => 'micros' in line && line.micros),
    ).toEqual([460, 460, 460, 460]);
  });

  it('RF-1402 gives the retry of the verifier its own hold and its own settle', async () => {
    const router = new ModelRouter({ 'model-a': ['Maybe.', verdict('Supported')] });
    const parts = labParts({ outputDir: out('retry'), router });

    await runLab(parts, { ...verifierArgs, cases: 'verifier-claim-sample' });
    const lines = parseLedgerText(await readFile(join(out('retry'), 'ledger.jsonl'), 'utf8'));

    const holds = lines.filter((line) => line.t === 'hold').map((line) => line.id);
    const settled = lines.filter((line) => line.t === 'settle').map((line) => line.id);
    expect(holds.slice(0, 2)).toHaveLength(2);
    expect(new Set(holds.slice(0, 2)).size).toBe(2);
    expect(settled.slice(0, 2)).toEqual(holds.slice(0, 2));
  });

  it('RF-1402 refuses a call that would pass the cap of the invocation and skips the rest', async () => {
    const router = new ModelRouter({ 'model-a': answers });
    const limits = { ...labLimits, invocationCapMicros: 1_000 };

    const { code, lines } = await runLab(
      labParts({ outputDir: out('b'), router, limits }),
      verifierArgs,
    );
    const [results] = await writtenResults(out('b'));

    expect(code).toBe(1);
    expect(router.requests).toHaveLength(0);
    expect(results).toMatchObject({ endState: 'Refused', planned: 4 });
    expect(results?.refusal).toContain('invocation cap');
    expect(results?.cases).toHaveLength(1);
    expect(results?.cases[0]).toMatchObject({ refused: true, rstCode: 'RST-1600', calls: 0 });
    expect(lines.join('\n')).toContain('RST-1600');
  });
});

describe('the lab caps in the middle of an invocation', () => {
  it('RF-1402 lets calls through until the next one would pass the cap', async () => {
    const probe = new ModelRouter({ 'model-a': answers });
    await runLab(labParts({ outputDir: out('probe'), router: probe }), verifierArgs);
    const first = parseLedgerText(await readFile(join(out('probe'), 'ledger.jsonl'), 'utf8'))[0];
    const worst = first !== undefined && 'micros' in first ? first.micros : 0;
    const router = new ModelRouter({ 'model-a': answers });
    const limits = { ...labLimits, invocationCapMicros: worst + 100 };

    await runLab(labParts({ outputDir: out('c'), router, limits }), verifierArgs);
    const [results] = await writtenResults(out('c'));

    expect(router.requests).toHaveLength(1);
    expect(results?.cases.map((each) => each.refused)).toEqual([false, true]);
    expect(results?.endState).toBe('Refused');
  });

  it('RF-1402 stops at the stop line of the phase, whatever the invocation cap', async () => {
    await mkdir(out('d'), { recursive: true });
    const spent = [
      { v: 1, t: 'hold', id: 'old', invocation: 'earlier', micros: 1, at: 0 },
      { v: 1, t: 'settle', id: 'old', micros: 39_999_900, at: 0 },
    ];
    await appendFile(
      join(out('d'), 'ledger.jsonl'),
      spent.map((line) => `${JSON.stringify(line)}\n`).join(''),
    );
    const router = new ModelRouter({ 'model-a': answers });

    const { code, lines } = await runLab(labParts({ outputDir: out('d'), router }), verifierArgs);
    const [results] = await writtenResults(out('d'));

    expect(code).toBe(1);
    expect(router.requests).toHaveLength(0);
    expect(results?.refusal).toContain('stop line');
    expect(lines.join('\n')).toContain('stop line');
  });
});
