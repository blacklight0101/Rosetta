import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { fencedBlocks, section } from '../../support/release-docs.js';

// RF-801, P1-52: the README quick start, followed literally on a fresh clone, reaches the signed-in
// start page. A missing file reads as empty so the checks fail on their assertions.
const read = (name: string): Promise<string> =>
  readFile(new URL(`../../../${name}`, import.meta.url), 'utf8').catch(() => '');

const readme = await read('README.md');
const quickStart = section(readme, '## Quick start');
const blocks = fencedBlocks(quickStart);
const powershell = blocks.filter((block) => block.lang === 'powershell');
const bash = blocks.filter((block) => block.lang === 'bash');
const commands = blocks.map((block) => block.body).join('\n');
const ps = powershell[0]?.body ?? '';
const sh = bash[0]?.body ?? '';
const shells = [
  ['PowerShell', ps],
  ['bash', sh],
] as const;

const compose = await read('compose.yaml');
const envExample = await read('.env.example');
const required = [...new Set(compose.match(/(?<=\$\{)ROSETTA_[A-Z_]+(?=:\?)/gu) ?? [])];
const REQUIRED_NAMES = [...required, 'ROSETTA_ADMIN_PASSWORD'];

describe('README quick start: the two shells', () => {
  it('RF-801 reads the required variables from compose.yaml (guards the test itself)', () => {
    expect([...required].sort()).toEqual([
      'ROSETTA_APP_DB_PASSWORD',
      'ROSETTA_DB_ADMIN_PASSWORD',
      'ROSETTA_MIGRATOR_DB_PASSWORD',
      'ROSETTA_SECRET_KEY',
    ]);
  });

  it('RF-801 clones the repository into a new folder and enters it', () => {
    expect(commands).toContain('git clone https://github.com/blacklight0101/Rosetta.git');
    expect(commands).toMatch(/^cd Rosetta$/mu);
  });

  it('RF-801 gives one block for Windows PowerShell and one for bash', () => {
    expect(powershell).toHaveLength(1);
    expect(bash).toHaveLength(1);
  });

  it.each(shells)('RF-801 the %s block copies .env.example and sets every value', (_name, body) => {
    expect(body).toMatch(/\.env\.example\s+\.env\b/u);
    expect(REQUIRED_NAMES.filter((name) => !body.includes(name))).toEqual([]);
  });

  it('RF-801 keeps each block to its own shell', () => {
    expect(ps).not.toMatch(/openssl|&&|\|\||\?\?|\bsed\b/u);
    expect(sh).not.toMatch(/Copy-Item|Get-Content|Set-Content|ForEach-Object|\[Convert\]/u);
  });
});

describe('README quick start: the secrets', () => {
  it('RF-801 sets only variables that exist as a line of .env.example', () => {
    const names = new Set(commands.match(/\bROSETTA_[A-Z_]+/gu) ?? []);

    expect(names.size).toBeGreaterThanOrEqual(REQUIRED_NAMES.length);
    expect([...names].filter((n) => !new RegExp(`^${n}=`, 'mu').test(envExample))).toEqual([]);
  });

  it('RF-801 generates the secret key with 32 random bytes in base64 on both shells', () => {
    expect(sh).toContain('openssl rand -base64 32');
    expect(ps).toMatch(/RandomNumberGenerator/u);
    expect(ps).toMatch(/ToBase64String/u);
    expect(ps).toContain('[Convert]::ToBase64String((New-RandomBytes 32))');
  });

  it('RF-801 generates the three database passwords and the administrator password as hex', () => {
    expect(sh).toContain('openssl rand -hex');
    expect(ps).toContain("ToString('x2')");
  });

  it('RF-801 never prints a literal secret', () => {
    expect(commands).not.toMatch(/AAAAAAAAAAAA/u);
    expect(commands).not.toMatch(/PASSWORD=[A-Za-z0-9]/u);
  });
});

describe('README quick start: start and first sign-in', () => {
  it('RF-801 starts the stack with build and wait, after the values are set', () => {
    const start = commands.indexOf('docker compose up -d --build --wait');

    expect(start).toBeGreaterThan(commands.indexOf('ROSETTA_SECRET_KEY'));
    expect(commands).not.toMatch(/docker compose up -d --build(?! --wait)/u);
  });

  it('RF-801 shows the administrator name and password so the first sign-in can follow', () => {
    expect(commands).toContain('ROSETTA_ADMIN_USER');
    expect(commands).toContain('ROSETTA_ADMIN_PASSWORD');
  });

  it('RF-801 says what the all-zero key of .env.example does and why the key is generated', () => {
    expect(quickStart).toContain('RST-1008');
    expect(quickStart).toMatch(/all-zero/iu);
  });

  it('RF-801 opens the address and names the first sign-in and the password change', () => {
    expect(quickStart).toContain('http://127.0.0.1:8080');
    expect(quickStart).toMatch(/sign in as/iu);
    expect(quickStart).toMatch(/choose a new password/iu);
  });

  it('RF-801 says how to stop, how to delete the data and links the runbook', () => {
    expect(quickStart).toContain('docker compose down');
    expect(quickStart).toContain('docker compose down -v');
    expect(quickStart).toContain('docs/runbooks/local.md');
  });

  it('RF-801 names the Docker Compose version that supports wait', () => {
    expect(quickStart).toMatch(/Compose v2\.\d+/u);
  });
});

describe('docs/runbooks/local.md matches the quick start', () => {
  it('RF-801 gives the PowerShell way to generate each secret next to the openssl one', async () => {
    const runbook = await read('docs/runbooks/local.md');
    const prepare = section(runbook, '## 1. Prepare .env');

    expect(prepare).toContain('openssl rand -base64 32');
    expect(prepare).toContain('ToBase64String');
    expect(prepare).toContain("ToString('x2')");
  });

  it('RF-801 starts the stack with the same command as the README', async () => {
    const runbook = await read('docs/runbooks/local.md');
    const start = fencedBlocks(section(runbook, '## 2. Start the stack'));

    expect(start[0]?.body).toBe('docker compose up -d --build --wait');
  });
});
