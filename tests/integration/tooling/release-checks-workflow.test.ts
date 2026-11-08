import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';
import { workflowText } from '../../support/workflow-files.js';
import {
  at,
  keysOf,
  runStep,
  stepIndex,
  stepScript,
  stepTexts,
  workflowDocument,
} from '../../support/workflow-yaml.js';

// RF-1304, DEC-207, ADR-025, ADR-028 (Proposed), P8-63: .github/workflows/release-checks.yml. Every
// push to main (the owner's release merge) builds, scans and pushes the image of that commit before
// the 06:00 release, with the steps of the image job of release.yml and the workflow token only.

const checks = (): Promise<unknown> => workflowDocument('release-checks.yml');
const release = (): Promise<unknown> => workflowDocument('release.yml');
const image = 'ghcr.io/blacklight0101/rosetta';
const root = useTempRoot('rosetta-release-checks-');

/** The step of the checks job whose text contains `needle`, as parsed. */
async function step(needle: string): Promise<unknown> {
  const document = await checks();
  const steps = at(document, 'jobs', 'checks', 'steps');
  return Array.isArray(steps) ? steps[stepIndex(document, 'checks', needle)] : undefined;
}

describe('release-checks.yml trigger', () => {
  it('RF-1304 runs on every push to main, the release merge, and on nothing else', async () => {
    const document = await checks();

    expect(keysOf(at(document, 'on'))).toEqual(['push']);
    expect(at(document, 'on', 'push')).toEqual({ branches: ['main'] });
  });

  it('RF-1304 a later release merge queues behind running checks, so a push is never cancelled half-way', async () => {
    expect(at(await checks(), 'concurrency')).toEqual({
      group: 'release-checks-${{ github.ref }}',
      'cancel-in-progress': false,
    });
  });
});

describe('release-checks.yml permissions and token', () => {
  it('RF-1304 the default token is read-only; the one job holds contents read and packages, statuses and issues write', async () => {
    const document = await checks();

    expect(at(document, 'permissions')).toEqual({ contents: 'read' });
    expect(keysOf(at(document, 'jobs'))).toEqual(['checks']);
    expect(at(document, 'jobs', 'checks', 'permissions')).toEqual({
      contents: 'read',
      packages: 'write',
      statuses: 'write',
      issues: 'write',
    });
  });

  it('RNF-003 reads no secret, no variable and no token but the workflow token', async () => {
    const code = (await workflowText('release-checks.yml'))
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');
    const expressions = [...code.matchAll(/\$\{\{\s*(.*?)\s*\}\}/gu)].map((match) => match[1]);

    expect(code).not.toContain('secrets.');
    expect(code).not.toContain('vars.');
    expect(code).not.toContain('id-token');
    expect(expressions.filter((expression) => /token/iu.test(expression ?? ''))).toEqual([
      'github.token',
    ]);
  });

  it('RNF-003 the checkout keeps no credentials on the runner', async () => {
    expect(at(await step('actions/checkout@'), 'with', 'persist-credentials')).toBe(false);
  });
});

describe('release-checks.yml image build and tags', () => {
  it('RF-1304 has every step of the image job of release.yml, unchanged and in the same order', async () => {
    const own = stepTexts(await checks(), 'checks');
    const released = stepTexts(await release(), 'image');
    let from = 0;
    const missing = released.filter((text) => {
      const found = own.indexOf(text, from);
      from = found < 0 ? from : found + 1;
      return found < 0;
    });

    expect(released.length).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });

  it('RF-1300 a push to main gets the sha-<short> tag of its commit from release-tags.sh, never latest', async () => {
    const tags = await step('bash scripts/release-tags.sh');
    const output = join(root.path, 'github-output.txt');
    await writeFile(output, '');
    const result = await runStep(stepScript(await checks(), 'checks', 'Work out the image tags'), {
      IMAGE: String(at(tags, 'env', 'IMAGE')),
      REF_TYPE: 'branch',
      REF_NAME: 'main',
      GITHUB_SHA: '0123456789abcdef0123456789abcdef01234567',
      GITHUB_OUTPUT: output,
    });

    expect(at(tags, 'env')).toEqual({
      IMAGE: image,
      REF_TYPE: '${{ github.ref_type }}',
      REF_NAME: '${{ github.ref_name }}',
    });
    expect(result.code).toBe(0);
    expect((await readFile(output, 'utf8')).split('\n')).toEqual([
      'sha-tag=sha-0123456',
      `tags=${image}:sha-0123456`,
      '',
    ]);
    expect(stepTexts(await checks(), 'checks').join('\n')).not.toContain(':latest');
  });
});

describe('release-checks.yml scan gate and GHCR login', () => {
  it('RF-1304 the Trivy gate fails the job on a fixable High or Critical finding before anything is pushed', async () => {
    const document = await checks();
    const build = stepIndex(document, 'checks', 'docker build');
    const scan = stepIndex(document, 'checks', 'aquasecurity/trivy-action@');
    const login = stepIndex(document, 'checks', 'docker login');
    const push = stepIndex(document, 'checks', 'docker push');
    const gate = await step('aquasecurity/trivy-action@');

    expect(build).toBeGreaterThan(-1);
    expect(scan).toBeGreaterThan(build);
    expect(login).toBeGreaterThan(scan);
    expect(push).toBeGreaterThan(login);
    expect(at(gate, 'with')).toEqual({
      'image-ref': 'rosetta:release',
      format: 'table',
      severity: 'HIGH,CRITICAL',
      'ignore-unfixed': true,
      'vuln-type': 'os,library',
      'exit-code': '1',
    });
    expect(at(gate, 'continue-on-error')).toBeUndefined();
    expect(at(gate, 'if')).toBeUndefined();
  });

  it('RNF-003 logs in to GHCR with the workflow token on standard input and always logs out', async () => {
    const document = await checks();
    const login = await step('docker login');
    const steps = at(document, 'jobs', 'checks', 'steps');
    const last: unknown = Array.isArray(steps) ? steps.at(-1) : undefined;

    expect(at(login, 'run')).toContain('--password-stdin');
    expect(at(login, 'env', 'TOKEN')).toBe('${{ github.token }}');
    expect(at(last, 'if')).toBe('always()');
    expect(at(last, 'run')).toBe('docker logout ghcr.io');
  });
});
