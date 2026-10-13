import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkPublishedIndex } from '../../../src/infrastructure/report/published-site.js';
import { auditHtml } from '../../support/html-audit.js';

// RF-800, RF-507, RNF-003: the committed `site/` folder that GitHub Pages publishes from `main`, the
// Pages workflow that publishes and smoke-tests it, and the smoke script run against a loopback
// server that serves a fixture (a stale index without the run) and the committed index.

const root = fileURLToPath(new URL('../../../', import.meta.url));
const siteFolder = `${root}site/`;
const workflowPath = `${root}.github/workflows/pages.yml`;
const runKey = '20261012-100000-understand';
const execFileAsync = promisify(execFile);
const staleFixture = fileURLToPath(
  new URL('../../fixtures/pages/index-without-run.html', import.meta.url),
);

let server: Server;
let baseUrl: string;
let served = '';

beforeAll(async () => {
  server = createServer((_request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(served);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${String(port)}/`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
});

interface SmokeOutcome {
  readonly code: number;
  readonly stderr: string;
}

async function smoke(url: string): Promise<SmokeOutcome> {
  return await execFileAsync(
    process.execPath,
    [
      '--import',
      './scripts/register-ts.mjs',
      'scripts/pages-smoke.mjs',
      url,
      runKey,
      '--attempts',
      '1',
    ],
    { cwd: root },
  ).then(
    (result) => ({ code: 0, stderr: result.stderr }),
    (error: unknown) => outcomeOf(error),
  );
}

// A failed run of the script: its exit code and its standard error, from the error execFile raises.
function outcomeOf(error: unknown): SmokeOutcome {
  const code =
    error instanceof Error && 'code' in error && typeof error.code === 'number' ? error.code : -1;
  const stderr =
    error instanceof Error && 'stderr' in error && typeof error.stderr === 'string'
      ? error.stderr
      : '';
  return { code, stderr };
}

describe('the committed site/ folder', () => {
  it('RF-800 holds the report, the replay, their assets, the index and .nojekyll, and nothing else', async () => {
    expect((await readdir(siteFolder)).sort()).toEqual(
      ['.nojekyll', 'index.html', 'replay.html', 'replay.js', 'report.css', 'report.html'].sort(),
    );
  });

  it('RF-800 its index shows the run key the Pages smoke step looks for', async () => {
    const index = await readFile(`${siteFolder}index.html`, 'utf8');

    expect(checkPublishedIndex(index, runKey)).toEqual({ ok: true });
  });

  it('RF-507 runs no script from the repository text: only the replay script loads', async () => {
    const pages = await Promise.all(
      ['index.html', 'report.html', 'replay.html'].map(async (name) =>
        auditHtml(await readFile(`${siteFolder}${name}`, 'utf8')),
      ),
    );

    expect(pages.map((page) => page.scripts)).toEqual([[], [], ['replay.js']]);
    expect(pages.flatMap((page) => page.foreignLinks)).toEqual([]);
  });
});

describe('the Pages workflow', () => {
  it('RF-800 publishes site/ from main and smoke-tests the published index after the deployment', async () => {
    const workflow = await readFile(workflowPath, 'utf8');

    expect(workflow).toContain('branches: [main]');
    expect(workflow).toContain('path: site');
    expect(workflow).toContain('needs: deploy');
    expect(workflow).toContain('scripts/pages-smoke.mjs');
    expect(workflow).toContain(`SAMPLE_RUN_KEY: ${runKey}`);
  });

  it('RNF-003 pins every action to a full commit SHA and keeps expressions out of run blocks', async () => {
    const lines = (await readFile(workflowPath, 'utf8')).split('\n');
    const unpinned = lines.filter(
      (line) => line.includes('uses:') && !/@[0-9a-f]{40}\b/u.test(line),
    );
    let runIndent: number | undefined;
    const expressionsInRun = lines.filter((line) => {
      const indent = line.length - line.trimStart().length;
      if (runIndent !== undefined && line.trim() !== '' && indent <= runIndent) {
        runIndent = undefined;
      }
      if (/^\s*run:/u.test(line)) runIndent = indent;
      return runIndent !== undefined && line.includes('${{');
    });

    expect(unpinned).toEqual([]);
    expect(expressionsInRun).toEqual([]);
  });
});

describe('scripts/pages-smoke.mjs', () => {
  it('RF-800 fails when the published index does not show the run id (fixture of a stale page)', async () => {
    served = await readFile(staleFixture, 'utf8');
    const outcome = await smoke(baseUrl);

    expect(outcome.code).toBe(1);
    expect(outcome.stderr).toContain(runKey);
  });

  it('RF-800 passes when the published index shows the run id', async () => {
    served = await readFile(`${siteFolder}index.html`, 'utf8');

    expect((await smoke(baseUrl)).code).toBe(0);
  });
});
