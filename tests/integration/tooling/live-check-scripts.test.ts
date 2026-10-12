import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// RF-404, ADR-008: the manual live check of the Anthropic adapter. It is never run by tests or
// CI; this test only checks that the npm script loads .env by itself and that the script takes the
// key from the environment it loaded, so the owner runs it without extra flags.

const packageSchema = z.object({ scripts: z.record(z.string(), z.string()) });

async function text(name: string): Promise<string> {
  return readFile(join(process.cwd(), name), 'utf8').catch(() => '');
}

describe('live:anthropic', () => {
  it('RF-404 the npm script builds Rosetta and runs the live check with node --env-file=.env', async () => {
    const { scripts } = packageSchema.parse(JSON.parse(await text('package.json')));

    expect(scripts['live:anthropic']).toBe(
      'npm run build && node --env-file=.env scripts/anthropic-live-check.mjs',
    );
  });

  it('RF-404 the live check reads ANTHROPIC_API_KEY and refuses to run under ROSETTA_TEST=1', async () => {
    const script = await text('scripts/anthropic-live-check.mjs');

    expect(script).toContain('process.env.ANTHROPIC_API_KEY');
    expect(script).toContain("process.env.ROSETTA_TEST === '1'");
    expect(script).toContain('infrastructure/providers/anthropic/anthropic-provider.js');
  });
});
