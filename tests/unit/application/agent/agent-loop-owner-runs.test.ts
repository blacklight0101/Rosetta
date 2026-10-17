import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import { ungatedLoopSetup, textTurn } from '../../../support/agent-loop-harness.js';

// RF-208, DEC-138: the tasks that ended InvalidOutput in the owner's runs of 2026-10-14, replayed
// through the agent loop with the answers they gave (the answer, then the repair, then the repair
// again). A task now ends with the cards its answers hold; only a task whose every claim cites
// nothing a card can use still ends InvalidOutput, and is retried by the run.

const folder = join('tests', 'recordings', 'owner-runs');

async function answersOf(file: string): Promise<readonly string[]> {
  const text = await readFile(join(folder, file), 'utf8');
  return text.split(/^=== attempt \d+ ===\n/mu).slice(1);
}

const replays = [
  ['145748-reader-004.txt', 'Done', 6],
  ['145748-reader-022.txt', 'Done', 2],
  ['153115-reader-005.txt', 'Done', 3],
  ['153115-reader-008.txt', 'Done', 1],
  ['153115-reader-031.txt', 'Done', 3],
  ['153115-reader-034.txt', 'Done', 3],
  ['154704-reader-004.txt', 'Done', 9],
  ['154704-reader-015.txt', 'Done', 5],
  ['145748-reader-017.txt', 'InvalidOutput', 0],
  ['153115-reader-023.txt', 'InvalidOutput', 0],
] as const;

describe('the tasks that lost their area in the owner runs', () => {
  it.each(replays)('RF-208 %s ends %s with %i cards', async (file, state, cards) => {
    const answers = await answersOf(file);
    const last = answers.at(-1) ?? '';
    const { fake, request } = ungatedLoopSetup([...answers, last].map((text) => textTurn(text)));

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe(state);
    expect(result.drafts).toHaveLength(cards);
    expect(fake.requests.length).toBeLessThanOrEqual(3);
  });

  it('RF-208 the cards of a partly valid first answer are kept when the repair does not fix them', async () => {
    const [first, second] = await answersOf('153115-reader-005.txt');
    const { fake, request } = ungatedLoopSetup(
      [first, second, second].map((text) => textTurn(text ?? '')),
    );

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('Done');
    expect(result.drafts).toHaveLength(3);
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.rawOutputs).toHaveLength(3);
  });
});
