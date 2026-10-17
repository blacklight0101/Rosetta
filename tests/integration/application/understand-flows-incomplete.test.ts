import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UNDERSTAND_TIMEOUT, readJson } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
} from '../../support/understand-run-harness.js';

// RF-260, RF-263, RF-230, ADR-005, DEC-134: a recorded understand run in which the verifier rejects
// one step of a flow. The card file, the specification and the coverage, all written after the
// judgement step, report that flow as incomplete and no other.

const state: { dir?: string; folder?: string } = {};

beforeAll(async () => {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'rosetta-flows-incomplete-')));
  state.dir = dir;
  const h = await createUnderstandHarness({
    dataDir: dir,
    recording: 'understand-flows-screens.json',
    fixture: 'webforms-shop',
    verifierRecording: 'verifier-flow-step-rejected.json',
  });
  await h.scan();
  state.folder = h.runFolder(await h.understand());
}, UNDERSTAND_TIMEOUT.timeout);

afterAll(async () => {
  if (state.dir !== undefined) {
    await rm(state.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

const text = (path: string): Promise<string> => readFile(join(state.folder ?? '', path), 'utf8');

describe('an understand run with a rejected flow step', UNDERSTAND_TIMEOUT, () => {
  it('RF-260 the card file of the flow marks the rejected step and the flow as incomplete', async () => {
    const flow = await text('cards/FLOW/FLOW-001.md');

    expect(flow).toContain('incomplete: true');
    expect(flow).toContain('Incomplete: FLOW-001.c2 (Rejected)');
    expect(flow).toContain('### FLOW-001.c2 (Rejected)');
    expect(await text('cards/SCRN/SCRN-001.md')).not.toMatch(/incomplete/iu);
  });

  it('RF-260 the other flows are not marked', async () => {
    expect(await text('cards/FLOW/FLOW-002.md')).toContain('incomplete: false');
    expect(await text('cards/FLOW/FLOW-003.md')).toContain('incomplete: false');
  });

  it('RF-260 the specification lists the incomplete flow', async () => {
    const spec = await text('spec.md');

    expect(spec).toContain('Incomplete flow: FLOW-001.c2 (Rejected)');
    expect(spec.match(/Incomplete flow:/gu)).toHaveLength(1);
    // The first screen has a rejected claim too, but a screen is not a flow.
    expect(spec).toContain('- SCRN-001.c1 [Rejected]');
    expect(spec).not.toContain('Incomplete flow: SCRN');
  });

  it('RF-260 the coverage counts the incomplete flow in its area', async () => {
    const coverage = await readJson(join(state.folder ?? '', 'coverage.json'));

    expect(coverage).toMatchObject({
      areas: [
        { area: '(root)', surface: { flowCards: 1, incompleteFlows: 1 } },
        { area: 'Catalog', surface: { flowCards: 1, incompleteFlows: 0 } },
        { area: 'Orders', surface: { flowCards: 1, incompleteFlows: 0 } },
        { area: 'Services', surface: { flowCards: 0, incompleteFlows: 0 } },
      ],
    });
    expect(await text('coverage.md')).toContain(
      String.raw`- \(root\): 1 flow card (1 incomplete); 1 screen card`,
    );
  });
});

describe('an understand run whose verifier is stopped by its cap', UNDERSTAND_TIMEOUT, () => {
  it('RF-304 RF-260 the coverage is still written after the judgement step and no flow is incomplete', async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'rosetta-flows-capped-')));
    try {
      const settings = understandSettings((s) => ({
        ...s,
        budget: { ...s.budget, roles: { verifier: { maxTokens: 1 } } },
      }));
      const h = await createUnderstandHarness({
        ...{ dataDir: dir, settings, recording: 'understand-flows-screens.json' },
        ...{ fixture: 'webforms-shop', verifierRecording: 'verifier-flow-step-rejected.json' },
      });
      await h.scan();
      const run = await h.understand();

      expect(run.endState).toBe('Completed');
      const folder = h.runFolder(run);
      const coverage = await readJson(join(folder, 'coverage.json'));
      expect(coverage).toMatchObject({
        areas: [
          { area: '(root)', surface: { flowCards: 1, incompleteFlows: 0 } },
          { area: 'Catalog', surface: { incompleteFlows: 0 } },
          { area: 'Orders', surface: { incompleteFlows: 0 } },
          { area: 'Services', surface: { incompleteFlows: 0 } },
        ],
      });
      const flow = await readFile(join(folder, 'cards', 'FLOW', 'FLOW-001.md'), 'utf8');
      expect(flow).toContain('status: "Unverified"');
      expect(flow).toContain('incomplete: false');
    } finally {
      await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
});

describe('an understand run the user stops during the judgement step', UNDERSTAND_TIMEOUT, () => {
  it('RF-304 RF-230 RF-260 the coverage and the judged claims are still written, the rest stay Proposed', async () => {
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'rosetta-flows-stopped-')));
    try {
      const h = await createUnderstandHarness({
        ...{ dataDir: dir, recording: 'understand-flows-screens.json', fixture: 'webforms-shop' },
        verifierRecording: 'verifier-flow-step-rejected.json',
        beforeVerifierCall: async (call, harness) => {
          if (call === 2) await harness.stopRunning();
        },
      });
      await h.scan();
      const run = await h.understand();

      const folder = h.runFolder(run);
      expect(run.endState).toBe('Interrupted');
      const coverage = await readJson(join(folder, 'coverage.json'));
      expect(coverage).toMatchObject({
        areas: [
          { area: '(root)', surface: { flowCards: 1, incompleteFlows: 0 } },
          { area: 'Catalog', surface: { flowCards: 1 } },
          { area: 'Orders', surface: { flowCards: 1 } },
          { area: 'Services', surface: { flowCards: 0 } },
        ],
      });
      const flow = await readFile(join(folder, 'cards', 'FLOW', 'FLOW-001.md'), 'utf8');
      expect(flow.match(/status: .*/g)).toEqual([
        'status: "Supported"',
        'status: "Proposed"',
        'status: "Proposed"',
      ]);
      expect(flow).toContain('incomplete: false');
      await expect(readFile(join(folder, 'coverage.md'), 'utf8')).resolves.toContain('flow card');
      await expect(readFile(join(folder, 'spec.md'), 'utf8')).resolves.toContain('## Flows');
    } finally {
      await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });
});
