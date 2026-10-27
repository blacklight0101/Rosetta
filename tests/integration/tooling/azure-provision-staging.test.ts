import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeAz, type FakeAz } from '../../support/fake-az.js';
import { at, runStep, stepScript, workflowDocument } from '../../support/workflow-yaml.js';

// DEC-175, ADR-025, ADR-024: the `target` input of .github/workflows/azure-provision.yml. Production
// keeps its names; staging shares the Container Apps environment, the storage account and the
// PostgreSQL server with production and has its own app, migrate job, database and share. Staging
// never makes or sets a role password: it reads production's, and it gets no server provider keys.
// Single steps run against a fake az; nothing reaches Azure.

const provision = (): Promise<unknown> => workflowDocument('azure-provision.yml');

describe('azure-provision.yml target input', () => {
  it('DEC-175 has a required choice input target, production by default, or staging', async () => {
    const input = at(await provision(), 'on', 'workflow_dispatch', 'inputs', 'target');

    expect(at(input, 'type')).toBe('choice');
    expect(at(input, 'required')).toBe(true);
    expect(at(input, 'default')).toBe('production');
    expect(at(input, 'options')).toEqual(['production', 'staging']);
  });

  it('DEC-175 runs production only from main and staging only from develop, in the environment of the target', async () => {
    const job = at(await provision(), 'jobs', 'provision');

    expect(at(job, 'if')).toBe(
      "(inputs.target == 'production' && github.ref == 'refs/heads/main') || (inputs.target == 'staging' && github.ref == 'refs/heads/develop')",
    );
    expect(at(job, 'environment', 'name')).toBe('${{ inputs.target }}');
    expect(at(job, 'concurrency', 'group')).toBe('deploy-${{ inputs.target }}');
    expect(at(job, 'env', 'TARGET')).toBe('${{ inputs.target }}');
  });
});

let az: FakeAz | undefined;
afterEach(async () => {
  await az?.dispose();
  az = undefined;
});

/** Runs the names step for a target; returns its exit code and what it wrote to GITHUB_ENV. */
async function names(target: string): Promise<{ code: number; env: string }> {
  az = await fakeAz();
  const script = stepScript(await provision(), 'provision', 'Work out the resource names');
  const githubEnv = `${az.folder}/github-env`;
  const { code } = await runStep(script, {
    TARGET: target,
    AZURE_SUBSCRIPTION_ID: '00000000-0000-0000-0000-000000000000',
    AZ_RG: 'rg-rosetta',
    DB_SERVER: '',
    RUNNER_TEMP: az.folder,
    GITHUB_ENV: githubEnv,
  });
  return { code, env: await readFile(githubEnv, 'utf8').catch(() => '') };
}

describe('azure-provision.yml names per target', () => {
  it.each([
    {
      target: 'production',
      app: 'ca-rosetta',
      job: 'caj-rosetta-migrate',
      database: 'rosetta',
      share: 'rosetta-data',
      replicas: '1',
    },
    {
      target: 'staging',
      app: 'ca-rosetta-staging',
      job: 'caj-rosetta-stg-migrate',
      database: 'rosetta_staging',
      share: 'rosetta-data-staging',
      replicas: '0',
    },
  ])(
    'DEC-175 $target uses app $app, job $job, database $database, share $share, minimum replicas $replicas',
    async ({ target, app, job, database, share, replicas }) => {
      const { code, env } = await names(target);

      expect(code).toBe(0);
      expect(env).toContain(`AZ_APP=${app}\n`);
      expect(env).toContain(`AZ_MIGRATE_JOB=${job}\n`);
      expect(env).toContain(`AZ_DB_NAME=${database}\n`);
      expect(env).toContain(`AZ_SHARE=${share}\n`);
      expect(env).toContain(`AZ_MIN_REPLICAS=${replicas}\n`);
      // One server for both: the name comes from the subscription, not from the target.
      expect(env).toMatch(/^AZ_DB_SERVER=psql-rosetta-[0-9a-f]{8}$/mu);
    },
  );

  it('DEC-175 refuses any other target and writes nothing', async () => {
    const result = await names('qa');

    expect(result.code).not.toBe(0);
    expect(result.env).toBe('');
  });
});

const complete = {
  IMAGE_TAG: 'sha-0123abc',
  AZURE_CLIENT_ID: 'value-client',
  AZURE_TENANT_ID: 'value-tenant',
  AZURE_SUBSCRIPTION_ID: 'value-subscription',
  ROSETTA_SECRET_KEY: 'value-key',
  ROSETTA_ADMIN_USER: 'value-admin',
  ROSETTA_ADMIN_PASSWORD: 'value-password',
};

describe('azure-provision.yml staging never rotates', () => {
  it('DEC-175 refuses rotate-passwords for staging and allows it for production', async () => {
    const script = stepScript(
      await provision(),
      'provision',
      'The provisioning settings are stored',
    );
    const run = (target: string): Promise<{ code: number; output: string }> =>
      runStep(script, { ...complete, TARGET: target, ROTATE_PASSWORDS: 'true' });

    const refused = await run('staging');
    expect(refused.code).not.toBe(0);
    expect(refused.output).toContain('rotate-passwords');
    expect((await run('production')).code).toBe(0);
  });
});
