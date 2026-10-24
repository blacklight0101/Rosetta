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

// RF-1300, RF-1304, DEC-57, DEC-104, P1-55, P1-184: .github/workflows/release.yml. It builds the
// image once, scans it and pushes it to GHCR as `sha-<short>` (and `X.Y.Z` for a tag), attaches a
// CycloneDX SBOM to the GitHub release of a tag, and holds a deploy job that stays off until the
// owner sets the repository variable ROSETTA_DEPLOY_ENABLED; it deploys to the Azure Container App
// of ADR-024 in the `production` environment.

const release = (): Promise<unknown> => workflowDocument('release.yml');
const image = 'ghcr.io/blacklight0101/rosetta';

describe('release.yml triggers', () => {
  it('DEC-104 runs only on a pushed v* tag and by hand, never on a pull request or a push to main', async () => {
    const document = await release();

    expect(keysOf(at(document, 'on')).sort()).toEqual(['push', 'workflow_dispatch']);
    expect(keysOf(at(document, 'on', 'push'))).toEqual(['tags']);
    expect(at(document, 'on', 'push', 'tags')).toEqual(['v*']);
  });

  it('RNF-003 the default token is read-only; only the image job may write packages and only the SBOM job contents', async () => {
    const document = await release();
    const jobs = keysOf(at(document, 'jobs'));
    const writes = (scope: string): string[] =>
      jobs.filter((job) => at(document, 'jobs', job, 'permissions', scope) === 'write');

    expect(at(document, 'permissions')).toEqual({ contents: 'read' });
    expect(writes('packages')).toEqual(['image']);
    expect(writes('contents')).toEqual(['sbom']);
  });
});

describe('release.yml image job', () => {
  it('DEC-104 builds only from main or a v* tag', async () => {
    expect(at(await release(), 'jobs', 'image', 'if')).toBe(
      "github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v')",
    );
  });

  it('RF-1300 tags the image sha-<short> and X.Y.Z of the tag, never latest', async () => {
    const steps = stepTexts(await release(), 'image').join('\n');

    expect(steps).toContain(image);
    expect(steps).toContain('bash scripts/release-tags.sh');
    expect(steps).not.toContain(':latest');
  });

  it('DEC-29 works out the tags with scripts/release-tags.sh before the build (release-tags.test.ts runs it)', async () => {
    const document = await release();
    const tags = stepIndex(document, 'image', 'bash scripts/release-tags.sh');

    expect(tags).toBeGreaterThan(-1);
    expect(tags).toBeLessThan(stepIndex(document, 'image', 'docker build'));
  });

  it('RF-1300 scans the image with Trivy before it pushes anything', async () => {
    const document = await release();
    const build = stepIndex(document, 'image', 'docker build');
    const scan = stepIndex(document, 'image', 'aquasecurity/trivy-action@');
    const push = stepIndex(document, 'image', 'docker push');

    expect(build).toBeGreaterThan(-1);
    expect(scan).toBeGreaterThan(build);
    expect(push).toBeGreaterThan(scan);
  });

  it('RNF-003 logs in to GHCR with the job token through the environment, on standard input', async () => {
    const steps = stepTexts(await release(), 'image').join('\n');

    expect(steps).toContain('--password-stdin');
    expect(steps).toContain('${{ github.token }}');
  });
});

describe('release.yml SBOM job', () => {
  it('DEC-57 runs only for a tag and attaches a CycloneDX SBOM to its GitHub release', async () => {
    const document = await release();
    const steps = stepTexts(document, 'sbom').join('\n');

    expect(at(document, 'jobs', 'sbom', 'if')).toBe("startsWith(github.ref, 'refs/tags/v')");
    expect(steps).toContain('npm sbom --sbom-format cyclonedx');
    expect(steps).toContain('gh release upload');
  });
});

