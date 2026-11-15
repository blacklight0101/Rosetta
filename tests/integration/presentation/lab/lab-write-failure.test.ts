import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ModelRouter } from '../../../support/calibration-harness.js';
import { labParts } from '../../../support/lab-harness.js';
import { runLab, verifierArgs } from '../../../support/lab-run-helpers.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1403, RNF-003: when results.json cannot be written the paid results are printed, masked.

const temp = useTempRoot('rosetta-lab-write-');

describe('results that cannot be written', () => {
  it('RF-1403 are printed with RST-1701 and every secret masked', async () => {
    const blocker = join(temp.path, 'not-a-folder');
    await writeFile(blocker, 'a file where the output folder should be');
    const reason = `Reason: the key ${fakeOpenAiKey} is in the lines.\nVerdict: Supported`;
    const router = new ModelRouter({ 'model-a': [reason, reason, reason, reason] });
    const parts = {
      ...labParts({ outputDir: blocker, router }),
      ledgerFile: join(temp.path, 'ledger', 'ledger.jsonl'),
    };

    const { code, lines } = await runLab(parts, verifierArgs);

    const text = lines.join('\n');
    expect(code).toBe(1);
    expect(text).toContain('RST-1701');
    expect(text).toContain('vc-01');
    expect(text).not.toContain(fakeOpenAiKey);
  });
});
