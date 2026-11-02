import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { completedRun } from '../../support/deepen-run.js';
import { useSharedValue } from '../../support/understand-full-run.js';

// RF-243, RF-646, EV-09, EV-89, P8-08: a reader raises a question the cited Web.config answers, two
// questions about the same cited range and one genuine question. The first is dropped and logged
// with its citation, the pair is one question, and answers.md lists two. Synthetic recording; no
// real provider is called.

const shared = useSharedValue('rosetta-p8-08-', async (dataDir) => {
  const { h, run } = await completedRun({
    dataDir,
    recording: 'p8-08-answered-and-repeated.json',
  });
  const text = await readFile(join(h.projectFolder(), 'answers.md'), 'utf8');
  return { h, run, text };
});

describe('EV-09 a question the cited lines answer is not asked', () => {
  it('RF-243 drops the connection string question and logs its citation', () => {
    const { h, text } = shared.current();

    expect(text).not.toContain('connection string');
    const logged = h.logger.entries.map((each) => each.message).join('\n');
    expect(logged).toContain('What is the connection string of the shop database?');
    expect(logged).toContain('Web.config:6-8');
  });
});

describe('EV-89 two questions about one cited range are one question', () => {
  it('RF-646 lists the pair once, with the genuine question', () => {
    const { text } = shared.current();

    expect(text.match(/^## OQ-/gmu)).toHaveLength(2);
    expect(text).toContain('fixed name label');
    expect(text).toContain('Which currency does the shop show prices in?');
  });

  it('RF-243 publishes question.merged for the pair', async () => {
    const { h, run } = shared.current();

    const merged = (await h.eventsOf(run)).filter((each) => each.type === 'question.merged');
    expect(merged).toHaveLength(1);
    expect(merged[0]?.data).toMatchObject({ mergedRunKey: run.runKey });
  });
});
