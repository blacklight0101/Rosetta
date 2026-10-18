import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ScanResults } from '../../../src/application/ports/scan-results.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';
import { createPlanHarness, type PlanHarness } from '../../support/plan-harness.js';
import { plain } from '../../support/plan-method-harness.js';
import { demoScan, FixtureScans } from '../../support/scan-shape-fixtures.js';

// RF-631, RF-632, ADR-018, DEC-80, DEC-135: a plan run writes, into the package, the behaviour each
// task card must keep (from the supported claims and citations of the cards it builds on) and
// `fixtures.md` (measured by code from the scan of the analysed commit). A scan that cannot be read
// leaves the package complete and says so; it never fails the run.

let dataDir = '';

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-behaviour-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function planned(
  scans: ScanResults | undefined,
  seed: (harness: PlanHarness) => Promise<void> = async (harness) => {
    await harness.seedScan();
  },
): Promise<{ files: Readonly<Record<string, string>>; harness: PlanHarness }> {
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-package.json'),
  );
  const harness = await createPlanHarness(dataDir, recording, scans === undefined ? {} : { scans });
  await harness.understandRun({ cards: planCards(), questions: planQuestions });
  await harness.saveBrief({});
  await seed(harness);
  const run = await harness.plan();
  expect(run.endState).toBe('Completed');
  return { files: await harness.handoffOf(run), harness };
}

/** The task cards of tasks.md by their id; T-001 is the migration card (RF-623), so the planner's cards start at T-002. */
function cardsById(files: Readonly<Record<string, string>>): Map<string, string> {
  const cards = plain(files['tasks.md']).split(/^## /mu).slice(1);
  return new Map(cards.map((card) => [card.split('\n')[0] ?? '', card]));
}

describe('RF-631 behaviour to preserve in a planned package', () => {
  it('RF-631 a task built on a feature and a rule lists their supported claims with citations', async () => {
    const { files } = await planned(undefined);

    const card = cardsById(files).get('T-002') ?? '';

    expect(card).toContain('Behaviour to keep:');
    expect(card).toContain(
      'FEAT-001.c1: Checkout creates an order from the basket. Citations: src/Orders/Checkout.cs:3-9',
    );
    expect(card).toContain(
      'BR-001.c1: Orders over 50 ship free. Citations: src/Orders/Shipping.cs:3-9',
    );
  });

  it('RF-631 asks for an approval test of each behaviour before the change', async () => {
    const { files } = await planned(undefined);

    const card = cardsById(files).get('T-002') ?? '';

    expect(card).toContain('Approval test before the change: pin FEAT-001.c1');
    expect(card).toContain('Approval test before the change: pin BR-001.c1');
  });

  it('RF-631 never lists a claim the verifier did not find supported', async () => {
    const { files } = await planned(undefined);

    const card = cardsById(files).get('T-002') ?? '';

    expect(card).not.toContain('FEAT-001.c2');
    expect(card).not.toContain('Checkout emails the warehouse');
  });

  it('RF-631 a task built on a question card only lists no behaviour to keep', async () => {
    const { files } = await planned(undefined);

    const card = cardsById(files).get('T-003') ?? '';

    expect(card).not.toContain('Behaviour to keep');
    expect(card).not.toContain('Approval test before the change');
  });
});

describe('RF-632 fixtures.md of a planned package', () => {
  it('RF-632 is measured from the scan of the commit the cards were read at', async () => {
    const scans = new FixtureScans(demoScan());

    const { files } = await planned(scans);

    const text = plain(files['fixtures.md']);
    expect(text).toMatch(/\| generated map \| 3 \|/u);
    expect(text).toMatch(/\| bundled third-party script \| 2 \|/u);
    expect(text).toContain('Orders/aux.c: reserved device name');
    expect(scans.opened).toHaveLength(1);
    expect(scans.opened[0]?.stage).toBe('scan');
  });
});

describe('RF-632 fixtures.md, the scans it is taken from', () => {
  it('RF-632 is linked from the card that adds a limit, not from the one that adds a check', async () => {
    const { files } = await planned(new FixtureScans(demoScan()));

    const cards = cardsById(files);

    expect(cards.get('T-002')).toContain(
      'Data shapes to handle: [Largest files](fixtures.md#largest-files)',
    );
    expect(cards.get('T-003')).not.toContain('fixtures.md');
  });

  it('RF-632 does not use a scan of another snapshot', async () => {
    const scans = new FixtureScans(demoScan());

    const { files } = await planned(scans, async (harness) => {
      await harness.seedScan({ snapshotKey: 'octo__demo@other' });
    });

    expect(scans.opened).toEqual([]);
    expect(files['fixtures.md']).toContain('The scan of the analysed commit could not be read');
  });

  it('RF-632 does not use a scan that did not end Completed', async () => {
    const scans = new FixtureScans(demoScan());

    const { files } = await planned(scans, async (harness) => {
      await harness.seedScan({ endState: 'Failed' });
    });

    expect(scans.opened).toEqual([]);
    expect(files['fixtures.md']).toContain('could not be read');
  });
});

describe('RF-632 fixtures.md without a readable scan', () => {
  it('RF-632 a scan whose output is gone leaves a complete package that says so', async () => {
    const gone: ScanResults = {
      open: () => Promise.reject(new RosettaError(ERROR_CODES.codeMapMissing, 'Gone.')),
    };

    const { files, harness } = await planned(gone);

    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(['fixtures.md', 'tasks.md', 'prd.md']),
    );
    expect(files['fixtures.md']).toContain('The scan of the analysed commit could not be read');
    const warned = harness.s.logger.entries.filter(
      (entry) => entry.code === ERROR_CODES.codeMapMissing,
    );
    expect(warned).toHaveLength(1);
  });

  it('RF-632 a project with no scan at all still gets a fixtures.md', async () => {
    const { files } = await planned(undefined, () => Promise.resolve());

    expect(files['fixtures.md']).toContain('Not measured.');
  });
});
