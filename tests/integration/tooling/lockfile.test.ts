import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// P1-87: npm 11.19 and later refuse `npm ci` when a root-level peer of an optional package is missing
// from the lock file ("Missing: @emnapi/core@... from lock file"). The lock file is checked as data here,
// so the check runs the same with any npm and on Windows and Linux alike (RNF-005).
const lockSchema = z.looseObject({
  packages: z.record(
    z.string(),
    z.looseObject({ version: z.string().optional(), optional: z.boolean().optional() }),
  ),
});

async function packages(): Promise<z.infer<typeof lockSchema>['packages']> {
  const text = await readFile(join(process.cwd(), 'package-lock.json'), 'utf8');
  return lockSchema.parse(JSON.parse(text)).packages;
}

describe('package-lock.json', () => {
  it('P1-87 carries the root-level @emnapi/core and @emnapi/runtime that npm 11.19 requires for the optional wasm packages', async () => {
    const found = await packages();

    for (const name of ['node_modules/@emnapi/core', 'node_modules/@emnapi/runtime']) {
      expect(found[name]?.version ?? '').toMatch(/^\d+\.\d+\.\d+$/u);
      expect(found[name]?.optional ?? false).toBe(true);
    }
  });
});
