import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';

// RF-206, RF-1002, Q-55, P3-83: the run's events say why a reader answer was refused, accepted or
// kept (the reason only, never the answer), so the run page and events.jsonl explain a retry.

const temp = useTempRoot('rosetta-answer-notes-');

const eventSchema = z.object({
  type: z.string(),
  agentTaskId: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
});

describe('a reader answer that is refused', UNDERSTAND_TIMEOUT, () => {
  it('RF-1002 Q-55 the run names the reason in an event and a log line, without the answer text', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-read-more.json',
    });
    await h.scan();

    const run = await h.understand({ areas: ['Catalog'] });

    const text = await readFile(join(h.runFolder(run), 'events.jsonl'), 'utf8');
    const events = text
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => eventSchema.parse(JSON.parse(line)))
      .filter((event) => event.type === 'agent.answer.noted');
    expect(events.map((event) => event.data)).toEqual([
      { outcome: 'refused', reason: 'read-little' },
    ]);
    expect(events[0]?.agentTaskId).toBeDefined();
    expect(text).not.toContain('"summary"');
  });
});
