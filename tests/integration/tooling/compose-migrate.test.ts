import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';

// RF-1302, ADR-014, ADR-016 (DEC-140, P1-158; P1-49 F-02): compose.yaml runs the migrations in a
// one-off `migrate` service of the same image, with the migrator URL as its only credential, and
// starts the app only after that service has ended with 0. The app's environment holds no migrator
// URL or password, so `docker compose exec app env` shows none. Parsed as data, as in compose.test.ts.
const service = z.object({
  image: z.string().optional(),
  build: z.object({ context: z.string(), target: z.string().optional() }).optional(),
  command: z.array(z.string()).optional(),
  ports: z.array(z.string()).optional(),
  environment: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  volumes: z.array(z.string()).optional(),
  restart: z.string().optional(),
  depends_on: z.record(z.string(), z.object({ condition: z.string() })).optional(),
  healthcheck: z.object({ disable: z.boolean().optional() }).optional(),
});
const composeFile = z.object({ services: z.record(z.string(), service).default({}) });
type Service = z.output<typeof service>;

async function services(name: string): Promise<Record<string, Service>> {
  const text = await readFile(new URL(`../../../${name}`, import.meta.url), 'utf8').catch(() => '');
  return composeFile.parse(parse(text) ?? {}).services;
}

const environmentText = (entry: Service | undefined): string =>
  JSON.stringify(entry?.environment ?? {});

describe('compose.yaml: migrate service', () => {
  it('RF-1302 runs the migrate step of the same image as the app, once', async () => {
    const { migrate, app } = await services('compose.yaml');

    expect(migrate?.build).toEqual(app?.build);
    expect(migrate?.image).toBe(app?.image);
    expect(migrate?.command).toEqual(['node', 'dist/presentation/migrate.js']);
    expect(migrate?.restart).toBe('no');
    expect(migrate?.healthcheck?.disable).toBe(true);
  });

  it('RF-1302 migrates as rosetta_migrator with the password from .env and holds nothing else secret', async () => {
    const { migrate } = await services('compose.yaml');

    expect(Object.keys(migrate?.environment ?? {}).sort()).toEqual([
      'DATABASE_MIGRATOR_URL',
      'ROSETTA_LOG_LEVEL',
    ]);
    expect(migrate?.environment?.['DATABASE_MIGRATOR_URL']).toMatch(
      /^postgres:\/\/rosetta_migrator:\$\{ROSETTA_MIGRATOR_DB_PASSWORD:\?[^}]+\}@db:5432\/rosetta$/u,
    );
  });

  it('RF-1302 waits for a healthy database, publishes nothing and mounts no volume', async () => {
    const { migrate } = await services('compose.yaml');

    expect(migrate?.depends_on).toEqual({ db: { condition: 'service_healthy' } });
    expect(migrate?.ports).toBeUndefined();
    expect(migrate?.volumes).toBeUndefined();
  });
});

describe('compose.yaml: the app holds no migrator credential', () => {
  it('RF-1302 F-02 starts only after the migrate step ended with 0', async () => {
    const { app } = await services('compose.yaml');

    expect(app?.depends_on?.['migrate']?.condition).toBe('service_completed_successfully');
    expect(app?.depends_on?.['db']?.condition).toBe('service_healthy');
  });

  it.each(['compose.yaml', 'compose.ci.yaml'])(
    'RF-1302 F-02 the app environment of %s names no migrator URL, role or password',
    async (name) => {
      const text = environmentText((await services(name))['app']);

      expect(text).not.toContain('DATABASE_MIGRATOR_URL');
      expect(text).not.toContain('ROSETTA_MIGRATOR_DB_PASSWORD');
      expect(text).not.toContain('rosetta_migrator');
    },
  );

  it('RNF-005 the CI overlay leaves the migrate step as it is: the real image, no test mode', async () => {
    const overlay = await services('compose.ci.yaml');

    expect(overlay['migrate']).toBeUndefined();
  });
});
