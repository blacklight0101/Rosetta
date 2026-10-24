import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ScanResults } from '../../../src/application/ports/scan-results.js';
import type { Project } from '../../../src/application/projects/project.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { createPlanHarness, type PlanHarness } from '../../support/plan-harness.js';
import { demoScan, FixtureScans } from '../../support/scan-shape-fixtures.js';
import { workbookCards } from '../../support/workbook-plan-cards.js';

// RF-155, RNF-004, ADR-008: a plan run over a seeded understand run of a pricing workbook, the
// planner replaying tests/recordings/fake/planner-workbook.json. Only a workbook project, or a
// zip whose scan lists rendered workbooks, gets the planner's workbook guidance; every other plan
// run sends the very prompt of before.

const briefAnswers = {
  architecture: { style: 'hexagonal' },
  migration: 'parallel-change',
  stack: [{ layer: 'database', choice: 'PostgreSQL', custom: false }],
} as const;

const workbookProject: Partial<Project> = {
  sourceKind: 'workbook',
  sourceUrl: '',
  ref: '',
  subpath: '',
};
const zipProject: Partial<Project> = { sourceKind: 'upload', sourceUrl: '', ref: '', subpath: '' };

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-wb-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

const workbooks = { names: ['Pricing.xlsx'], uploadedAt: '2026-10-19T09:30:00.000Z' };

async function planned(
  project: Partial<Project>,
  scans?: ScanResults,
  seed: 'workbook' | 'zip' | 'github' | 'github-scanned' = 'github',
): Promise<{
  readonly h: PlanHarness;
  readonly manifest: Awaited<ReturnType<PlanHarness['manifestOf']>>;
}> {
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-workbook.json'),
  );
  const h = await createPlanHarness(dataDir, recording, {
    project,
    ...(scans === undefined ? {} : { scans }),
  });
  const upload = { fileName: 'Pricing.zip', uploadedAt: workbooks.uploadedAt };
  const source = await h.understandRun({
    cards: workbookCards(),
    ...(seed === 'workbook' ? { workbooks } : {}),
    ...(seed === 'zip' ? { upload } : {}),
  });
  if (seed === 'zip') await h.seedScan({ snapshotKey: source.snapshotKey });
  if (seed === 'github-scanned') await h.seedScan();
  await h.saveBrief(briefAnswers);
  const run = await h.plan();
  expect(run.endState).toBe('Completed');
  return { h, manifest: await h.manifestOf(run) };
}

async function guidance(): Promise<string> {
  return (await readFile('prompts/planner/workbook.v1.md', 'utf8')).trim();
}

const base = () => readFile('prompts/planner/package.v8.md', 'utf8');

describe('a plan run over a workbook project', () => {
  it('RF-155 the planner prompt holds the planner workbook guidance after the package prompt', async () => {
    const { h } = await planned(workbookProject, undefined, 'workbook');

    const [request] = h.providers.requests();

    expect(request?.context.agentTaskId).toBe('planner-package');
    expect(request?.system.startsWith((await base()).trimEnd())).toBe(true);
    expect(request?.system).toContain(await guidance());
  });

  it('RF-155 the other planner prompts are not changed', async () => {
    const { h } = await planned(workbookProject, undefined, 'workbook');

    const prd = h.providers.requests()[1];

    expect(prd?.system).toBe(await readFile('prompts/planner/prd.v3.md', 'utf8'));
  });

  it('RNF-004 the manifest records the guidance file with its version and hash', async () => {
    const { manifest } = await planned(workbookProject, undefined, 'workbook');

    const bytes = await readFile('prompts/planner/workbook.v1.md');
    expect(manifest.promptVersions['planner/workbook.v1.md']).toEqual({
      version: 'v1',
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    expect(manifest.promptVersions['planner/package.v8.md']?.version).toBe('v8');
  });
});

describe('a plan run over a zip', () => {
  it('RF-155 a zip whose scan lists a rendered workbook gets the guidance', async () => {
    const scans = new FixtureScans(demoScan(), ['Pricing.xlsx']);

    const { h, manifest } = await planned(zipProject, scans, 'zip');

    expect(h.providers.requests()[0]?.system).toContain(await guidance());
    expect(Object.keys(manifest.promptVersions)).toContain('planner/workbook.v1.md');
  });

  it('RF-155 a zip whose scan lists none gets the prompt of before', async () => {
    const scans = new FixtureScans(demoScan());

    const { h, manifest } = await planned(zipProject, scans, 'zip');

    expect(h.providers.requests()[0]?.system).toBe(await base());
    expect(Object.keys(manifest.promptVersions)).not.toContain('planner/workbook.v1.md');
  });

  it('RF-155 a zip whose scan cannot be read gets the prompt of before', async () => {
    const { h, manifest } = await planned(zipProject, undefined, 'zip');

    expect(h.providers.requests()[0]?.system).toBe(await base());
    expect(Object.keys(manifest.promptVersions)).not.toContain('planner/workbook.v1.md');
  });
});

describe('a plan run over a GitHub repository', () => {
  it('RF-155 sends the prompt of before even when a scan of its snapshot lists folders', async () => {
    const scans = new FixtureScans(demoScan(), ['Pricing.xlsx']);

    const { h, manifest } = await planned({}, scans, 'github-scanned');

    expect(h.providers.requests()[0]?.system).toBe(await base());
    expect(Object.keys(manifest.promptVersions)).not.toContain('planner/workbook.v1.md');
  });

  it('RF-155 sends the prompt of before and records no guidance', async () => {
    const { h, manifest } = await planned({});

    expect(h.providers.requests()[0]?.system).toBe(await base());
    expect(Object.keys(manifest.promptVersions)).not.toContain('planner/workbook.v1.md');
  });
});
