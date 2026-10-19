import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

// RF-1301, environments-and-delivery.md section 14, P1-45: the local deployment runbook and the
// README quick start. A missing file reads as empty so the checks fail on their assertions.
const read = (name: string): Promise<string> =>
  readFile(new URL(`../../../${name}`, import.meta.url), 'utf8').catch(() => '');

describe('docs/runbooks/local.md', () => {
  it('RF-1301 has a section for each step of the local deployment', async () => {
    const text = await read('docs/runbooks/local.md');

    for (const heading of [
      '## 1. Prepare .env',
      '## 2. Start the stack',
      '## 3. First sign-in',
      '## 4. Ollama on the host',
      '## 5. Stop, restart and reset',
    ]) {
      expect(text).toContain(heading);
    }
  });

  it('RF-1301 names the commands and the address', async () => {
    const text = await read('docs/runbooks/local.md');

    expect(text).toContain('cp .env.example .env');
    expect(text).toContain('docker compose up -d --build');
    expect(text).toContain('http://127.0.0.1:8080');
    expect(text).toContain('docker compose down -v');
    expect(text).toContain('host.docker.internal');
    expect(text).toContain('ROSETTA_OLLAMA_URL');
  });

  it('RF-1301 records the Ollama-on-host check as an owner check', async () => {
    expect(await read('docs/runbooks/local.md')).toMatch(/owner check/iu);
  });

  it('RF-1302 DEC-140 explains the one-off migrate step, its failures and the upgrade from a .env with a migrator URL', async () => {
    const text = await read('docs/runbooks/local.md');

    expect(text).toContain('docker compose run --rm migrate');
    expect(text).toContain('docker compose logs migrate');
    expect(text).toContain('DATABASE_MIGRATOR_URL');
    expect(text).toContain('RST-2405');
  });

  it('RNF-003 shows no password value, only how to generate one', async () => {
    const text = await read('docs/runbooks/local.md');

    expect(text).toContain('openssl rand');
    expect(text).not.toMatch(/PASSWORD=[A-Za-z0-9]/u);
  });
});

describe('docs/runbooks/local.md, analysing a project from a zip', () => {
  it('RF-128 RF-134 explains how to make a zip on Windows and macOS, the limit and what is left out', async () => {
    const text = await read('docs/runbooks/local.md');
    const section = text.split('## Analysing a project from a zip')[1]?.split('\n## ')[0] ?? '';

    expect(section).toContain('Send to');
    expect(section).toContain('Compressed (zipped) folder');
    expect(section).toContain('Compress');
    expect(section).toContain('ROSETTA_UPLOAD_MAX_MB');
    expect(section).toContain('node_modules');
    expect(section).toMatch(/second confirmation/iu);
    expect(section).toMatch(/never links outside Rosetta/iu);
  });
});

describe('README quick start', () => {
  it('RF-1301 shows the Compose quick start and links the runbook', async () => {
    const text = await read('README.md');
    const quickStart = text.slice(text.indexOf('## Quick start'));

    expect(text).toContain('## Quick start');
    expect(quickStart).toContain('cp .env.example .env');
    expect(quickStart).toContain('docker compose up -d --build');
    expect(quickStart).toContain('http://127.0.0.1:8080');
    expect(quickStart).toContain('docs/runbooks/local.md');
  });
});

it('RNF-003 preserves the placeholder before rotating stored provider keys', async () => {
  const text = await read('docs/runbooks/local.md');
  const prepare = text.split('## 2. Start the stack')[0] ?? '';
  expect(prepare).toMatch(/all-zero placeholder[\s\S]*ROSETTA_SECRET_KEY_PREVIOUS/u);
  expect(prepare).toMatch(/ROSETTA_SECRET_KEY_PREVIOUS[\s\S]*before[\s\S]*new key/u);
  expect(prepare).toContain('Re-encrypted');
  expect(prepare).toMatch(/remove[\s\S]*ROSETTA_SECRET_KEY_PREVIOUS/u);
});
