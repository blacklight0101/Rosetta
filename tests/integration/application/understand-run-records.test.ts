import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { fixtureRoot } from '../../support/scan-harness.js';
import { hashTree } from '../../support/snapshot-fixture.js';
import { useTempRoot } from '../../support/temp-root.js';
import {
  fullUnderstandRun,
  readJson,
  UNDERSTAND_TIMEOUT,
  useSharedFullRun,
} from '../../support/understand-full-run.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';

// RF-426, RNF-004, RF-1002, RF-005, RF-200: what an understand run records besides its cards: the
// cost report, the prompt versions, the events of every step, and nothing written outside the
// workspace; and the runs that stop before any call.

const temp = useTempRoot('rosetta-understand-records-');
// The tests that only read a run share this one; the snapshot test and the early stops keep their own.
const full = useSharedFullRun('rosetta-understand-shared-');

describe('an understand run: cost and prompts', () => {
  it('RF-426 writes cost.json and cost.md from the ledger rows of the run', async () => {
    const { folder } = full.current();

    expect(await readJson(join(folder, 'cost.json'))).toMatchObject({
      totals: { calls: 16, inputTokens: 13_600, outputTokens: 1410 },
      byRole: [
        { role: 'reader', calls: 11 },
        { role: 'verifier', calls: 5 },
      ],
      byAgentTask: [
        { agentTaskId: 'reader-001', calls: 2 },
        { agentTaskId: 'reader-002', calls: 2 },
        { agentTaskId: 'reader-003', calls: 2 },
        { agentTaskId: 'reader-004', calls: 2 },
        { agentTaskId: 'reader-005', calls: 3 },
        { agentTaskId: 'verifier-BR-001.c1', calls: 1 },
        { agentTaskId: 'verifier-BR-002.c1', calls: 1 },
        { agentTaskId: 'verifier-ENT-001.c1', calls: 1 },
        { agentTaskId: 'verifier-FEAT-001.c1', calls: 1 },
        { agentTaskId: 'verifier-OQ-001.c1', calls: 1 },
      ],
    });
    expect(await readFile(join(folder, 'cost.md'), 'utf8')).toContain('reader');
  });

  // The root and Catalog areas of the fixture hold pages, so the run used both fragments (Q-25).
  it('RNF-004 RF-301 records the reader and verifier prompt files with their versions and hashes', async () => {
    const { h, run } = full.current();

    const manifest = await h.manifestOf(run);
    expect(Object.keys(manifest.promptVersions)).toEqual([
      'cards/card-format.v2.md',
      'cards/continue.v1.md',
      'cards/flows.v1.md',
      'cards/repair.v2.md',
      'cards/screens.v2.md',
      'reader/area.v5.md',
      'reader/read-first.v1.md',
      'reader/task.v2.md',
      'reader/turns-left.v2.md',
      'verifier/claim.v1.md',
      'verifier/retry.v1.md',
    ]);
    expect(manifest.promptVersions['reader/area.v5.md']?.version).toBe('v5');
    expect(manifest.promptVersions['reader/area.v5.md']?.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(manifest.roles['reader']?.modelVersion).toBe('fake-model-2026-10-01');
    expect(manifest.roles['verifier']?.modelVersion).toBe('fake-judge-2026-10-01');
  });
});

describe('an understand run: events', () => {
  it('RF-1002 publishes the plan, every turn and tool call, the cards, the citation checks and each end', async () => {
    const { h, run } = full.current();

    const events = await h.eventsOf(run);
    const count = (type: string): number => events.filter((event) => event.type === type).length;
    expect(
      ['agent.planned', 'agent.started', 'agent.turn', 'agent.tool.called'].map(count),
    ).toEqual([5, 5, 11, 6]);
    expect(
      ['agent.tool.result', 'agent.card.proposed', 'verify.citation.checked', 'agent.ended'].map(
        count,
      ),
    ).toEqual([6, 5, 7, 5]);
    expect(events.find((event) => event.type === 'agent.tool.called')?.data).toEqual({
      turn: 1,
      tool: 'read_file',
      args: { path: 'Default.aspx.cs', startLine: 1, endLine: 14 },
    });
    expect(events.find((event) => event.type === 'agent.card.proposed')?.data).toEqual({
      cardId: 'FEAT-001',
      type: 'FEAT',
      title: 'Home page lists the catalog',
      claims: 1,
    });
    expect(events.at(-1)?.type).toBe('run.ended');
  });

  it('RF-1004 the citation check of a claim carries its text and cited lines, with the reason when it fails', async () => {
    const { h, run } = full.current();

    const checks = (await h.eventsOf(run)).filter(
      (event) => event.type === 'verify.citation.checked',
    );

    expect(checks.map((event) => event.data)).toContainEqual({
      claimId: 'FEAT-001.c1',
      ok: true,
      text: 'The page loads every catalog item into the grid when it opens.',
      citations: [{ path: 'Default.aspx.cs', startLine: 8, endLine: 12 }],
    });
    const invalid = checks.find((event) => event.data['claimId'] === 'BR-001.c3');
    expect(invalid?.data).toMatchObject({
      ok: false,
      text: 'A missing helper formats the name.',
      citations: [{ path: 'Catalog/Missing.cs', startLine: 1, endLine: 2 }],
    });
    expect(typeof invalid?.data['reason']).toBe('string');
  });
});

describe('an understand run: log entries', () => {
  it("RF-1011 every log entry that names the run's key also names its owner", () => {
    const { h, run } = full.current();

    const named = h.logger.entries.filter((entry) => entry.runId === run.runKey);
    expect(named.map((entry) => entry.message)).toContain('An agent task ended.');
    expect(named.filter((entry) => entry.userId !== run.userId)).toEqual([]);
  });
});

describe('an understand run and the snapshot', UNDERSTAND_TIMEOUT, () => {
  it('RF-005 the snapshot hashes the same before and after the run, and every write is in the workspace', async () => {
    const before = await hashTree(fixtureRoot('webforms-csharp'));
    const { run } = await fullUnderstandRun(temp.path);

    expect(run.endState).toBe('Completed');
    expect(await hashTree(fixtureRoot('webforms-csharp'))).toBe(before);
    expect(await readdir(temp.path)).toEqual(['users']);
  });
});

describe('an understand run that cannot start', UNDERSTAND_TIMEOUT, () => {
  it('RF-200 an unknown area stops the run with RST-1307 and the log names the valid areas', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-csharp-full.json',
    });
    await h.scan();

    const run = await h.understand({ areas: ['Catalog', 'Billing'] });

    expect(run.endState).toBe('Failed');
    const ended = (await h.eventsOf(run)).at(-1);
    expect(ended?.data).toMatchObject({ errorCode: ERROR_CODES.areaUnknown });
    const entry = h.logger.entries.find((logged) => logged.code === ERROR_CODES.areaUnknown);
    expect(entry?.data).toEqual({
      unknown: ['Billing'],
      valid: ['(root)', 'Catalog', 'Controllers', 'Database', 'Services'],
    });
    expect(h.providers.requests()).toEqual([]);
  });

  it('RF-200 a project without a completed scan stops with RST-1203 before any call', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-csharp-full.json',
    });

    const run = await h.understand();

    expect(run.endState).toBe('Failed');
    expect((await h.eventsOf(run)).at(-1)?.data).toMatchObject({
      errorCode: ERROR_CODES.codeMapMissing,
    });
    expect(h.providers.requests()).toEqual([]);
  });
});

describe('an understand run: the lines a read returned', () => {
  it('RF-1002 the result of a read names the lines it returned', () => {
    const { h, run } = full.current();

    const result = h.eventsOf(run).then((events) => {
      return events.find((event) => event.type === 'agent.tool.result')?.data;
    });

    return expect(result).resolves.toEqual({
      ...{ turn: 1, tool: 'read_file', ok: true },
      ...{ startLine: 1, endLine: 14, linesReturned: 14 },
    });
  });
});
