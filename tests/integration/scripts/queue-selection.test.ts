import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// RF-1108, #771: the queue test (tagged @queue) runs only in the `queue` project of
// playwright.config.ts. The four view projects exclude it with grepInvert; if they stop excluding it,
// it runs beside other specs again and the queue position is no longer its own.

const run = promisify(execFile);
const cli = join(process.cwd(), 'node_modules', '@playwright', 'test', 'cli.js');

/** The text Playwright printed before a non-zero exit, from the error execFile raised. */
function outputOf(error: unknown): string {
  const streams = z
    .object({ stdout: z.string().optional(), stderr: z.string().optional() })
    .safeParse(error);
  return streams.success ? `${streams.data.stdout ?? ''}${streams.data.stderr ?? ''}` : '';
}

/** The number of tests a project lists for the @queue grep, from the Playwright listing. */
async function listedQueueTests(project: string): Promise<number> {
  const output = await run(
    process.execPath,
    [cli, 'test', '--list', '--project', project, '--grep', '@queue'],
    { maxBuffer: 16 * 1024 * 1024 },
  ).then(
    (done) => `${done.stdout}${done.stderr}`,
    (error: unknown) => outputOf(error),
  );
  const total = /Total: (\d+) tests?/u.exec(output);
  if (total?.[1] !== undefined) return Number(total[1]);
  if (/no tests found/iu.test(output)) return 0;
  throw new Error(`Playwright did not list project ${project}: ${output.slice(0, 400)}`);
}

describe('playwright.config.ts keeps the @queue test in the queue project (RF-1108, #771)', () => {
  it.each(['desktop-light', 'desktop-dark', 'phone-light', 'phone-dark'])(
    'RF-1108 the %s view project lists no @queue test',
    async (project) => {
      expect(await listedQueueTests(project)).toBe(0);
    },
    300_000,
  );

  it('RF-1108 the queue project lists exactly the queue test', async () => {
    expect(await listedQueueTests('queue')).toBe(1);
  }, 300_000);
});
