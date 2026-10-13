import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// RF-1300, ADR-014, DEC-61: the Dockerfile, .dockerignore and the CI image job are checked as text
// here (no Docker daemon needed, so Windows and Linux both run them); the built image is checked in
// tests/integration/image/container-image.test.ts.
// A missing file reads as empty so the checks below fail on their assertions, not on ENOENT.
const read = (name: string): Promise<string> =>
  readFile(join(process.cwd(), name), 'utf8').catch(() => '');

interface Stage {
  readonly name: string;
  readonly from: string;
  readonly body: string;
}

/** The stages of a Dockerfile in order: name, FROM reference and the instructions up to the next FROM. */
function stagesOf(dockerfile: string): Stage[] {
  const parts = dockerfile.split(/^(?=FROM )/mu).filter((part) => part.startsWith('FROM '));
  return parts.map((part) => {
    const header = /^FROM (\S+)(?: AS (\S+))?/u.exec(part);
    return { name: header?.[2] ?? '', from: header?.[1] ?? '', body: part };
  });
}

/** The instruction lines of a stage, continuation lines joined, comments and blank lines dropped. */
const instructions = (stage: Stage | undefined): string[] =>
  (stage?.body ?? '')
    .replace(/\\\r?\n/gu, ' ')
    .split(/\r?\n/u)
    .filter((line) => line.trim() !== '' && !line.trimStart().startsWith('#'));

async function stages(): Promise<Stage[]> {
  return stagesOf(await read('Dockerfile'));
}

const named = (found: Stage[], name: string): Stage | undefined =>
  found.find((stage) => stage.name === name);

describe('Dockerfile', () => {
  it('RF-1300 is multi-stage and every stage starts from node:24-slim pinned by digest', async () => {
    const found = await stages();

    expect(found.length).toBeGreaterThanOrEqual(3);
    for (const stage of found) {
      expect(stage.from).toMatch(/^node:24-slim@sha256:[0-9a-f]{64}$/u);
    }
  });

  it('RF-1300 names the build, test and runtime stages, the runtime stage last so it is the default target', async () => {
    const names = (await stages()).map((stage) => stage.name);

    expect(names).toContain('build');
    expect(names).toContain('test');
    expect(names.at(-1)).toBe('runtime');
    expect(names.indexOf('test')).toBeLessThan(names.indexOf('runtime'));
  });

  it('RF-1300 the build stage installs with npm ci and runs npm run build', async () => {
    const lines = instructions(named(await stages(), 'build')).join('\n');

    expect(lines).toMatch(/npm ci --ignore-scripts/u);
    expect(lines).toMatch(/npm run build/u);
  });

  it('RF-1300 the build stage removes source maps and the incremental build file from the built server', async () => {
    const lines = instructions(named(await stages(), 'build')).join('\n');

    expect(lines).toMatch(/\*\.map/u);
    expect(lines).toMatch(/\.tsbuildinfo/u);
  });
});

describe('Dockerfile runtime stage', () => {
  it('RF-1300 the runtime stage takes production dependencies only, installed without install scripts', async () => {
    const found = await stages();
    const install = instructions(named(found, 'deps')).join('\n');
    const runtime = instructions(found.at(-1)).join('\n');

    expect(install).toMatch(/npm ci --omit=dev --ignore-scripts/u);
    expect(runtime).toMatch(/COPY --from=deps \S*\/node_modules/u);
    expect(runtime).not.toMatch(/npm ci|npm run build|tsc|vite/u);
  });

  it('RF-1300 the runtime stage ships the built server, the front end, migrations, prompts, prices, templates and the password list', async () => {
    const copies = instructions((await stages()).at(-1)).filter((line) => line.startsWith('COPY'));
    const joined = copies.join('\n');

    expect(joined).toMatch(/--from=build \S*\/dist\b/u);
    for (const shipped of ['db/migrations', 'prompts', 'prices', 'templates', 'package.json']) {
      expect(joined).toContain(shipped);
    }
    expect(joined).toContain('src/infrastructure/security/common-passwords.txt');
  });

  it('RF-1300 runs as a non-root user, listens on 8080 and checks /healthz', async () => {
    const lines = instructions((await stages()).at(-1));
    const user = lines.filter((line) => line.startsWith('USER '));
    const health = lines.find((line) => line.startsWith('HEALTHCHECK'));

    expect(user).toHaveLength(1);
    expect(user[0]).not.toMatch(/^USER (root|0)\b/u);
    expect(lines).toContain('EXPOSE 8080');
    expect(health).toContain('/healthz');
    expect(health).toContain('8080');
  });

  it('RF-1300 starts the built server and puts the data folder at /data', async () => {
    const lines = instructions((await stages()).at(-1));

    expect(lines).toContain('CMD ["node", "dist/presentation/main.js"]');
    expect(lines.some((line) => /^ENV .*ROSETTA_DATA_DIR=\/data/u.test(line))).toBe(true);
  });
});

