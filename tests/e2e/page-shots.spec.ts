import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { expect, test } from './support/fixtures.js';
import { e2ePort } from './support/server-config.js';

// RNF-010, P1-13: `node scripts/page-shots.mjs <path>` starts a test server of its own, opens the
// page at each viewport and colour scheme of the orchestration README (1280x800 and 360x780, light
// and dark), saves one PNG each and lists the console errors, for the verifier's page walk.

const run = promisify(execFile);
const script = join(process.cwd(), 'scripts', 'page-shots.mjs');
const projectNames = ['desktop-light', 'desktop-dark', 'phone-light', 'phone-dark'];
const expectedShots = [
  'sign-in-desktop-dark',
  'sign-in-desktop-light',
  'sign-in-phone-dark',
  'sign-in-phone-light',
];

test.describe('page shots', () => {
  test('RNF-010 saves a PNG per viewport and colour scheme and the console errors', async ({
    network,
  }, info) => {
    // The script waits up to 120 s for its server (the e2e webServer bound), then takes the shots.
    test.setTimeout(240_000);
    const out = await mkdtemp(join(tmpdir(), 'rosetta-shots-'));
    // Each project of the run uses a server port of its own, because the projects run in parallel.
    const port = e2ePort() + 1 + projectNames.indexOf(info.project.name);

    try {
      await run('node', [script, '/sign-in', '--out', out, '--port', String(port)], {
        timeout: 180_000,
      });
      const files = (await readdir(out)).sort();
      const report: unknown = JSON.parse(await readFile(join(out, 'console-errors.json'), 'utf8'));

      expect(files).toEqual(['console-errors.json', ...expectedShots.map((name) => `${name}.png`)]);
      for (const name of expectedShots) {
        expect((await stat(join(out, `${name}.png`))).size).toBeGreaterThan(1000);
      }
      expect(report).toMatchObject({ path: '/sign-in', screenshots: expectedShots, errors: [] });
      expect(network.takeBlocked()).toEqual([]);
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  });
});
