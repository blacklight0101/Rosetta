import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The CI job `pr-title` pipes the pull request title through commitlint (environments-and-delivery.md
// section 6). The job feeds the title to stdin exactly as this test does.
// commitlint cold start can exceed Vitest's 5 s default under load.
const timeout = 20_000;
const commitlint = join(process.cwd(), 'node_modules', '@commitlint', 'cli', 'cli.js');

function lint(title: string): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [commitlint], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code, output });
    });
    child.stdin.end(`${title}\n`);
  });
}

describe('pull request title check', () => {
  it(
    'DEC-35 rejects the title "bad title"',
    async () => {
      const result = await lint('bad title');

      expect(result.code).not.toBe(0);
      expect(result.output).toContain('type may not be empty');
    },
    timeout,
  );

  it(
    'DEC-35 rejects a type that is not in the Rosetta list',
    async () => {
      const result = await lint('feature(ci): add workflows');

      expect(result.code).not.toBe(0);
    },
    timeout,
  );

  it(
    'DEC-35 accepts a Conventional Commit title',
    async () => {
      const result = await lint('ci(workflows): add the CI workflow');

      expect(result.code).toBe(0);
    },
    timeout,
  );
});

describe('pull request title check for Dependabot', () => {
  it(
    'DEC-35 accepts the titles Dependabot writes for npm and GitHub Actions updates',
    async () => {
      const titles = [
        'build(deps): Bump the npm-minor-and-patch group with 8 updates',
        'build(deps-dev): Bump vitest from 5.0.3 to 5.1.0',
        'ci(deps): Bump actions/checkout from 7.0.1 to 7.1.0',
      ];
      for (const title of titles) expect((await lint(title)).code).toBe(0);
    },
    timeout,
  );

  it(
    'DEC-35 still rejects a sentence-case subject outside the Dependabot shape',
    async () => {
      expect((await lint('fix(answers): Bump the parser')).code).not.toBe(0);
      expect((await lint('build(web): Bump preact to 11')).code).not.toBe(0);
    },
    timeout,
  );
});