describe('Dockerfile secrets and fakes', () => {
  it('RNF-003 the runtime stage sets no secret, copies no .env and carries no test code', async () => {
    const lines = instructions((await stages()).at(-1)).join('\n');

    expect(lines).not.toMatch(/SECRET_KEY|PASSWORD|API_KEY|TOKEN|DATABASE_URL/u);
    expect(lines).not.toMatch(/\.env/u);
    expect(lines).not.toMatch(/COPY[^\n]* (\.\/)?tests?\b/u);
    expect(lines).not.toMatch(/ROSETTA_TEST/u);
  });

  it('DEC-112 only the test stage carries the fakes: it sets ROSETTA_TEST and copies the test support code', async () => {
    const lines = instructions(named(await stages(), 'test')).join('\n');

    expect(lines).toMatch(/ROSETTA_TEST=1/u);
    expect(lines).toMatch(/COPY[^\n]* tests\b/u);
  });
});

describe('.dockerignore', () => {
  const entries = async (): Promise<string[]> =>
    (await read('.dockerignore'))
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));

  it('RNF-003 keeps every .env file, the git history and node_modules out of the build context', async () => {
    expect(await entries()).toEqual(
      expect.arrayContaining(['.env', '.env.*', '.git', 'node_modules']),
    );
  });

  it('RF-1300 keeps source maps, coverage and local build output out of the build context', async () => {
    expect(await entries()).toEqual(expect.arrayContaining(['**/*.map', 'coverage', 'dist']));
  });

  it('RF-506 ships templates/report with its stylesheet and script: both exist, the runtime stage copies the folder to /app/templates and no entry leaves them out of the build context', async () => {
    const runtime = instructions((await stages()).at(-1)).join('\n');
    const ignored = await entries();

    expect(await read('templates/report/report.css')).not.toBe('');
    expect(await read('templates/report/replay.js')).not.toBe('');
    expect(runtime).toMatch(/^COPY templates \.\/templates$/mu);
    expect(ignored.filter((entry) => /templates|^\*\*?\/?\*\.(css|js)$/u.test(entry))).toEqual([]);
  });
});

describe('CI image job', () => {
  async function imageJob(): Promise<string> {
    const text = await read('.github/workflows/ci.yml');
    const start = text.search(/^ {2}image:\s*$/mu);
    if (start < 0) return '';
    const rest = text.slice(start + 1);
    const next = rest.search(/^ {2}[\w-]+:\s*$/mu);
    return next < 0 ? rest : rest.slice(0, next);
  }

  it('RF-1300 builds the Dockerfile on Linux with a timeout', async () => {
    const job = await imageJob();

    expect(job).toContain('runs-on: ubuntu-latest');
    expect(job).toMatch(/timeout-minutes: \d+/u);
    expect(job).toMatch(/docker build\b/u);
  });

  it('RF-1300 scans the image with Trivy and fails on high and critical findings that have a fix', async () => {
    const job = await imageJob();

    expect(job).toMatch(/uses: aquasecurity\/trivy-action@[0-9a-f]{40} # v\d+\.\d+\.\d+/u);
    expect(job).toMatch(/severity: HIGH,CRITICAL/u);
    expect(job).toMatch(/ignore-unfixed: true/u);
    expect(job).toMatch(/exit-code: '1'/u);
  });

  it('RF-1300 runs the container integration test against a disposable PostgreSQL', async () => {
    const job = await imageJob();

    expect(job).toContain('image: postgres:17');
    expect(job).toContain('ROSETTA_IMAGE');
    expect(job).toContain('ROSETTA_TEST_DATABASE_URL');
    expect(job).toMatch(/tests\/integration\/image/u);
  });
});