describe('release.yml deploy job', () => {
  it('DEC-104 is skipped unless the owner set ROSETTA_DEPLOY_ENABLED and runs in the production environment', async () => {
    const deploy = at(await release(), 'jobs', 'deploy');

    expect(at(deploy, 'if')).toBe(
      "vars.ROSETTA_DEPLOY_ENABLED == 'true' && (github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v'))",
    );
    const environment = at(deploy, 'environment');
    expect(typeof environment === 'string' ? environment : at(environment, 'name')).toBe(
      'production',
    );
    expect(at(deploy, 'needs')).toEqual(expect.arrayContaining(['image']));
  });

  it('DEC-104 deploys only main or a v* tag, one deploy at a time, never cancelled half-way', async () => {
    const deploy = at(await release(), 'jobs', 'deploy');

    expect(at(deploy, 'concurrency', 'group')).toBe('deploy-production');
    expect(at(deploy, 'concurrency', 'cancel-in-progress')).toBe(false);
  });

  it('threat model 5 refuses to deploy a commit whose ZAP baseline did not pass', async () => {
    const document = await release();

    expect(stepIndex(document, 'deploy', 'zap-baseline')).toBeGreaterThan(-1);
    expect(at(document, 'jobs', 'deploy', 'permissions', 'checks')).toBe('read');
  });
});

describe('release.yml deploy job settings', () => {
  it('RF-1304 checks the owner stored every named setting before the login, and smokes the public URL', async () => {
    const document = await release();
    const steps = stepTexts(document, 'deploy').join('\n');
    const settings = stepIndex(document, 'deploy', 'The deploy settings are stored');
    const smoke = stepIndex(document, 'deploy', 'node scripts/smoke.mjs');
    const script = stepScript(document, 'deploy', 'The deploy settings are stored');

    expect(settings).toBeGreaterThan(-1);
    expect(settings).toBeLessThan(stepIndex(document, 'deploy', 'azure/login@'));
    expect(smoke).toBeGreaterThan(settings);
    for (const name of ['AZURE_CLIENT_ID', 'AZURE_TENANT_ID', 'AZURE_SUBSCRIPTION_ID']) {
      expect(script).toContain(name);
    }
    expect(steps).toContain('secrets.ROSETTA_SMOKE_PASSWORD');
    expect(steps).toContain('vars.ROSETTA_PUBLIC_URL');
  });

  it('RF-1304 a missing setting stops the job with its name and no value', async () => {
    const script = stepScript(await release(), 'deploy', 'The deploy settings are stored');
    const result = await runStep(script, {
      AZURE_CLIENT_ID: 'value-client',
      AZURE_TENANT_ID: 'value-tenant',
      AZURE_SUBSCRIPTION_ID: 'value-subscription',
      ROSETTA_SMOKE_USER: 'value-user',
      ROSETTA_PUBLIC_URL: 'https://example.test',
    });

    expect(result.code).not.toBe(0);
    expect(result.output).toContain('ROSETTA_SMOKE_PASSWORD');
    expect(result.output).not.toContain('value-');
  });
});

let az: FakeAz | undefined;
afterEach(async () => {
  await az?.dispose();
  az = undefined;
});

/** Runs the migrate step of the deploy job against a fake az whose execution reports `statuses`. */
async function migrate(statuses: string): Promise<{ code: number; calls: string[] }> {
  az = await fakeAz(statuses);
  const script = stepScript(await release(), 'deploy', 'Migrate with the new image');
  const env = {
    ...az.env,
    AZ_RG: 'rg-rosetta',
    AZ_MIGRATE_JOB: 'caj-rosetta-migrate',
    IMAGE: image,
    SHA_TAG: 'sha-0000000',
  };
  const { code } = await runStep(script, env, az.prelude);
  return { code, calls: await az.calls() };
}

