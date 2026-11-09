import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FlakyReporter, {
  flakyTitles,
  reportFlaky,
  type ReportedTest,
} from '../../e2e/support/flaky-reporter.js';

// P8-54 (RNF-005, ADR-025): CI retries a failed e2e test once; a test that passed only on the retry is
// flaky. The run stays green, and the reporter names each such test in one summary line, in the log,
// as a warning annotation on GitHub and in the job summary.

type Outcome = ReturnType<ReportedTest['outcome']>;

const testOf = (outcome: Outcome, ...path: string[]): ReportedTest => ({
  outcome: () => outcome,
  titlePath: () => ['', ...path],
});

const flaky = testOf('flaky', 'desktop-light', 'live-run-controls.spec.ts', 'RF-1002 stop a run');

describe('e2e flaky reporter, the titles', () => {
  it('RNF-005 names only the tests that passed on a retry, project, file and title, in a stable order', () => {
    const tests = [
      testOf('expected', 'desktop-light', 'a.spec.ts', 'passed at once'),
      testOf('unexpected', 'desktop-light', 'a.spec.ts', 'failed twice'),
      testOf('skipped', 'desktop-light', 'a.spec.ts', 'skipped'),
      flaky,
      testOf('flaky', 'desktop-dark', 'b.spec.ts', 'suite', 'passed on retry'),
    ];

    expect(flakyTitles(tests)).toEqual([
      'desktop-dark › b.spec.ts › suite › passed on retry',
      'desktop-light › live-run-controls.spec.ts › RF-1002 stop a run',
    ]);
  });
});

let root: string;
let summary: string;
let written: string[];

const target = (githubActions: boolean, summaryFile: string | undefined) => ({
  githubActions,
  summaryFile,
  write: (text: string) => {
    written.push(text);
  },
});

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'rosetta-flaky-reporter-'));
  summary = join(root, 'step-summary.md');
  await writeFile(summary, '', 'utf8');
  written = [];
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe('e2e flaky reporter, the report', () => {
  it('RNF-005 says nothing when no test needed a retry', async () => {
    await reportFlaky([], target(true, summary));

    expect(written).toEqual([]);
    expect(await readFile(summary, 'utf8')).toBe('');
  });

  it('RNF-005 a test that passed on retry gets the summary line in the log, without annotations off GitHub', async () => {
    await reportFlaky(['p › f.spec.ts › t'], target(false, undefined));

    expect(written.join('')).toBe(
      'Flaky e2e tests: 1 passed only on retry.\n  p › f.spec.ts › t\n',
    );
  });

  it('RNF-005 on GitHub each flaky test is a warning annotation and the summary line goes to the job summary', async () => {
    await reportFlaky(['p › f.spec.ts › t', 'q › g.spec.ts › u'], target(true, summary));

    const log = written.join('');
    expect(log).toContain('Flaky e2e tests: 2 passed only on retry.\n');
    expect(log).toContain(
      '::warning title=Flaky e2e test::p › f.spec.ts › t passed only on retry\n',
    );
    expect(log).toContain(
      '::warning title=Flaky e2e test::q › g.spec.ts › u passed only on retry\n',
    );
    expect(await readFile(summary, 'utf8')).toBe(
      '**Flaky e2e tests: 2 passed only on retry.**\n\n- p › f.spec.ts › t\n- q › g.spec.ts › u\n\n',
    );
  });

  it('RNF-005 a title cannot end the annotation or start another workflow command', async () => {
    await reportFlaky(['p › 100% sure\n::error::x'], target(true, undefined));

    const annotations = written
      .join('')
      .split('\n')
      .filter((line) => line.startsWith('::'));
    expect(annotations).toEqual([
      '::warning title=Flaky e2e test::p › 100%25 sure%0A::error::x passed only on retry',
    ]);
  });
});

describe('e2e flaky reporter, the reporter Playwright loads', () => {
  it('RNF-005 the reporter Playwright loads reports the flaky tests of the run from the environment', async () => {
    vi.stubEnv('GITHUB_ACTIONS', 'true');
    vi.stubEnv('GITHUB_STEP_SUMMARY', summary);
    vi.spyOn(process.stdout, 'write').mockImplementation((text: string | Uint8Array) => {
      written.push(String(text));
      return true;
    });
    const reporter = new FlakyReporter();

    reporter.onBegin({}, { allTests: () => [testOf('expected', 'p', 'f.spec.ts', 'ok'), flaky] });
    await reporter.onEnd();

    expect(written.join('')).toContain('::warning title=Flaky e2e test::desktop-light › ');
    expect(await readFile(summary, 'utf8')).toContain(
      '**Flaky e2e tests: 1 passed only on retry.**',
    );
  });
});
