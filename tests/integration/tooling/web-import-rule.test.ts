import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTempRoot } from '../../support/temp-root.js';

// RNF-013, DEC-112, P1-59: the `web-imports-contracts-only` rule only runs when the `arch` script
// cruises web/. The fixture is cruised with the folders named in the real `arch` script, so the
// test fails as soon as `web` drops out of it.

const run = promisify(execFile);
const repo = process.cwd();
const depcruise = join(repo, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruiser.mjs');
const config = join(repo, '.dependency-cruiser.cjs');

const packageJson = z.object({ scripts: z.object({ arch: z.string() }) });

/** The folders the `arch` script hands to depcruise: every argument before the first option. */
async function archTargets(): Promise<string[]> {
  const parsed = packageJson.parse(JSON.parse(await readFile(join(repo, 'package.json'), 'utf8')));
  const [command, ...args] = parsed.scripts.arch.split(/\s+/);
  expect(command).toBe('depcruise');
  const firstOption = args.findIndex((arg) => arg.startsWith('-'));
  return firstOption === -1 ? args : args.slice(0, firstOption);
}

async function cruiseAsArch(root: string, files: Record<string, string>): Promise<string> {
  const targets = await archTargets();
  // Every target folder exists in the fixture, so depcruise never stops on a missing path.
  const placeholders = Object.fromEntries(
    targets.map((target) => [`${target}/placeholder.ts`, 'export const p = 1;\n']),
  );
  for (const [path, source] of Object.entries({ ...placeholders, ...files })) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), source);
  }
  await writeFile(join(root, 'tsconfig.json'), '{"compilerOptions":{"module":"nodenext"}}');
  const report = join(root, 'report.txt');
  const args = [depcruise, ...targets, '--config', config, '--output-type', 'err'];
  await run('node', [...args, '--output-to', report], { cwd: root }).catch(() => undefined);
  return readFile(report, 'utf8');
}

const importing = (module: string): string =>
  `import * as m from '${module}';\nexport const x = m;\n`;

describe('dependency-cruiser layer rule: web', () => {
  const root = useTempRoot('rosetta-arch-web-');

  it('RNF-013 a web/ file importing src/infrastructure/ is reported by the arch script', async () => {
    const report = await cruiseAsArch(root.path, {
      'src/infrastructure/db/pool.ts': 'export const pool = 1;\n',
      'web/src/pages/leak.ts': importing('../../../src/infrastructure/db/pool.js'),
    });

    expect(report).toContain('web-imports-contracts-only');
    expect(report).toContain('web/src/pages/leak.ts');
  });

  it('RNF-013 a web/ file may import src/application/contracts/', async () => {
    const report = await cruiseAsArch(root.path, {
      'src/application/contracts/run.ts': 'export const run = 1;\n',
      'web/src/pages/ok.ts': importing('../../../src/application/contracts/run.js'),
    });

    expect(report).not.toContain('web-imports-contracts-only');
  });
});
