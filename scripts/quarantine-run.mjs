// P8-142 (DEC-227, RNF-005): the quarantine job of ci.yml, not a required check. Lists every entry of
// tests/quarantine.json in the job summary, then runs only the quarantined tests, once each and
// without a retry: the Vitest ones with ROSETTA_QUARANTINE=only (tests/support/quarantine-setup.ts
// skips the other tests of their files), the Playwright ones through scripts/run-e2e.mjs, which then
// passes --test-list. It fails when a quarantined test fails, which blocks no merge.
// Usage: node scripts/quarantine-run.mjs
import { spawn } from 'node:child_process';
import { appendFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isVitestFile, QUARANTINE_FILE, readQuarantine } from './quarantine.mjs';

const require = createRequire(import.meta.url);
const vitestCli = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
const runE2e = join(dirname(fileURLToPath(import.meta.url)), 'run-e2e.mjs');

/** A table cell: one line, no column break. */
const cell = (text) =>
  String(text)
    .replaceAll(/[\r\n]+/gu, ' ')
    .replaceAll('|', '\\|');

/** The job summary: one row per quarantined test. */
function summaryOf(entries) {
  const rows = entries.map((entry) => {
    const test = [entry.file, ...entry.title].join(' › ');
    const run = `[run](${cell(entry.flakeRun)})`;
    return `| ${cell(test)} | ${cell(entry.owner)} | #${cell(entry.issue)} | ${cell(entry.until)} | ${run} |\n`;
  });
  return [
    `**Quarantined tests: ${String(entries.length)}** (${QUARANTINE_FILE}; not a required check)\n\n`,
    '| Test | Owner | Issue | Until | Flake run |\n',
    '| --- | --- | --- | --- | --- |\n',
    ...rows,
    '\n',
  ].join('');
}

function runNode(script, args) {
  return new Promise((resolve) => {
    const env = { ...process.env, ROSETTA_QUARANTINE: 'only' };
    const child = spawn(process.execPath, [script, ...args], { stdio: 'inherit', env });
    child.on('exit', (code) => {
      resolve(code ?? 1);
    });
  });
}

const entries = await readQuarantine();
if (entries.length === 0) {
  process.stdout.write('No quarantined tests: nothing to run.\n');
} else {
  const summary = summaryOf(entries);
  process.stdout.write(summary);
  const summaryFile = process.env.GITHUB_STEP_SUMMARY ?? '';
  if (summaryFile !== '') await appendFile(summaryFile, summary, 'utf8');
  const vitestFiles = [...new Set(entries.map((entry) => entry.file).filter(isVitestFile))];
  const codes = [];
  if (vitestFiles.length > 0)
    codes.push(await runNode(vitestCli, ['run', ...vitestFiles, '--retry=0']));
  else process.stdout.write('No quarantined Vitest tests.\n');
  codes.push(await runNode(runE2e, []));
  process.exitCode = codes.find((code) => code !== 0) ?? 0;
}
