import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeAz, type FakeAz } from '../../support/fake-az.js';
import {
  at,
  runStep,
  stepIndex,
  stepScript,
  stepTexts,
  workflowDocument,
} from '../../support/workflow-yaml.js';

// ADR-024, RF-1304, RF-1306, DEC-140, P1-184: the resources that .github/workflows/azure-provision.yml
// creates, read from the workflow; single steps run against a fake az only, because running the
// workflow creates billed resources. The trigger and the owner secrets are in
// azure-provision-workflow.test.ts.

const provision = (): Promise<unknown> => workflowDocument('azure-provision.yml');
const text = async (): Promise<string> => stepTexts(await provision(), 'provision').join('\n');

describe('azure-provision.yml resources (ADR-024)', () => {
  it('ADR-024 makes the Log Analytics workspace, a Consumption-only environment and the /data share', async () => {
    const workflow = await text();

    expect(workflow).toContain('az monitor log-analytics workspace create');
    expect(workflow).toContain('az containerapp env create');
    expect(workflow).toContain('--enable-workload-profiles false');
    expect(workflow).toContain('az storage account create');
    expect(workflow).toContain('az storage share-rm create');
    expect(workflow).toContain('az containerapp env storage set');
    expect(workflow).toContain(
      'mountOptions: \\"uid=1000,gid=1000,dir_mode=0755,file_mode=0755\\"',
    );
    expect(workflow).toContain('mountPath: \\"/data\\"');
  });

  it('RF-1306 makes the PostgreSQL 17 B1MS server with 32 GiB, TLS required, Azure services only, 7 days of backups', async () => {
    const workflow = await text();

    expect(workflow).toContain('az postgres flexible-server create');
    for (const flag of [
      '--version 17',
      '--tier Burstable',
      '--sku-name Standard_B1ms',
      '--storage-size 32',
      '--backup-retention 7',
      '--public-access None',
    ]) {
      expect(workflow).toContain(flag);
    }
    expect(workflow).toContain('--name require_secure_transport --value on');
    expect(workflow).toContain('--start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0');
  });
});

describe('azure-provision.yml database (ADR-024, DEC-140)', () => {
  it('ADR-024 puts a CanNotDelete lock on the server, and warns with the owner command when it cannot', async () => {
    const script = stepScript(await provision(), 'provision', 'CanNotDelete lock');

    expect(script).toContain('az lock create');
    expect(script).toContain('--lock-type CanNotDelete');
    expect(script).toContain('Microsoft.DBforPostgreSQL/flexibleServers');
    expect(script).toContain('::warning::');
  });

  it('DEC-140 creates the two roles of data-model.md section 6 from the job, idempotently, passwords from the environment', async () => {
    const script = stepScript(await provision(), 'provision', 'Database roles');

    expect(script).toContain(
      "WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rosetta_migrator')",
    );
    expect(script).toContain(
      "WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'rosetta_app')",
    );
    expect(script).toContain("ALTER ROLE rosetta_app LOGIN PASSWORD :'app_password';");
    expect(script).toContain('ALTER DATABASE rosetta OWNER TO rosetta_migrator;');
    expect(script).toContain('GRANT USAGE ON SCHEMA public TO rosetta_app;');
    expect(script).toContain('\\getenv app_password ROSETTA_APP_DB_PASSWORD');
    expect(script).toContain('sslmode=require');
    expect(script).not.toMatch(/-v \w+_password=/u);
  });

  it('RNF-003 makes every database password in the job with openssl rand and masks it before use', async () => {
    const document = await provision();
    const server = stepScript(document, 'provision', 'PostgreSQL Flexible Server');
    const roles = stepScript(document, 'provision', 'Database roles');
    const before = (script: string, first: string, second: string): boolean =>
      script.includes(first) && script.indexOf(first) < script.indexOf(second);

    expect(server).toContain('openssl rand -hex 24 > "$SECRETS_DIR/db-admin-password"');
    expect(before(server, 'echo "::add-mask::$admin_password"', '--admin-password')).toBe(true);
    for (const file of ['app-db-password', 'migrator-db-password']) {
      expect(roles).toContain(`openssl rand -hex 24 > "$SECRETS_DIR/${file}"`);
      expect(before(roles, `echo "::add-mask::$(cat "$SECRETS_DIR/${file}")"`, 'psql')).toBe(true);
    }
    expect(stepScript(document, 'provision', 'Remove the generated values')).toContain('rm -rf');
  });
});

let az: FakeAz | undefined;
afterEach(async () => {
  await az?.dispose();
  az = undefined;
});

