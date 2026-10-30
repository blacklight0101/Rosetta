import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { stackLayers } from '../../../../src/domain/planning/planning-brief.js';
import { technologiesNamed } from '../../../../src/domain/planning/stack-catalogue.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-609: drift guard. The options Plan setup offers (src/domain/planning/plan-options.ts) are
// free text from the planner, so the technology table cannot list them all. The options of the
// recorded planner answers must each be named by a technology of the catalogue, so a stack the
// planner is known to offer takes part in the stack check with its traits (an entry with no trait
// says explicitly that no rule reads it). A choice the table does not name takes part in no rule.

interface Recorded {
  readonly calls: readonly {
    readonly attempts: readonly { readonly response?: { readonly text: string } }[];
  }[];
}

const nameOf = (option: string | { name: string }): string =>
  typeof option === 'string' ? option : option.name;

/** The JSON object of the answer in a recorded reply, or an empty one. */
function answerOf(text: string): {
  stack?: { layer: string; options: (string | { name: string })[] }[];
} {
  const json = /```json\n([\s\S]*?)```/u.exec(text)?.[1] ?? '{}';
  return JSON.parse(json) as ReturnType<typeof answerOf>;
}

async function offeredOptions(): Promise<[string, string][]> {
  const recording = JSON.parse(
    await readFile('tests/recordings/fake/plan-options.json', 'utf8'),
  ) as Recorded;
  return recording.calls.flatMap((call) =>
    (answerOf(call.attempts[0]?.response?.text ?? '').stack ?? []).flatMap(({ layer, options }) =>
      options.map((option): [string, string] => [layer, nameOf(option)]),
    ),
  );
}
describe('the options Plan setup offers and the technology table', () => {
  it('RF-609 every option of the recorded planner answers is named by a technology of the catalogue', async () => {
    const offered = await offeredOptions();
    expect(offered.length).toBeGreaterThanOrEqual(stackLayers.length * 2);

    const unnamed = offered.filter(
      ([layer, option]) =>
        technologiesNamed(shippedCatalogue.stack.technologies, layer as never, option).length === 0,
    );

    expect(unnamed.map(([layer, option]) => `${layer}: ${option}`)).toEqual([]);
  });
});
