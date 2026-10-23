import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import type { Run } from '../../../src/domain/runs/run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { readJson, UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
  type UnderstandHarness,
} from '../../support/understand-run-harness.js';

// RF-304, RF-301, RF-006: a run the cap stopped in the judgement step, after every reader task
// finished, leaves claims `Unverified` and no task to run; its resume still judges them, once.

const temp = useTempRoot('rosetta-understand-resume-judgement-');
const areas = ['Catalog', 'Services'];
/** Enough for both reader tasks, not for the verifier's first call. */
const CAP_AFTER_READERS = 210_000;

/** The cap the owner raises before pressing Resume. */
function raised(settings: ProjectSettings): ProjectSettings {
  const run = { maxCostMicros: 50_000_000, maxTokens: 5_000_000 };
  return { ...settings, budget: { ...settings.budget, run } };
}

const indexSchema = z.object({
  cards: z.array(
    z.object({
      claimCounts: z.object({
        Proposed: z.number(),
        Supported: z.number(),
        Unverified: z.number(),
      }),
    }),
  ),
});

async function indexOf(h: UnderstandHarness, run: Run) {
  return indexSchema.parse(await readJson(join(h.runFolder(run), 'cards', 'index.json')));
}

/** The reader task ids the fake reader was asked about, in call order. */
function askedTasks(h: UnderstandHarness): string[] {
  const asked = h.providers.requests().map((request) => request.context.agentTaskId);
  return asked.filter((id) => id.startsWith('reader-'));
}

describe('RF-304 resuming a run the cap stopped in the judgement step', UNDERSTAND_TIMEOUT, () => {
  it('RF-304 judges the claim a cap left Unverified when no task is left to run, once', async () => {
    const afterReaders = understandSettings((settings) => {
      const { roles } = settings;
      return {
        ...settings,
        // The verifier reserves far more output than the readers, so the cap refuses its first call.
        roles: { ...roles, verifier: { ...roles.verifier, maxOutputTokens: 32_768 } },
        budget: {
          ...settings.budget,
          run: { maxCostMicros: 500_000, maxTokens: CAP_AFTER_READERS },
          // RF-429: a reader cap of its own replaces the readers' share, so the cap is met in the judgement.
          roles: { reader: { maxTokens: CAP_AFTER_READERS } },
        },
      };
    });
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-resume.json',
      settings: afterReaders,
      verifierRecording: 'verifier-all-supported.json',
    });
    await h.scan();
    const run = await h.understand({ areas });
    expect(run.endState).toBe('CapReached');
    expect((await h.manifestOf(run)).agentTasks.map((task) => task.state)).toEqual([
      'Done',
      'Done',
    ]);
    expect(h.providers.verifierRequests()).toHaveLength(0);
    expect((await indexOf(h, run)).cards.map((card) => card.claimCounts)).toEqual([
      expect.objectContaining({ Proposed: 0, Supported: 0, Unverified: 1 }),
      expect.objectContaining({ Proposed: 0, Supported: 0, Unverified: 1 }),
    ]);
    await h.changeSettings(raised);

    await h.resume(run);

    expect((await indexOf(h, run)).cards.map((card) => card.claimCounts)).toEqual([
      expect.objectContaining({ Proposed: 0, Supported: 1, Unverified: 0 }),
      expect.objectContaining({ Proposed: 0, Supported: 1, Unverified: 0 }),
    ]);
    expect(h.providers.verifierRequests()).toHaveLength(2);
    expect(askedTasks(h)).toEqual(['reader-001', 'reader-001', 'reader-002', 'reader-002']);
  });
});