describe('release.yml deploy job login (P1-184, ADR-024)', () => {
  it('ADR-024 logs in with azure/login over OIDC, with the production variables and no creds', async () => {
    const steps = at(await release(), 'jobs', 'deploy', 'steps');
    const login: unknown = (Array.isArray(steps) ? steps : []).find((step: unknown) =>
      String(at(step, 'uses')).startsWith('azure/login@'),
    );

    expect(at(login, 'with')).toEqual({
      'client-id': '${{ vars.AZURE_CLIENT_ID }}',
      'tenant-id': '${{ vars.AZURE_TENANT_ID }}',
      'subscription-id': '${{ vars.AZURE_SUBSCRIPTION_ID }}',
    });
  });

  it('RNF-003 only the deploy job may request an OIDC token', async () => {
    const document = await release();
    const jobs = keysOf(at(document, 'jobs'));

    expect(jobs.filter((job) => at(document, 'jobs', job, 'permissions', 'id-token'))).toEqual([
      'deploy',
    ]);
    expect(at(document, 'jobs', 'deploy', 'permissions', 'id-token')).toBe('write');
    expect(at(document, 'permissions', 'id-token')).toBeUndefined();
  });

  it('RNF-003 logs out of Azure even when a step failed', async () => {
    const steps = at(await release(), 'jobs', 'deploy', 'steps');
    const last: unknown = Array.isArray(steps) ? steps.at(-1) : undefined;

    expect(at(last, 'if')).toBe('always()');
    expect(at(last, 'run')).toContain('az logout');
  });
});

describe('release.yml deploy job migrate and update (P1-184, ADR-024)', () => {
  it('DEC-140 runs the migrate job before it sets the new image, then waits for /healthz and smokes', async () => {
    const document = await release();
    const login = stepIndex(document, 'deploy', 'azure/login@');
    const start = stepIndex(document, 'deploy', 'az containerapp job start');
    const update = stepIndex(document, 'deploy', 'az containerapp update');
    const health = stepIndex(document, 'deploy', '/healthz');
    const smoke = stepIndex(document, 'deploy', 'node scripts/smoke.mjs');

    expect(login).toBeGreaterThan(stepIndex(document, 'deploy', 'zap-baseline'));
    expect(start).toBeGreaterThan(login);
    expect(update).toBeGreaterThan(start);
    expect(health).toBeGreaterThan(update);
    expect(smoke).toBeGreaterThan(health);
    expect(stepScript(document, 'deploy', 'Set the new image')).toContain(
      'az containerapp update --name "$AZ_APP" --resource-group "$AZ_RG" --image "$IMAGE:$SHA_TAG"',
    );
    expect(at(document, 'jobs', 'deploy', 'env', 'IMAGE')).toBe(image);
    expect(at(document, 'jobs', 'deploy', 'env', 'SHA_TAG')).toBe(
      '${{ needs.image.outputs.sha-tag }}',
    );
  });

  it('DEC-140 the migrate step passes only when the execution Succeeded, after it set the new image', async () => {
    const { code, calls } = await migrate('Running Running Succeeded');

    expect(code).toBe(0);
    expect(calls[0]).toContain('containerapp job update --name caj-rosetta-migrate');
    expect(calls[0]).toContain(`--image ${image}:sha-0000000`);
    expect(calls[1]).toContain('containerapp job start');
    expect(calls.filter((call) => call.includes('execution show'))).toHaveLength(3);
  });

  it.each(['Failed', 'Stopped', 'Degraded', 'Unknown'])(
    'DEC-140 the migrate step fails when the execution ends %s, so the image is not changed',
    async (status) => {
      expect((await migrate(`Running ${status}`)).code).not.toBe(0);
    },
  );

  it('RF-1304 waits until the latest revision is ready and /healthz answers over HTTPS', async () => {
    const script = stepScript(await release(), 'deploy', 'Wait for the new revision');

    expect(script).toContain('latestReadyRevisionName');
    expect(script).toContain('"$ROSETTA_PUBLIC_URL/healthz"');
    expect(script).toContain('exit 1');
  });
});
