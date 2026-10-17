import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UNDERSTAND_TIMEOUT, readJson } from '../../support/understand-full-run.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';

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
  });

  it('RF-260 the other flows are not marked', async () => {
    expect(await text('cards/FLOW/FLOW-002.md')).toContain('incomplete: false');
    expect(await text('cards/FLOW/FLOW-003.md')).toContain('incomplete: false');
  });

  it('RF-260 the specification lists the incomplete flow', async () => {
    const spec = await text('spec.md');

    expect(spec).toContain('Incomplete flow: FLOW-001.c2 (Rejected)');
    expect(spec.match(/Incomplete flow:/gu)).toHaveLength(1);
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
