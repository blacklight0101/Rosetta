import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// The `db` service of compose.yaml (environments-and-delivery.md section 9). Checked as text: no
// YAML parser is in the package baseline.
async function compose(): Promise<string> {
  return readFile(new URL('../../../compose.yaml', import.meta.url), 'utf8');
}

describe('compose.yaml', () => {
  it('RF-1301 runs PostgreSQL 17 pinned by digest as the db service', async () => {
    const text = await compose();

    expect(text).toMatch(/^ {2}db:$/m);
    expect(text).toMatch(/^ {4}image: postgres:17@sha256:[0-9a-f]{64}$/m);
  });

  it('RF-1301 keeps the database in the named volume pgdata', async () => {
    const text = await compose();

    expect(text).toMatch(/^ {6}- pgdata:\/var\/lib\/postgresql\/data$/m);
    expect(text).toMatch(/^volumes:\n {2}pgdata:/m);
  });

  it('RNF-014 publishes the database port on 127.0.0.1 only', async () => {
    const ports = [...(await compose()).matchAll(/^ {6}- '?([^'\n]+)'?$/gm)]
      .map((match) => match[1] ?? '')
      .filter((entry) => /^[\d.:]+$/.test(entry));

    expect(ports).toEqual(['127.0.0.1:5432:5432']);
  });

  it('RF-1301 bootstraps the image with its default superuser, not a Rosetta role', async () => {
    const text = await compose();

    expect(text).not.toMatch(/POSTGRES_USER:/);
    expect(text).not.toMatch(/rosetta_migrator|rosetta_app/);
  });

  it('RNF-003 takes the database password from .env, never from the file', async () => {
    const text = await compose();

    expect(text).toMatch(/POSTGRES_PASSWORD: \$\{ROSETTA_DB_ADMIN_PASSWORD:\?/);
    expect(text).not.toMatch(/PASSWORD: [^$\s]/);
  });
});
