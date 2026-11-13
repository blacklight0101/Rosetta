import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLedgerText } from '../../../../src/application/lab/spend-ledger.js';
import { ledgerFileFromEnvironment } from '../../../../src/presentation/lab/lab-ledger-path.js';
import { ModelRouter } from '../../../support/calibration-harness.js';
import { labLimits, labParts, verdict } from '../../../support/lab-harness.js';
import { runLab, verifierArgs, writtenResults } from '../../../support/lab-run-helpers.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1402, ADR-029: ROSETTA_LAB_LEDGER makes every checkout share one ledger file.

const temp = useTempRoot('rosetta-lab-shared-');
const answers = Array.from({ length: 8 }, () => verdict('Supported'));

describe('the ledger file of the environment', () => {
  it('RF-1402 is absent when the variable is not set', () => {
    expect(ledgerFileFromEnvironment({})).toEqual({ ok: true, value: undefined });
  });

  it('RF-1402 takes an absolute .jsonl path', () => {
    const file = join(temp.path, 'shared', 'ledger.jsonl');

    expect(ledgerFileFromEnvironment({ ROSETTA_LAB_LEDGER: file })).toEqual({
      ok: true,
      value: file,
    });
  });

  it('RF-1402 refuses a relative path and a file that is not .jsonl with a plain message', () => {
    const relative = ledgerFileFromEnvironment({ ROSETTA_LAB_LEDGER: 'lab-out/ledger.jsonl' });
    const other = ledgerFileFromEnvironment({
      ROSETTA_LAB_LEDGER: join(temp.path, 'ledger.txt'),
    });

    expect(relative.ok ? '' : relative.error).toContain('ROSETTA_LAB_LEDGER');
    expect(other.ok ? '' : other.error).toContain('.jsonl');
  });
});

describe('two invocations from different checkouts', () => {
  it('RF-1402 share one ledger through ROSETTA_LAB_LEDGER and refuse past the cap together', async () => {
    const shared = join(temp.path, 'outside', 'ledger.jsonl');
    const probe = new ModelRouter({ 'model-a': answers });
    await runLab(labParts({ outputDir: join(temp.path, 'probe'), router: probe }), verifierArgs);
    const first = parseLedgerText(
      await readFile(join(temp.path, 'probe', 'ledger.jsonl'), 'utf8'),
    )[0];
    const worst = first !== undefined && 'micros' in first ? first.micros : 0;
    const cap = worst + 1_000;
    const limits = { ...labLimits, stopMicros: cap, invocationCapMicros: cap };
    const one = new ModelRouter({ 'model-a': answers });
    const two = new ModelRouter({ 'model-a': answers });

    const partsOne = {
      ...labParts({ outputDir: join(temp.path, 'a'), router: one, limits }),
      ledgerFile: shared,
    };
    const partsTwo = {
      ...labParts({ outputDir: join(temp.path, 'b'), router: two, limits }),
      ledgerFile: shared,
    };
    await runLab(partsOne, verifierArgs);
    await runLab(partsTwo, verifierArgs);
    const [secondRun] = await writtenResults(join(temp.path, 'b'));

    expect(one.requests.length).toBeGreaterThan(0);
    expect(two.requests).toHaveLength(0);
    expect(secondRun?.refusal).toContain('stop line');
    expect(parseLedgerText(await readFile(shared, 'utf8')).length).toBeGreaterThan(0);
  });
});
