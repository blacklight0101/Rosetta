import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  type UnderstandHarness,
} from '../../support/understand-run-harness.js';

// RF-208, RST-1303, EV-10: a task that ended by repeating a tool call is retried with a changed
// prompt: a note built in code that names the repeated call and the files not yet read in full. A
// local model gives the same answer to the same prompt, so the same prompt loops the same way. The
// recording is the call sequence of the Asset Manager reader-003, trimmed. The prompt files are
// not changed, and the run records that the note was used.

const temp = useTempRoot('rosetta-retry-note-');
const recording = 'understand-retry-repeated-calls.json';

async function started(recording: string): Promise<UnderstandHarness> {
  const h = await createUnderstandHarness({ dataDir: temp.path, recording });
  await h.scan();
  return h;
}

/** The message with its data block tags made equal, so two messages can be compared. */
function untagged(text: string): string {
  return text.replace(/ROSETTA-DATA [a-z2-7]{24}/gu, 'ROSETTA-DATA TAG');
}

describe(
  'an area that failed by repeating a call is retried with a changed prompt',
  UNDERSTAND_TIMEOUT,
  () => {
    // The recording is the call sequence of the Asset Manager reader-003 (EV-10, RST-1303), trimmed.
    const recording = 'understand-retry-repeated-calls.json';

    it('RF-208 RST-1303 the retry prompt differs from the first one and names the repeated call', async () => {
      const h = await started(recording);

      const run = await h.understand({ areas: ['Catalog'] });

      const requests = h.providers.requests();
      expect(requests).toHaveLength(8);
      const first = untagged(requests[0]?.messages[0]?.content ?? '');
      const retry = untagged(requests[6]?.messages[0]?.content ?? '');
      expect(retry).not.toBe(first);
      expect(retry.startsWith(first)).toBe(true);
      expect(retry).toContain('list_area_files');
      expect(retry).toContain('repeated');
      expect(first).not.toContain('repeated');
      expect(run.failedAreas).toBe(0);
    });

    it('RF-208 RST-1303 the retry prompt lists the files not yet read in full, and nothing else is added', async () => {
      const h = await started(recording);

      await h.understand({ areas: ['Catalog'] });

      const requests = h.providers.requests();
      const first = untagged(requests[0]?.messages[0]?.content ?? '');
      const note = untagged(requests[6]?.messages[0]?.content ?? '').slice(first.length);
      // Details.aspx.cs has 10 lines and lines 5-8 were read; Details.aspx has 2 lines and both were read.
      expect(note.split('\n')).toContain('Catalog/Details.aspx.cs');
      expect(note.split('\n')).not.toContain('Catalog/Details.aspx');
    });
  },
);

describe('the run says that the retry note was used', UNDERSTAND_TIMEOUT, () => {
  it('RF-208 RST-1303 the run records that the retry note was used, with the reason only', async () => {
    const h = await started(recording);

    const run = await h.understand({ areas: ['Catalog'] });

    const events = await h.eventsOf(run);
    const noted = events.filter((event) => event.type === 'agent.answer.noted');
    expect(noted.map((event) => event.data)).toEqual([
      { outcome: 'retried', reason: 'repeated-calls' },
    ]);
    const logged = h.logger.entries.filter(
      (entry) => entry.message === 'An agent answer was retried.',
    );
    expect(logged).toHaveLength(1);
  });

  it('RF-208 a task that failed another way is retried with the prompt it had, no note added', async () => {
    const h = await started('understand-retry-recovers.json');

    await h.understand({ areas: ['Catalog'] });

    const requests = h.providers.requests();
    expect(untagged(requests[4]?.messages[0]?.content ?? '')).toBe(
      untagged(requests[0]?.messages[0]?.content ?? ''),
    );
  });
});
