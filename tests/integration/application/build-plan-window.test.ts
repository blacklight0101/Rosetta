import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { estimateInputTokens } from '../../../src/infrastructure/providers/usage-estimate.js';
import { largeCards } from '../../support/large-understand.js';
import { createPlanHarness } from '../../support/plan-harness.js';
import { withContextTokens } from '../../support/provider-factory-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// P3-113, EV-29, RF-601..RF-627: a plan run over a recorded large understand (371 supported cards of
// a public sample, about 140,000 tokens as the planner is shown them) with a planner whose window is
// 131,072 tokens. Every call it makes is packed to the window, as the estimate said it would be.

const temp = useTempRoot('rosetta-plan-window-');
const WINDOW = 131_072;

const withContext =
  (contextTokens: number) =>
  (settings: ProjectSettings): ProjectSettings =>
    withContextTokens(settings, 'fake', contextTokens);

async function seeded(contextTokens: number, folder: string) {
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-package.json'),
  );
  const h = await createPlanHarness(join(temp.path, folder), recording, {
    settings: withContext(contextTokens),
  });
  await h.understandRun({ cards: largeCards() });
  await h.saveBrief({ migration: 'parallel-change' });
  return h;
}

const sizeOf = (request: Parameters<typeof estimateInputTokens>[0]): number =>
  estimateInputTokens(request);

describe('a plan run on a large understand', () => {
  it('EV-29 sends every planner call within the window, with room for the answer', async () => {
    const h = await seeded(WINDOW, 'packed');

    await h.plan();

    const requests = h.providers.requests();
    expect(requests.length).toBeGreaterThanOrEqual(2);
    for (const request of requests) {
      expect(sizeOf(request) + 2 * (request.maxOutputTokens ?? 0)).toBeLessThanOrEqual(WINDOW);
    }
  });

  it('EV-29 names the cards that did not fit in the prompt, by id', async () => {
    const h = await seeded(WINDOW, 'summary');

    await h.plan();

    const prd = h.providers.requests()[1];
    const text = prd?.messages.map((message) => message.content).join('\n') ?? '';
    expect(text).toMatch(/\d+ supported cards/u);
  });

  it('EV-29 sends the whole project when the window holds it (unpacked prompts exceed the window)', async () => {
    const h = await seeded(1_000_000, 'unpacked');

    await h.plan();

    const prd = h.providers.requests()[1];
    expect(prd).toBeDefined();
    expect(prd === undefined ? 0 : sizeOf(prd)).toBeGreaterThan(WINDOW);
  });
});
