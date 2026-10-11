import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Workflow hardening rules of environments-and-delivery.md section 6 and the hard-rule greps of
// docs/orchestration/README.md section 5.1. Workflows are checked as text: no YAML parser is in the
// package baseline.
const folder = join(process.cwd(), '.github', 'workflows');

interface Workflow {
  readonly name: string;
  readonly lines: string[];
}

async function load(): Promise<Workflow[]> {
  const names = (await readdir(folder)).filter((name) => name.endsWith('.yml')).sort();
  return Promise.all(
    names.map(async (name) => ({
      name,
      lines: (await readFile(join(folder, name), 'utf8')).split(/\r?\n/u),
    })),
  );
}

const indentOf = (line: string): number => line.length - line.trimStart().length;
const textOf = (workflow: Workflow | undefined): string => (workflow?.lines ?? []).join('\n');

/** Lines that belong to a `run:` value, including the one-line form. */
function runLines(lines: string[]): string[] {
  const found: string[] = [];
  lines.forEach((line, i) => {
    const match = /^(\s*)(?:- )?run:\s*(.*)$/u.exec(line);
    if (!match) return;
    found.push(match[2] ?? '');
    const base = (match[1] ?? '').length;
    for (const next of lines.slice(i + 1)) {
      if (next.trim() !== '' && indentOf(next) <= base) break;
      found.push(next);
    }
  });
  return found;
}

/** The job blocks: the lines between `  <id>:` and the next job at the same indentation. */
function jobs(lines: string[]): { id: string; body: string[] }[] {
  const start = lines.indexOf('jobs:');
  const result: { id: string; body: string[] }[] = [];
  for (const line of lines.slice(start + 1)) {
    const header = /^ {2}([\w-]+):\s*$/u.exec(line);
    if (header) result.push({ id: header[1] ?? '', body: [] });
    else result.at(-1)?.body.push(line);
  }
  return result;
}

describe('GitHub Actions workflows', () => {
  it('RNF-001 ships the CI and CodeQL workflows and Dependabot configuration', async () => {
    const names = (await load()).map((workflow) => workflow.name);
    const dependabot = await readFile(join(process.cwd(), '.github', 'dependabot.yml'), 'utf8');

    expect(names).toEqual(['ci.yml', 'codeql.yml']);
    expect(dependabot).toContain('package-ecosystem: npm');
    expect(dependabot).toContain('package-ecosystem: github-actions');
  });

  it('RNF-003 every uses: line pins a full 40-character commit SHA with a version comment', async () => {
    for (const { name, lines } of await load()) {
      const uses = lines.filter((line) => /^\s*(?:- )?uses:/u.test(line));
      expect(uses.length, name).toBeGreaterThan(0);
      for (const line of uses) {
        expect(line, name).toMatch(
          /uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s+# v\d+\.\d+\.\d+\s*$/u,
        );
      }
    }
  });

  it('RNF-003 no ${{ }} expression appears inside a run: block', async () => {
    for (const { name, lines } of await load()) {
      expect(
        runLines(lines).filter((line) => line.includes('${{')),
        name,
      ).toEqual([]);
    }
  });

  it('RNF-003 top-level permissions are contents: read', async () => {
    for (const { name, lines } of await load()) {
      const top = lines.indexOf('permissions:');
      expect(top, name).toBeGreaterThanOrEqual(0);
      expect(lines[top + 1], name).toBe('  contents: read');
    }
  });

  it('RNF-003 uses no pull_request_target trigger and no secrets', async () => {
    for (const { name, lines } of await load()) {
      const code = lines.filter((line) => !line.trimStart().startsWith('#')).join('\n');
      expect(code, name).not.toContain('pull_request_target');
      expect(code, name).not.toMatch(/secrets\./u);
    }
  });

  it('RNF-001 every job has a timeout-minutes', async () => {
    for (const { name, lines } of await load()) {
      for (const job of jobs(lines)) {
        const hasTimeout = job.body.some((line) => /^ {4}timeout-minutes: \d+$/u.test(line));
        expect(hasTimeout, `${name}/${job.id}`).toBe(true);
      }
    }
  });

  it('RNF-001 every workflow has a concurrency group per branch that cancels superseded runs', async () => {
    for (const { name, lines } of await load()) {
      expect(lines.join('\n'), name).toMatch(
        /^concurrency:\n {2}group: .*github\.ref.*\n {2}cancel-in-progress: true$/mu,
      );
    }
  });

  it('RNF-001 the CI workflow runs verify on ubuntu and windows with a PostgreSQL 17 service on Linux', async () => {
    const text = textOf((await load()).find((workflow) => workflow.name === 'ci.yml'));

    expect(text).toContain('ubuntu-latest');
    expect(text).toContain('windows-latest');
    expect(text).toContain('image: postgres:17');
    expect(text).toContain('ROSETTA_TEST_DATABASE_URL');
    expect(text).toContain('node-version-file: .nvmrc');
    expect(text).toContain('run: npm run verify');
  });

  it('DEC-35 the pull request title reaches commitlint through env: TITLE', async () => {
    const text = textOf((await load()).find((workflow) => workflow.name === 'ci.yml'));

    expect(text).toContain('TITLE: ${{ github.event.pull_request.title }}');
    expect(text).toContain('"$TITLE"');
  });
});
