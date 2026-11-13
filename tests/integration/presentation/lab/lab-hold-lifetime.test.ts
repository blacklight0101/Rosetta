import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ModelRouter } from '../../../support/calibration-harness.js';
import { labParts, verdict } from '../../../support/lab-harness.js';
import { runLab, verifierArgs } from '../../../support/lab-run-helpers.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1402: a hold must outlive the longest call the provider settings allow.

const temp = useTempRoot('rosetta-lab-lifetime-');

describe('the hold lifetime and the provider settings', () => {
  it('RF-1402 refuses to start when a call could outlive the hold of the ledger', async () => {
    const router = new ModelRouter({ 'model-a': [verdict('Supported')] });
    const base = labParts({ outputDir: join(temp.path, 'long'), router });
    const fake = base.settings.providers['fake'];
    if (fake === undefined) throw new Error('no fake provider in the settings');
    const slow = { ...fake, timeoutSeconds: 600, maxRetries: 5 };
    const settings = { ...base.settings, providers: { ...base.settings.providers, fake: slow } };

    const { code, lines } = await runLab({ ...base, settings }, verifierArgs);

    expect(code).toBe(1);
    expect(lines.join(String.fromCharCode(10))).toContain('RST-1000');
    expect(lines.join(String.fromCharCode(10))).toContain('30 minutes');
    expect(router.requests).toHaveLength(0);
  });

  it('RF-1402 counts the waits between attempts: 300 s with 5 retries is refused', async () => {
    const router = new ModelRouter({ 'model-a': [verdict('Supported')] });
    const base = labParts({ outputDir: join(temp.path, 'edge'), router });
    const fake = base.settings.providers['fake'];
    if (fake === undefined) throw new Error('no fake provider in the settings');
    const edge = { ...fake, timeoutSeconds: 300, maxRetries: 5 };
    const settings = { ...base.settings, providers: { ...base.settings.providers, fake: edge } };

    const { code } = await runLab({ ...base, settings }, verifierArgs);

    expect(code).toBe(1);
    expect(router.requests).toHaveLength(0);
  });

  it('RF-1402 starts with the settings of the template', async () => {
    const router = new ModelRouter({
      'model-a': Array.from({ length: 4 }, () => verdict('Supported')),
    });

    const { code } = await runLab(
      labParts({ outputDir: join(temp.path, 'short'), router }),
      verifierArgs,
    );

    expect(code).toBe(0);
  });
});
