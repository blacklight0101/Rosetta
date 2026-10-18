import { describe, expect, it } from 'vitest';
import { at, stepIndex, stepTexts, workflowDocument } from '../../support/workflow-yaml.js';

// Threat model section 5, environments-and-delivery.md section 10, P1-55: the OWASP ZAP baseline
// scan runs in CI against the Compose stack of the runtime image (the image that is deployed), and
// fails on a High alert. The compose-smoke job also runs scripts/smoke.mjs on its stack.

const ci = (): Promise<unknown> => workflowDocument('ci.yml');
const zapImage = /ghcr\.io\/zaproxy\/zaproxy:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}/u;

describe('ci.yml zap-baseline job', () => {
  it('threat model 5 starts the Compose stack of the runtime image, without the CI overlay', async () => {
    const document = await ci();
    const steps = stepTexts(document, 'zap-baseline').join('\n');

    expect(at(document, 'jobs', 'zap-baseline', 'runs-on')).toBe('ubuntu-latest');
    expect(steps).toContain('docker compose -f compose.yaml up -d --build --wait');
    expect(steps).not.toContain('compose.ci.yaml');
  });

  it('threat model 5 runs the digest-pinned ZAP baseline against the stack on the host network', async () => {
    const steps = stepTexts(await ci(), 'zap-baseline').join('\n');

    expect(steps).toMatch(zapImage);
    expect(steps).toContain('--network host');
    expect(steps).toContain('zap-baseline.py -t http://127.0.0.1:8080');
  });

  it('threat model 5 summarises the report after the scan and fails on a High alert', async () => {
    const document = await ci();
    const scan = stepIndex(document, 'zap-baseline', 'zap-baseline.py');
    const summary = stepIndex(document, 'zap-baseline', 'node scripts/zap-summary.mjs');

    expect(scan).toBeGreaterThan(-1);
    expect(summary).toBeGreaterThan(scan);
  });

  it('RNF-003 writes a throwaway .env and always removes the stack and its volumes', async () => {
    const steps = stepTexts(await ci(), 'zap-baseline');
    const cleanup = steps.find((step) => step.includes('down -v'));

    expect(steps.join('\n')).toContain('openssl rand');
    expect(cleanup).toContain('always()');
  });

  it('RNF-001 skips its steps, not the job, for a documentation-only change', async () => {
    const document = await ci();
    const steps = stepTexts(document, 'zap-baseline');

    expect(at(document, 'jobs', 'zap-baseline', 'needs')).toBe('changes');
    expect(at(document, 'jobs', 'zap-baseline', 'if')).toBeUndefined();
    expect(
      steps.slice(1).every((step) => step.includes("needs.changes.outputs.code != 'false'")),
    ).toBe(true);
  });
});

describe('ci.yml compose-smoke job runs the smoke script', () => {
  it('RF-1304 runs scripts/smoke.mjs on the stack after the persistence check', async () => {
    const document = await ci();
    const persistence = stepIndex(document, 'compose-smoke', 'persistence');
    const smoke = stepIndex(
      document,
      'compose-smoke',
      'node scripts/smoke.mjs http://127.0.0.1:8080',
    );

    expect(persistence).toBeGreaterThan(-1);
    expect(smoke).toBeGreaterThan(persistence);
  });
});
