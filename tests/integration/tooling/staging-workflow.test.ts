import { afterEach, describe, expect, it } from 'vitest';
import { fakeAz, type FakeAz } from '../../support/fake-az.js';
import {
  at,
  keysOf,
  runStep,
  stepIndex,
  stepScript,
  stepTexts,
  workflowDocument,
} from '../../support/workflow-yaml.js';

// DEC-175, ADR-025, ADR-024: .github/workflows/staging.yml. Every push to develop builds the image
// as release.yml does and deploys it to the staging Container App in the `staging` environment,
// then runs the smoke test; release.yml refuses a main whose tree did not pass the job
// `deploy (staging)`. Off until the owner sets ROSETTA_STAGING_ENABLED.

const staging = (): Promise<unknown> => workflowDocument('staging.yml');
const release = (): Promise<unknown> => workflowDocument('release.yml');
const image = 'ghcr.io/blacklight0101/rosetta';
const enabled = "vars.ROSETTA_STAGING_ENABLED == 'true' && github.ref == 'refs/heads/develop'";

describe('staging.yml trigger and jobs', () => {
  it('DEC-175 runs on a push to develop and by hand, never on a pull request', async () => {
    const document = await staging();

    expect(keysOf(at(document, 'on')).sort()).toEqual(['push', 'workflow_dispatch']);
    expect(at(document, 'on', 'push')).toEqual({ branches: ['develop'] });
  });

  it('DEC-175 has the jobs image and deploy (staging), both off until ROSETTA_STAGING_ENABLED and only on develop', async () => {
    const document = await staging();

    expect(keysOf(at(document, 'jobs'))).toEqual(['image', 'deploy']);
    expect(at(document, 'jobs', 'deploy', 'name')).toBe('deploy (staging)');
    expect(at(document, 'jobs', 'image', 'if')).toBe(enabled);
    expect(at(document, 'jobs', 'deploy', 'if')).toBe(enabled);
    expect(at(document, 'jobs', 'deploy', 'needs')).toEqual(['image']);
  });

  it('DEC-175 deploys in the staging environment, one at a time, never cancelled half-way', async () => {
    const deploy = at(await staging(), 'jobs', 'deploy');

    expect(at(deploy, 'environment', 'name')).toBe('staging');
    expect(at(deploy, 'concurrency')).toEqual({
      group: 'deploy-staging',
      'cancel-in-progress': false,
    });
    expect(at(deploy, 'env', 'AZ_RG')).toBe('rg-rosetta');
    expect(at(deploy, 'env', 'AZ_APP')).toBe('ca-rosetta-staging');
    expect(at(deploy, 'env', 'AZ_MIGRATE_JOB')).toBe('caj-rosetta-stg-migrate');
    expect(at(deploy, 'env', 'IMAGE')).toBe(image);
  });

  it('RNF-003 the default token is read-only; packages: write only in image, id-token: write only in deploy', async () => {
    const document = await staging();

    expect(at(document, 'permissions')).toEqual({ contents: 'read' });
    expect(at(document, 'jobs', 'image', 'permissions')).toEqual({
      contents: 'read',
      packages: 'write',
    });
    expect(at(document, 'jobs', 'deploy', 'permissions')).toEqual({
      contents: 'read',
      'id-token': 'write',
    });
  });
});

describe('staging.yml image job', () => {
  it('RF-1300 works out the sha-<short> tag with release-tags.sh, scans with Trivy before the push', async () => {
    const document = await staging();
    const tags = stepIndex(document, 'image', 'bash scripts/release-tags.sh');
    const build = stepIndex(document, 'image', 'docker build');
    const scan = stepIndex(document, 'image', 'aquasecurity/trivy-action@');
    const push = stepIndex(document, 'image', 'docker push');

    expect(tags).toBeGreaterThan(-1);
    expect(build).toBeGreaterThan(tags);
    expect(scan).toBeGreaterThan(build);
    expect(push).toBeGreaterThan(scan);
    expect(stepTexts(document, 'image').join('\n')).toContain('--password-stdin');
  });

  it('RNF-003 pins every action to the same commit SHA as release.yml', async () => {
    const uses = (document: unknown): string[] =>
      ['image', 'deploy', 'sbom'].flatMap((job) =>
        stepTexts(document, job).flatMap((step) => /"uses":"([^"]+)"/u.exec(step)?.[1] ?? []),
      );
    const released = new Set(uses(await release()));

    const own = uses(await staging());
    expect(own.length).toBeGreaterThan(0);
    expect(own.filter((action) => !released.has(action))).toEqual([]);
  });
});

describe('staging.yml deploy job', () => {
  it('DEC-175 checks the settings, logs in, migrates, sets the image, waits, smokes, logs out; no ZAP gate', async () => {
    const document = await staging();
    const order = [
      'The deploy settings are stored',
      'azure/login@',
      'az containerapp job start',
      'az containerapp update',
      '/healthz',
      'node scripts/smoke.mjs',
      'az logout',
    ].map((needle) => stepIndex(document, 'deploy', needle));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(stepIndex(document, 'deploy', 'zap-baseline')).toBe(-1);
  });

  it('RF-1304 a missing staging setting stops the job with its name and no value', async () => {
    const script = stepScript(await staging(), 'deploy', 'The deploy settings are stored');
    const result = await runStep(script, {
      AZURE_CLIENT_ID: 'value-client',
      AZURE_TENANT_ID: 'value-tenant',
      AZURE_SUBSCRIPTION_ID: 'value-subscription',
      ROSETTA_SMOKE_USER: 'value-user',
      ROSETTA_PUBLIC_URL: 'https://example.test',
    });

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('ROSETTA_SMOKE_PASSWORD');
    expect(result.output).toContain('staging');
    expect(result.output).not.toContain('value-');
  });

  it('DEC-175 waits for /healthz long enough for a cold start of an app that scales to zero', async () => {
    const script = stepScript(await staging(), 'deploy', 'Wait for the new revision');

    expect(script).toContain('latestReadyRevisionName');
    expect(script).toContain('"$ROSETTA_PUBLIC_URL/healthz"');
    expect(script).toMatch(/--max-time (?:[3-9]\d|1\d\d)\b/u);
  });
});

let az: FakeAz | undefined;
afterEach(async () => {
  await az?.dispose();
  az = undefined;
});

describe('staging.yml migrate step (DEC-140)', () => {
  it.each([
    ['Running Succeeded', true],
    ['Running Failed', false],
  ])('DEC-140 the staging migrate job reporting %s passes: %s', async (statuses, passes) => {
    az = await fakeAz({ statuses });
    const script = stepScript(await staging(), 'deploy', 'Migrate with the new image');
    const env = {
      ...az.env,
      AZ_RG: 'rg-rosetta',
      AZ_MIGRATE_JOB: 'caj-rosetta-stg-migrate',
      IMAGE: image,
      SHA_TAG: 'sha-0000000',
    };
    const { code } = await runStep(script, env, az.prelude);
    const calls = await az.calls();

    expect(code === 0).toBe(passes);
    expect(calls[0]).toContain('containerapp job update --name caj-rosetta-stg-migrate');
    expect(calls[0]).toContain(`--image ${image}:sha-0000000`);
  });
});
