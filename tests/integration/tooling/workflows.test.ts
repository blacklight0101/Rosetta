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
    const match = /^(\s*)(- )?run:\s*(.*)$/u.exec(line);
    if (!match) return;
    found.push(match[3] ?? '');
    const base = (match[1] ?? '').length + (match[2] === undefined ? 0 : 2);
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

/** Runs a check on every workflow and returns "<file>: <problem>" lines; an empty list passes. */
async function violations(check: (workflow: Workflow) => string[]): Promise<string[]> {
  return (await load()).flatMap((workflow) =>
    check(workflow).map((problem) => `${workflow.name}: ${problem}`),
  );
}

const ci = async (): Promise<string> =>
  textOf((await load()).find((workflow) => workflow.name === 'ci.yml'));

describe('GitHub Actions workflows: files', () => {
  it('RNF-001 ships the CI and CodeQL workflows and Dependabot configuration', async () => {
    const names = (await load()).map((workflow) => workflow.name);
    const dependabot = await readFile(join(process.cwd(), '.github', 'dependabot.yml'), 'utf8');

    expect(names).toEqual(['ci.yml', 'codeql.yml']);
    expect(dependabot).toContain('package-ecosystem: npm');
    expect(dependabot).toContain('package-ecosystem: github-actions');
  });

  it('RNF-001 the CI workflow runs verify on ubuntu and windows with a PostgreSQL 17 service on Linux', async () => {
    const text = await ci();

    expect(text).toContain('ubuntu-latest');
    expect(text).toContain('windows-latest');
    expect(text).toContain('image: postgres:17');
    expect(text).toContain('ROSETTA_TEST_DATABASE_URL');
    expect(text).toContain('node-version-file: .nvmrc');
    expect(text).toContain('run: npm run verify');
  });

  it('DEC-35 the pull request title reaches commitlint through env: TITLE', async () => {
    const text = await ci();

    expect(text).toContain('TITLE: ${{ github.event.pull_request.title }}');
    expect(text).toContain('"$TITLE"');
  });
});

describe('GitHub Actions workflows: hardening', () => {
  it('RNF-003 every uses: line pins a full 40-character commit SHA with a version comment', async () => {
    const pinned = /uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s+# v\d+\.\d+\.\d+\s*$/u;

    const found = await violations(({ lines }) => {
      const uses = lines.filter((line) => /^\s*(?:- )?uses:/u.test(line));
      return [
        ...(uses.length === 0 ? ['no uses: line'] : []),
        ...uses.filter((line) => !pinned.test(line)).map((line) => line.trim()),
      ];
    });

    expect(found).toEqual([]);
  });

  it('RNF-003 no ${{ }} expression appears inside a run: block', async () => {
    const found = await violations(({ lines }) =>
      runLines(lines).filter((line) => line.includes('${{')),
    );

    expect(found).toEqual([]);
  });

  it('RNF-003 top-level permissions are contents: read', async () => {
    const found = await violations(({ lines }) => {
      const top = lines.indexOf('permissions:');
      return top >= 0 && lines[top + 1] === '  contents: read' ? [] : ['top-level permissions'];
    });

    expect(found).toEqual([]);
  });

  it('RNF-003 uses no pull_request_target trigger and no secrets', async () => {
    const found = await violations(({ lines }) => {
      const code = lines.filter((line) => !line.trimStart().startsWith('#')).join('\n');
      return [
        ...(code.includes('pull_request_target') ? ['pull_request_target'] : []),
        ...(code.includes('secrets.') ? ['secrets context'] : []),
      ];
    });

    expect(found).toEqual([]);
  });
});

describe('GitHub Actions workflows: limits', () => {
  it('RNF-001 every job has a timeout-minutes', async () => {
    const found = await violations(({ lines }) =>
      jobs(lines)
        .filter((job) => !job.body.some((line) => /^ {4}timeout-minutes: \d+$/u.test(line)))
        .map((job) => job.id),
    );

    expect(found).toEqual([]);
  });

  it('RNF-001 every workflow has a concurrency group per branch that cancels superseded runs', async () => {
    const found = await violations(({ lines }) =>
      /^concurrency:\n {2}group: .*github\.ref.*\n {2}cancel-in-progress: true$/mu.test(
        lines.join('\n'),
      )
        ? []
        : ['concurrency'],
    );

    expect(found).toEqual([]);
  });
});
