import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// RNF-003, RF-508: the secret scan reads the vendored Mermaid build and reports one finding in it,
// a minified name the generic-api-key rule takes for a key. Only that finding is ignored, by
// path, rule and line (the form that matches in git and dir mode and after a squash merge); the
// file is not left out of the scan, and the line it names is the one that holds the name.

const root = process.cwd();
const vendored = 'templates/report/mermaid.min.js';

describe('the gitleaks exemption of the vendored Mermaid build', () => {
  it('RNF-003 ignores exactly one finding, by path, rule and line', async () => {
    const text = await readFile(join(root, '.gitleaksignore'), 'utf8');
    const entries = text.split('\n').filter((line) => line.trim() !== '' && !line.startsWith('#'));

    expect(entries).toEqual([`${vendored}:generic-api-key:636`]);
  });

  it('RNF-003 the ignored line of the vendored build is the one with the minified name', async () => {
    const lines = (await readFile(join(root, vendored), 'utf8')).split('\n');

    expect(lines[635]).toContain('m.atlasCount');
  });

  it('RNF-003 leaves no file out of the scan: no allowlist of paths', async () => {
    const file = join(root, '.gitleaks.toml');
    const present = await access(file).then(
      () => true,
      () => false,
    );

    expect(present ? await readFile(file, 'utf8') : '').not.toMatch(/allowlist|paths/u);
  });
});
