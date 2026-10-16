import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';

// RF-1301, RNF-014, RNF-003, ADR-014, ADR-016: compose.yaml and its CI overlay compose.ci.yaml are
// parsed and checked as data (no Docker daemon needed, so Windows and Linux both run them); the
// stack itself runs in the compose-smoke job of CI. A missing file reads as an empty one so the
// checks fail on their assertions, not on ENOENT.
const service = z.object({
  image: z.string().optional(),
  build: z.object({ context: z.string(), target: z.string().optional() }).optional(),
  command: z.array(z.string()).optional(),
  ports: z.array(z.string()).optional(),
  environment: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  volumes: z.array(z.string()).optional(),
  extra_hosts: z.array(z.string()).optional(),
  healthcheck: z
    .object({ test: z.array(z.string()).optional(), disable: z.boolean().optional() })
    .optional(),
  restart: z.string().optional(),
  depends_on: z.record(z.string(), z.object({ condition: z.string() })).optional(),
});
const composeFile = z.object({
  services: z.record(z.string(), service).default({}),
  volumes: z.record(z.string(), z.unknown()).default({}),
});
type ComposeFile = z.output<typeof composeFile>;
type Service = z.output<typeof service>;

const COMPOSE = 'compose.yaml';
const OVERLAY = 'compose.ci.yaml';

async function readText(name: string): Promise<string> {
  return readFile(new URL(`../../../${name}`, import.meta.url), 'utf8').catch(() => '');
}

async function load(name: string): Promise<ComposeFile> {
  return composeFile.parse(parse(await readText(name)) ?? {});
}

const appOf = (file: ComposeFile): Service => file.services['app'] ?? {};
const dbOf = (file: ComposeFile): Service => file.services['db'] ?? {};
const environmentOf = (entry: Service): Record<string, string | number | boolean> =>
  entry.environment ?? {};