describe('azure-provision.yml migrate job and app (ADR-024, DEC-140)', () => {
  it('DEC-140 the migrate job holds DATABASE_MIGRATOR_URL as its only secret and runs migrate.js', async () => {
    const script = stepScript(await provision(), 'provision', 'Migrate job');

    expect(script).toContain('az containerapp job create');
    expect(script).toContain('--trigger-type Manual');
    expect(script).toContain('--command node --args dist/presentation/migrate.js');
    expect(script).toContain('DATABASE_MIGRATOR_URL=secretref:database-migrator-url');
    expect(script.match(/--secrets /gu)).toHaveLength(2);
  });

  it('DEC-140 the migrate job runs and succeeds before the app is created or updated', async () => {
    const document = await provision();
    const migrate = stepIndex(document, 'provision', 'az containerapp job start');
    const app = stepIndex(document, 'provision', 'az containerapp create');

    expect(migrate).toBeGreaterThan(stepIndex(document, 'provision', 'Database roles'));
    expect(app).toBeGreaterThan(migrate);
  });
});

describe('azure-provision.yml migrate execution (DEC-140)', () => {
  it.each([
    ['Running Succeeded', 0],
    ['Running Failed', 1],
    ['Stopped', 1],
  ])(
    'DEC-140 a migrate execution that reports %s ends the step with %i',
    async (statuses, code) => {
      az = await fakeAz(statuses);
      await writeFile(join(az.folder, 'migrator-db-password'), 'generated\n');
      const script = stepScript(await provision(), 'provision', 'Migrate job');
      const env = {
        ...az.env,
        AZ_RG: 'rg-rosetta',
        AZ_MIGRATE_JOB: 'caj-rosetta-migrate',
        AZ_DB_SERVER: 'psql-rosetta-test',
        AZ_DB_NAME: 'rosetta',
        SECRETS_DIR: az.folder,
        IMAGE: 'ghcr.io/blacklight0101/rosetta',
        IMAGE_TAG: 'sha-0000000',
      };
      const result = await runStep(script, env, az.prelude);
      const calls = await az.calls();

      expect(result.code === 0 ? 0 : 1).toBe(code);
      // The URL reaches az only as the Container Apps secret, never as a plain variable.
      expect(calls.join('\n')).toContain(
        'database-migrator-url=postgres://rosetta_migrator:generated@',
      );
      expect(calls.join('\n')).not.toContain('DATABASE_MIGRATOR_URL=postgres');
    },
  );
});

describe('azure-provision.yml Container App (ADR-024)', () => {
  it('ADR-024 the app has 0.5 vCPU, 1 GiB, one replica, external ingress on 8080 and three /healthz probes', async () => {
    const script = stepScript(await provision(), 'provision', 'Create or update the Container App');

    expect(script).toContain('resources: {cpu: 0.5, memory: "1Gi"}');
    expect(script).toContain('scale: {minReplicas: 1, maxReplicas: 1}');
    expect(script).toContain(
      'ingress: {external: true, targetPort: 8080, transport: "auto", allowInsecure: false}',
    );
    expect(script).toContain('"path": "/healthz", "port": 8080');
    for (const type of ['Startup', 'Liveness', 'Readiness'])
      expect(script).toContain(`type: "${type}"`);
  });

  it('RF-1304 every app secret is a secretref: variable; the plain ones are the proxy, the data folder and the https URL', async () => {
    const script = stepScript(await provision(), 'provision', 'Create or update the Container App');

    for (const name of [
      'DATABASE_URL',
      'ROSETTA_SECRET_KEY',
      'ROSETTA_SECRET_KEY_PREVIOUS',
      'ROSETTA_ADMIN_USER',
      'ROSETTA_ADMIN_PASSWORD',
      'OPENAI_API_KEY',
      'ANTHROPIC_API_KEY',
      'GITHUB_TOKEN',
    ]) {
      // One line of the app_env list each (the first one opens the quoted string).
      expect(script).toMatch(new RegExp(`^(?:app_env=")?${name}=secretref:[a-z-]+$`, 'mu'));
    }
    expect(script).toContain('ROSETTA_TRUST_PROXY=1');
    expect(script).toContain('ROSETTA_DATA_DIR=/data');
    expect(script).toContain('ROSETTA_PUBLIC_URL=https://$fqdn');
  });

  it('RF-1304 waits for the new revision and /healthz over HTTPS, and logs out at the end', async () => {
    const document = await provision();
    const steps = at(document, 'jobs', 'provision', 'steps');
    const last: unknown = Array.isArray(steps) ? steps.at(-1) : undefined;

    expect(stepScript(document, 'provision', 'Wait for the new revision')).toContain(
      '"$PUBLIC_URL/healthz"',
    );
    expect(at(last, 'if')).toBe('always()');
    expect(at(last, 'run')).toContain('az logout');
  });
});
