import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import {
  cardFiles,
  cardText,
  ENT_CALL,
  made,
  READER_CALLS,
  recording,
} from '../../support/consolidate-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { readJson, UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';

// RF-006, RF-250, RF-426, P2-35: a run stopped while the summariser was merging is resumed in its
// own folder. The card types merged before the stop are not sent to the summariser again (nobody
// pays twice), and the merge made before is made again as it was, so the surviving card keeps its
// id and answers.md keys stay valid.

const temp = useTempRoot('rosetta-consolidate-resume-');

const recordSchema = z.object({
  schemaVersion: z.literal(1),
  types: z.array(z.object({ type: z.string(), cardIds: z.array(z.string()) })),
  merges: z.array(z.object({ ids: z.array(z.string()), title: z.string() })),
});

/** The run stops when the summariser is asked about the entities, after it merged the rules. */
async function stoppedAtEntities() {
  const h = await createUnderstandHarness({
    dataDir: temp.path,
    recording,
    beforeCall: async (call, harness) => {
      if (call === ENT_CALL) await harness.stopRunning();
    },
  });
  await h.scan();
  const run = await h.understand({});
  return { h, run };
}

const summariserTasks = (requests: readonly { context: { agentTaskId: string } }[]): string[] =>
  requests
    .map((request) => request.context.agentTaskId)
    .filter((id) => id.startsWith('summariser-'));

describe('an understand run stopped while the summariser merges', UNDERSTAND_TIMEOUT, () => {
  it('RF-006 P2-35 keeps the merge of the rules and records the type it merged', async () => {
    const { h, run } = await stoppedAtEntities();
    const folder = h.runFolder(run);

    expect(run.endState).toBe('Interrupted');
    expect(await cardFiles(folder, 'BR')).toEqual(['BR-001.md']);
    expect(await cardFiles(folder, 'ENT')).toEqual(['ENT-001.md', 'ENT-002.md']);
    const stored = recordSchema.parse(await readJson(join(folder, 'consolidation.json')));
    expect(stored.types).toEqual([{ type: 'BR', cardIds: ['BR-001', 'BR-002'] }]);
    expect(stored.merges.map((merge) => merge.ids)).toEqual([['BR-001', 'BR-002']]);
  });
});

describe('RF-006 resuming a run that had consolidated', UNDERSTAND_TIMEOUT, () => {
  it('RF-006 P2-35 asks the summariser only about the type it had not merged', async () => {
    const { h, run } = await stoppedAtEntities();

    const resumed = await h.resume(run);

    expect(resumed.ok).toBe(true);
    expect(summariserTasks(h.providers.requests())).toEqual(['summariser-br', 'summariser-ent']);
    expect(h.providers.requests()).toHaveLength(READER_CALLS + 2);
  });

  it('RF-250 P2-35 the merge made before stands: the rule keeps its id, the entities merge now', async () => {
    const { h, run } = await stoppedAtEntities();

    await h.resume(run);

    const folder = h.runFolder(run);
    expect(await cardFiles(folder, 'BR')).toEqual(['BR-001.md']);
    expect(await cardFiles(folder, 'ENT')).toEqual(['ENT-001.md']);
    expect(await cardText(folder, 'BR', 'BR-001')).toMatch(
      /mergedFrom:\n\s+- "BR-001"\n\s+- "BR-002"/u,
    );
    expect(await cardText(folder, 'ENT', 'ENT-001')).toMatch(
      /mergedFrom:\n\s+- "ENT-001"\n\s+- "ENT-002"/u,
    );
    const stored = recordSchema.parse(await readJson(join(folder, 'consolidation.json')));
    expect(stored.types.map((entry) => entry.type)).toEqual(['BR', 'ENT']);
    expect(stored.merges.map((merge) => merge.ids)).toEqual([
      ['BR-001', 'BR-002'],
      ['ENT-001', 'ENT-002'],
    ]);
  });

  it('RF-426 P2-35 pays for each type once on the cost report', async () => {
    const { h, run } = await stoppedAtEntities();

    const resumed = await h.resume(run);

    expect(resumed.ok && resumed.value.endState).toBe('Completed');
    expect(await readJson(join(h.runFolder(run), 'cost.json'))).toMatchObject({
      byRole: [
        { role: 'reader', calls: READER_CALLS },
        { role: 'summariser', calls: 2 },
      ],
    });
  });
});

describe('a finished run that consolidated', UNDERSTAND_TIMEOUT, () => {
  it('RF-250 P2-35 leaves a record of the types and merges for a later resume', async () => {
    const { folder } = await made(temp.path);

    const stored = recordSchema.parse(await readJson(join(folder, 'consolidation.json')));
    expect(stored.types.map((entry) => entry.type)).toEqual(['BR', 'ENT']);
  });
});

describe(
  'RF-006 resuming a run whose consolidation record is unreadable',
  UNDERSTAND_TIMEOUT,
  () => {
    it('RF-006 P2-35 is refused with RST-1309 before the run is reopened', async () => {
      const { h, run } = await stoppedAtEntities();
      await writeFile(join(h.runFolder(run), 'consolidation.json'), '{"schemaVersion": 7}');

      const resumed = await h.resume(run);

      expect(resumed).toEqual({ ok: false, error: ERROR_CODES.taskResultsUnreadable });
      expect(await h.runs.find(run.userId, run.id)).toMatchObject({ endState: 'Interrupted' });
      expect(summariserTasks(h.providers.requests())).toEqual(['summariser-br']);
    });
  },
);
