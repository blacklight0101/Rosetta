import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MERMAID_VERSION } from '../../../../src/infrastructure/report/site/diagrams-page.js';

// RF-508, DEC-125, Q-26: the Mermaid build shipped in the report folder is the build of the version
// that package.json pins, copied as it is; no new dependency was added for it, and its licence
// notice travels with it.

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const templates = join(root, 'templates/report');
const mermaidPackage = dirname(createRequire(import.meta.url).resolve('mermaid/package.json'));
const manifest = z.object({
  version: z.string().optional(),
  dependencies: z.record(z.string(), z.string()).default({}),
  devDependencies: z.record(z.string(), z.string()).default({}),
});

async function manifestAt(folder: string): Promise<z.infer<typeof manifest>> {
  return manifest.parse(JSON.parse(await readFile(join(folder, 'package.json'), 'utf8')));
}

describe('the vendored Mermaid build', () => {
  it('RF-508 is byte for byte the build of the installed Mermaid', async () => {
    const vendored = await readFile(join(templates, 'mermaid.min.js'));

    expect(vendored.length).toBeGreaterThan(1_000_000);
    expect(vendored.equals(await readFile(join(mermaidPackage, 'dist/mermaid.min.js')))).toBe(true);
  });

  it('RF-508 DEC-125 comes from the version package.json pins, which the page names', async () => {
    const own = await manifestAt(root);
    const installed = await manifestAt(mermaidPackage);

    expect(own.devDependencies['mermaid']).toBe('12.2.0');
    expect(installed.version).toBe('12.2.0');
    expect(MERMAID_VERSION).toBe('12.2.0');
  });

  it('RF-508 DEC-125 adds no dependency for it: Mermaid stays a dev dependency, copied not imported', async () => {
    const own = await manifestAt(root);

    expect(Object.keys(own.dependencies)).not.toContain('mermaid');
  });

  it('RF-508 ships the licence notice of Mermaid next to the build', async () => {
    const licence = await readFile(join(templates, 'mermaid.LICENSE.txt'), 'utf8');
    const original = await readFile(join(mermaidPackage, 'LICENSE'), 'utf8');

    expect(licence).toContain(original.trim());
    expect(licence).toContain('MIT License');
  });
});
