import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { hasTestDatabase, useTestDatabase } from '../../support/postgres.js';
import { fixtureSecret } from '../../support/provider-key-fixtures.js';

// RF-1300, RNF-003, ADR-014: the built image, inspected and started. Linux CI only: the `image` job of
// ci.yml builds the image, exports its tag as ROSETTA_IMAGE and starts the disposable PostgreSQL;
// without both variables the suite is skipped and reported as skipped (a developer may also run it
// against an image built locally). The container gets a schema of the test database of its own.
const run = promisify(execFile);
const image = process.env['ROSETTA_IMAGE'] ?? '';
const enabled = image !== '' && hasTestDatabase;
const containerName = `rosetta-image-test-${String(process.pid)}`;

async function docker(...args: string[]): Promise<string> {
  const { stdout } = await run('docker', args, { maxBuffer: 64 * 1024 * 1024 });
  return stdout.trim();
}

/** The files and folders of the image's app folder, one path per entry. */
async function appFiles(): Promise<string[]> {
  const listing = await docker('run', '--rm', '--entrypoint', 'find', image, '/app');
  return listing.split('\n');
}

/** The container reaches the host's database through the host gateway (the same on Docker Desktop). */
function containerDatabaseUrl(schemaUrl: string): string {
  const url = new URL(schemaUrl);
  url.hostname = 'host.docker.internal';
  return url.toString();
}

/** DEC-140: the one-off migrate step of the same image; the server never migrates. */
async function migrateInContainer(schemaUrl: string): Promise<void> {
  await docker(
    'run',
    '--rm',
    '--add-host',
    'host.docker.internal:host-gateway',
    '--env',
    `DATABASE_MIGRATOR_URL=${containerDatabaseUrl(schemaUrl)}`,
    image,
    'node',
    'dist/presentation/migrate.js',
  );
}

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

async function untilHealthy(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const status = await docker('inspect', '--format', '{{.State.Health.Status}}', containerName);
    if (status === 'healthy') return;
    if (status !== 'starting') throw new Error(`The container is ${status}.`);
    await wait(1000);
  }
  throw new Error('The container did not become healthy within 60 seconds.');
}

describe.skipIf(!enabled)('the container image', () => {
  it('RF-1300 runs as a non-root user with a non-zero uid', async () => {
    const uid = await docker('run', '--rm', '--entrypoint', 'id', image, '-u');
    const configured = await docker('image', 'inspect', '--format', '{{.Config.User}}', image);

    expect(Number(uid)).toBeGreaterThan(0);
    expect(configured).not.toMatch(/^(root|0)?$/u);
  });

  it('RF-1300 declares port 8080 and a health check on /healthz', async () => {
    const ports = await docker(
      'image',
      'inspect',
      '--format',
      '{{json .Config.ExposedPorts}}',
      image,
    );
    const health = await docker(
      'image',
      'inspect',
      '--format',
      '{{json .Config.Healthcheck}}',
      image,
    );

    expect(ports).toContain('8080/tcp');
    expect(health).toContain('/healthz');
  });
});

describe.skipIf(!enabled)('the container image contents', () => {
  it('RF-1300 ships the migrations, prompts, prices, templates and the password list', async () => {
    const files = await appFiles();

    expect(files).toContain('/app/db/migrations/0001_accounts.sql');
    expect(files).toContain('/app/prices/default-prices.yaml');
    expect(files).toContain('/app/templates/project-settings.json');
    expect(files).toContain('/app/templates/report/report.css');
    expect(files).toContain('/app/templates/report/replay.js');
    expect(files).toContain('/app/src/infrastructure/security/common-passwords.txt');
    expect(files.some((file) => file.startsWith('/app/prompts/reader/'))).toBe(true);
    expect(files).toContain('/app/dist/presentation/main.js');
    expect(files).toContain('/app/dist/presentation/migrate.js');
    expect(files).toContain('/app/dist/web/index.html');
  });

  it('RF-1300 contains no .env file, no source map, no test file and no build tool', async () => {
    const files = await appFiles();

    expect(files.filter((file) => /(^|\/)\.env/u.test(file))).toEqual([]);
    expect(files.filter((file) => file.endsWith('.map'))).toEqual([]);
    expect(
      files.filter((file) => /(^|\/)tests?\/|\.(test|spec)\.[cm]?[jt]sx?$/u.test(file)),
    ).toEqual([]);
    expect(
      files.filter((file) => /^\/app\/node_modules\/(typescript|vite|vitest)\//u.test(file)),
    ).toEqual([]);
  });

  it('RNF-003 holds no secret in its environment or its layers', async () => {
    const environment = await docker('image', 'inspect', '--format', '{{json .Config.Env}}', image);
    const history = await docker('history', '--no-trunc', '--format', '{{.CreatedBy}}', image);

    for (const text of [environment, history]) {
      expect(text).not.toMatch(/SECRET_KEY|PASSWORD|API_KEY|TOKEN|DATABASE_URL|ROSETTA_TEST/u);
    }
  });
});

describe.skipIf(!enabled)('the started container', () => {
  const database = useTestDatabase();

  afterAll(async () => {
    await run('docker', ['rm', '--force', containerName]).catch(() => undefined);
  });

  it('RF-1300 RF-1302 migrates in a one-off step, then starts with the price table loaded, becomes healthy and answers /healthz', async () => {
    const schema = await database.createSchema({ migrate: false });
    const secretKey = fixtureSecret(7);
    await migrateInContainer(schema.url);
    await docker(
      'run',
      '--detach',
      '--name',
      containerName,
      '--add-host',
      'host.docker.internal:host-gateway',
      '--publish',
      '127.0.0.1::8080',
      '--health-interval',
      '2s',
      '--health-start-period',
      '1s',
      '--env',
      `DATABASE_URL=${containerDatabaseUrl(schema.url)}`,
      '--env',
      `ROSETTA_SECRET_KEY=${secretKey}`,
      '--env',
      'ROSETTA_PUBLIC_URL=http://127.0.0.1:8080',
      image,
    );
    await untilHealthy();

    const mapping = await docker('port', containerName, '8080/tcp');
    const response = await fetch(`http://${mapping.split('\n')[0] ?? ''}/healthz`);
    const manifest: unknown = JSON.parse(await readFile('package.json', 'utf8'));
    const version =
      typeof manifest === 'object' && manifest !== null && 'version' in manifest
        ? manifest.version
        : undefined;

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', version });
    expect(await docker('logs', containerName)).not.toMatch(/RST-\d{4}/u);
  }, 120_000);
});