describe('compose.yaml: db service', () => {
  it('RF-1301 runs PostgreSQL 17 pinned by digest as the db service', async () => {
    const db = dbOf(await load(COMPOSE));

    expect(db.image).toMatch(/^postgres:17@sha256:[0-9a-f]{64}$/u);
  });

  it('RF-1301 keeps the database in the named volume pgdata', async () => {
    const file = await load(COMPOSE);

    expect(dbOf(file).volumes).toContain('pgdata:/var/lib/postgresql/data');
    expect(Object.keys(file.volumes)).toContain('pgdata');
  });

  it('RNF-014 publishes the database port on 127.0.0.1 only', async () => {
    expect(dbOf(await load(COMPOSE)).ports).toEqual(['127.0.0.1:5432:5432']);
  });

  it('RF-1301 bootstraps the image with its default superuser, not a Rosetta role', async () => {
    expect(environmentOf(dbOf(await load(COMPOSE)))).not.toHaveProperty('POSTGRES_USER');
  });

  it('RNF-003 takes the database password from .env, never from the file', async () => {
    const environment = environmentOf(dbOf(await load(COMPOSE)));

    expect(environment['POSTGRES_PASSWORD']).toMatch(/^\$\{ROSETTA_DB_ADMIN_PASSWORD:\?/u);
  });

  it('RF-1301 the db service creates the application roles from an init folder and the .env passwords', async () => {
    const db = dbOf(await load(COMPOSE));
    const environment = environmentOf(db);

    expect(db.volumes).toContain('./db/init:/docker-entrypoint-initdb.d:ro');
    expect(environment['ROSETTA_APP_DB_PASSWORD']).toMatch(/^\$\{ROSETTA_APP_DB_PASSWORD:\?/u);
    expect(environment['ROSETTA_MIGRATOR_DB_PASSWORD']).toMatch(
      /^\$\{ROSETTA_MIGRATOR_DB_PASSWORD:\?/u,
    );
  });
});

describe('compose.yaml: app service', () => {
  it('RF-1301 builds the app from the Dockerfile runtime stage', async () => {
    const app = appOf(await load(COMPOSE));

    expect(app.build?.context).toBe('.');
    expect(app.build?.target ?? 'runtime').toBe('runtime');
  });

  it('RNF-014 publishes the app on 127.0.0.1:8080 and nothing is published beyond 127.0.0.1', async () => {
    const file = await load(COMPOSE);
    const published = Object.values(file.services).flatMap((entry) => entry.ports ?? []);

    expect(appOf(file).ports).toEqual(['127.0.0.1:8080:8080']);
    expect(published.length).toBeGreaterThan(0);
    for (const port of published) expect(port).toMatch(/^127\.0\.0\.1:/u);
  });

  it('RF-1301 lets the container reach the Ollama of the host through host.docker.internal', async () => {
    const app = appOf(await load(COMPOSE));

    expect(app.extra_hosts).toContain('host.docker.internal:host-gateway');
  });

  it('RF-1301 keeps the data folder in the named volume rosetta-data', async () => {
    const file = await load(COMPOSE);

    expect(appOf(file).volumes).toContain('rosetta-data:/data');
    expect(Object.keys(file.volumes).sort()).toEqual(['pgdata', 'rosetta-data']);
  });

  it('RF-1301 starts after a healthy database, checks its own health and restarts', async () => {
    const file = await load(COMPOSE);
    const app = appOf(file);

    expect(app.depends_on?.['db']?.condition).toBe('service_healthy');
    expect(app.healthcheck?.test?.join(' ')).toContain('/healthz');
    expect(dbOf(file).healthcheck?.test?.join(' ')).toContain('pg_isready');
    expect(app.restart).toBe('unless-stopped');
    expect(dbOf(file).restart).toBe('unless-stopped');
  });
});

describe('compose.yaml: app service configuration', () => {
  it('RF-1302 serves as rosetta_app with the password from .env (DATABASE_URL only, DEC-140)', async () => {
    const environment = environmentOf(appOf(await load(COMPOSE)));

    expect(environment['DATABASE_URL']).toMatch(
      /^postgres:\/\/rosetta_app:\$\{ROSETTA_APP_DB_PASSWORD:\?[^}]+\}@db:5432\/rosetta$/u,
    );
    expect(environment).not.toHaveProperty('DATABASE_MIGRATOR_URL');
  });

  it('RF-1301 sets the public URL to the published address and the data folder to /data', async () => {
    const environment = environmentOf(appOf(await load(COMPOSE)));

    expect(environment['ROSETTA_PUBLIC_URL']).toBe('http://127.0.0.1:8080');
    expect(environment['ROSETTA_DATA_DIR']).toBe('/data');
  });

  it('RF-1301 points Ollama at the host by default and never turns the test mode on', async () => {
    const environment = environmentOf(appOf(await load(COMPOSE)));

    expect(environment['ROSETTA_OLLAMA_URL']).toContain('http://host.docker.internal:11434');
    expect(environment).not.toHaveProperty('ROSETTA_TEST');
    expect(environment).not.toHaveProperty('ROSETTA_TEST_DATABASE_URL');
  });
});

describe('compose files: secrets', () => {
  const secretName = /PASSWORD|SECRET|KEY|TOKEN/u;

  it.each([COMPOSE, OVERLAY])(
    'RNF-003 %s holds no secret value: each one is read from .env',
    async (name) => {
      const file = await load(name);
      const literal = Object.values(file.services)
        .flatMap((entry) => Object.entries(environmentOf(entry)))
        .filter(([key, value]) => secretName.test(key) && String(value) !== '')
        .filter(([, value]) => !String(value).startsWith('${'))
        .map(([key]) => key);

      expect(literal).toEqual([]);
    },
  );

  it.each([COMPOSE, OVERLAY])('RNF-003 %s embeds no credentials in a URL', async (name) => {
    const file = await load(name);
    const urls = Object.values(file.services)
      .flatMap((entry) => Object.values(environmentOf(entry)))
      .map(String)
      .filter((value) => value.includes('://') && value.includes('@'));

    for (const url of urls) expect(url).toMatch(/^postgres:\/\/\w+:\$\{[A-Z_]+:\?[^}]+\}@/u);
  });

  it('RNF-003 the .env of the stack is ignored by git', async () => {
    expect(await readText('.gitignore')).toMatch(/^\.env$/mu);
  });
});

describe('compose.ci.yaml', () => {
  it('RNF-005 runs the image test stage with the test mode on and starts the test doubles', async () => {
    const app = appOf(await load(OVERLAY));
    const environment = environmentOf(app);

    expect(app.build?.target).toBe('test');
    expect(String(environment['ROSETTA_TEST'])).toBe('1');
    expect(app.command?.join(' ')).toContain('tests/compose/serve.ts');
  });

  it('RNF-005 gives the test server the database URL of the app so the network guard allows it', async () => {
    const environment = environmentOf(appOf(await load(OVERLAY)));

    expect(environment['ROSETTA_TEST_DATABASE_URL']).toMatch(
      /^postgres:\/\/rosetta_app:\$\{ROSETTA_APP_DB_PASSWORD:\?[^}]+\}@db:5432\/rosetta$/u,
    );
  });

  it('RNF-014 adds no published port of its own', async () => {
    const file = await load(OVERLAY);

    expect(Object.values(file.services).flatMap((entry) => entry.ports ?? [])).toEqual([]);
  });

  it('RNF-005 the entry file it starts is in the repository and builds the test doubles', async () => {
    expect(await readText('tests/compose/serve.ts')).toContain('TestDoubles.create');
  });
});

describe('db/init/roles.sh', () => {
  it('RF-1301 creates rosetta_app and rosetta_migrator as login roles with passwords from the environment', async () => {
    const text = await readText('db/init/roles.sh');

    expect(text.startsWith('#!/usr/bin/env bash\n')).toBe(true);
    expect(text).toContain('ON_ERROR_STOP=1');
    expect(text).toMatch(/CREATE ROLE rosetta_migrator LOGIN/u);
    expect(text).toMatch(/CREATE ROLE rosetta_app LOGIN/u);
    expect(text).toContain('ROSETTA_APP_DB_PASSWORD');
    expect(text).toContain('ROSETTA_MIGRATOR_DB_PASSWORD');
  });

  it('ADR-016 makes the migrator own the database and passes the passwords as quoted psql variables', async () => {
    const text = await readText('db/init/roles.sh');

    expect(text).toMatch(/ALTER DATABASE rosetta OWNER TO rosetta_migrator/u);
    expect(text).toContain(":'app_password'");
    expect(text).toContain(":'migrator_password'");
  });

  it('RNF-003 holds no password literal', async () => {
    const text = await readText('db/init/roles.sh');

    expect(text).toContain('PASSWORD');
    expect(text).not.toMatch(/PASSWORD\s+'/u);
  });
});
