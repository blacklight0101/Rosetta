import { appendFile } from 'node:fs/promises';
import type { Reporter, TestCase } from '@playwright/test/reporter';

// P8-54 (RNF-005, ADR-025): the e2e-shard jobs of ci.yml retry a failed test once
// (ROSETTA_E2E_RETRIES=1, playwright.config.ts), so one flake does not cost a full run. A test that
// passed only on the retry is flaky: the run stays green, and this reporter names it in one summary
// line in the log, as a warning annotation on GitHub and in the job summary, so it is still fixed.

/** The part of a Playwright test case the report reads. */
export interface ReportedTest {
  outcome(): ReturnType<TestCase['outcome']>;
  titlePath(): string[];
}

/** Where the report goes: the log, the annotations on GitHub and the job summary file. */
interface ReportTarget {
  readonly githubActions: boolean;
  readonly summaryFile: string | undefined;
  write(text: string): void;
}

/** "<project> › <file> › <title>" of every test that passed only on a retry, in a stable order. */
export function flakyTitles(tests: readonly ReportedTest[]): string[] {
  return tests
    .filter((test) => test.outcome() === 'flaky')
    .map((test) =>
      test
        .titlePath()
        .filter((part) => part !== '')
        .join(' › '),
    )
    .sort();
}

/** GitHub's escaping of a workflow command's message, so a title cannot start another command. */
const commandText = (text: string): string =>
  text.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');

/** A title on one line in the log and the job summary, so it cannot start a workflow command. */
const oneLine = (text: string): string => text.replaceAll(/[\r\n]+/gu, ' ');

/** Writes the summary line and the flaky tests; nothing when no test needed a retry. */
export async function reportFlaky(titles: readonly string[], target: ReportTarget): Promise<void> {
  if (titles.length === 0) return;
  const line = `Flaky e2e tests: ${String(titles.length)} passed only on retry.`;
  target.write(`${line}\n${titles.map((title) => `  ${oneLine(title)}\n`).join('')}`);
  if (target.githubActions) {
    const warning = (title: string): string =>
      `::warning title=Flaky e2e test::${commandText(`${title} passed only on retry`)}\n`;
    target.write(titles.map(warning).join(''));
  }
  if (target.summaryFile !== undefined && target.summaryFile !== '') {
    const list = titles.map((title) => `- ${oneLine(title)}\n`).join('');
    await appendFile(target.summaryFile, `**${line}**\n\n${list}\n`, 'utf8');
  }
}

/** The reporter playwright.config.ts names; Playwright loads it through its default export. */
export default class FlakyReporter implements Reporter {
  private tests: () => readonly ReportedTest[] = () => [];

  onBegin(_config: unknown, suite: { allTests(): readonly ReportedTest[] }): void {
    this.tests = () => suite.allTests();
  }

  async onEnd(): Promise<void> {
    await reportFlaky(flakyTitles(this.tests()), {
      githubActions: process.env['GITHUB_ACTIONS'] === 'true',
      summaryFile: process.env['GITHUB_STEP_SUMMARY'],
      write: (text) => {
        process.stdout.write(text);
      },
    });
  }
}
