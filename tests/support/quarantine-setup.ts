/* eslint-disable n/no-missing-import -- the rule does not resolve .mjs; scripts/quarantine.d.mts declares the module */
import { relative, sep } from 'node:path';
import { beforeEach, type TestContext } from 'vitest';
import { isQuarantined, readQuarantine } from '../../scripts/quarantine.mjs';

// P8-142 (DEC-227, RNF-005): a setup file of every Vitest project (vitest.config.ts). A test on the
// quarantine list (tests/quarantine.json) is skipped, so a confirmed flake does not hold the required
// `verify` check; the report shows it as skipped. With ROSETTA_QUARANTINE=only, the run of the
// quarantine job, every other test is skipped instead (scripts/quarantine-run.mjs).

const entries = await readQuarantine();
const only = process.env['ROSETTA_QUARANTINE'] === 'only';

/** The describe blocks and the title of a test, outermost first. */
function titlesOf(task: TestContext['task']): string[] {
  const titles = [task.name];
  for (let suite = task.suite; suite !== undefined && suite !== task.file; suite = suite.suite) {
    titles.unshift(suite.name);
  }
  return titles;
}

if (only || entries.length > 0) {
  beforeEach((context) => {
    const file = relative(process.cwd(), context.task.file.filepath).split(sep).join('/');
    if (isQuarantined(entries, file, titlesOf(context.task)) !== only) context.skip();
  });
}
