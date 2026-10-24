import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ScanResults } from '../../../src/application/ports/scan-results.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';
import { createPlanHarness } from '../../support/plan-harness.js';
import { plain } from '../../support/plan-method-harness.js';
import { FixtureScans, scanOf } from '../../support/scan-shape-fixtures.js';
import {
  configLine,
  configPath,
  configText,
  fakePassword,
} from '../../support/masked-secret-fixtures.js';

// P5-34, RF-141, RF-608, RF-604: a project whose configuration holds a plain-text password gets a
// risk in the plan for each such file, with its path and line, from the scan and by code. The
// value is in no file of the package and in no request to the planner. The planner is recorded.

let dataDir = '';

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-secret-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function planned(files: Parameters<typeof scanOf>[0], scans?: ScanResults) {
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-package.json'),
  );
  const harness = await createPlanHarness(dataDir, recording, {
    scans: scans ?? new FixtureScans(scanOf(files)),
  });
  await harness.understandRun({ cards: planCards(), questions: planQuestions });
  await harness.saveBrief({});
  await harness.seedScan();
  const run = await harness.plan();
  expect(run.endState).toBe('Completed');
  return { harness, files: await harness.handoffOf(run) };
}

describe('the plan risks and the masked secrets', () => {
  it('P5-34 lists the file and the line of a plain-text password among the risks', async () => {
    const { files } = await planned({ [configPath]: configText, 'src/Orders/Checkout.cs': '// x' });

    const risks = plain(files['risks.md'] ?? '');

    expect(risks).toContain('The shipping threshold is read in two places.');
    expect(risks).toContain(configPath);
    expect(risks).toContain(`line numbers: ${String(configLine)}`);
    expect(risks).toContain('plain-text');
  });

  it('P5-34 the value is in no file of the package and in no request to the planner', async () => {
    const { files, harness } = await planned({ [configPath]: configText });

    const everything = [...Object.values(files), JSON.stringify(harness.providers.requests())].join(
      '\n',
    );
    expect(everything).not.toContain(fakePassword);
  });

  it('P5-34 a project with no masked secret gets no such risk', async () => {
    const { files } = await planned({ 'src/Orders/Checkout.cs': '// x' });

    expect(plain(files['risks.md'] ?? '')).not.toContain('plain-text');
  });

  it('P5-34 a scan that cannot be read still writes the package, says so in checks.md and logs once', async () => {
    const gone: ScanResults = {
      open: () => Promise.reject(new RosettaError(ERROR_CODES.codeMapMissing, 'Gone.')),
    };

    const { files, harness } = await planned({}, gone);

    expect(plain(files['risks.md'] ?? '')).not.toContain('plain-text');
    expect(plain(files['checks.md'] ?? '')).toContain(
      'do not list the files that hold a plain-text secret',
    );
    const warned = harness.s.logger.entries.filter(
      (entry) => entry.code === ERROR_CODES.codeMapMissing,
    );
    expect(warned).toHaveLength(1);
  });

  it('P5-34 a readable scan with no secret says nothing is missing from the risks', async () => {
    const { files } = await planned({ 'src/Orders/Checkout.cs': '// x' });

    expect(plain(files['checks.md'] ?? '')).not.toContain('plain-text secret');
  });
});
