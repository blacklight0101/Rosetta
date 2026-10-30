import { describe, expect, it } from 'vitest';
import type { PromptFile } from '../../../../src/application/agent/prompt-file.js';
import type { GapProblem } from '../../../../src/application/plan/gap-answer.js';
import { gapRepairMessage } from '../../../../src/application/plan/gap-repair-message.js';
import { scanDataBlocks } from '../../../../src/domain/egress/data-block-scan.js';
import type { CoverageItem } from '../../../../src/domain/planning/plan-coverage.js';
import { planOf, twoTasks } from '../../../support/coverage-fixtures.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RF-627, RF-202, RF-145, ADR-013, Q-54: the message of the one repair attempt of the gap call is the
// message of the call (the items still uncovered and the plan, in data blocks) followed by the
// versioned repair prompt and one line for each problem: the card's position, the field and what was
// wrong with it. It holds no text of the answer that was refused.

const gaps: CoverageItem[] = [
  { id: 'flow:FLOW-007', kind: 'flow', name: 'Refund an order', detail: 'Refunds.' },
];

const prompt: PromptFile = {
  ...{ name: 'planner/gap-repair.v3.md', version: 'v3', sha256: 'a'.repeat(64) },
  text: 'Some task cards could not be read. Write them again.\n',
};

const problems: GapProblem[] = [
  {
    ...{ position: 2, field: 'requirements', builds: ['flow:FLOW-007'] },
    reason: 'has the wrong type or shape',
  },
  { position: 5, field: 'card', builds: [], reason: 'has the wrong type or shape' },
];

function message(): string {
  const ids = new SequenceIdGenerator();
  const content = planOf(twoTasks(), 2);
  return gapRepairMessage({ items: gaps, content }, { prompt, problems }, () => ids.dataBlockTag());
}

describe('gapRepairMessage', () => {
  it('RF-627 sends the same items and plan, as two data blocks of their own', () => {
    const scan = scanDataBlocks(message());

    expect(scan.ok && scan.value.blocks).toBe(2);
    expect(scan.ok && new Set(scan.value.tags).size).toBe(2);
    expect(message()).toContain('"id": "flow:FLOW-007"');
  });

  it('RF-202 RF-627 follows the data with the repair prompt and one line for each problem', () => {
    const text = message();

    expect(text).toContain('Some task cards could not be read. Write them again.');
    expect(text).toContain('Card 2: the field "requirements" has the wrong type or shape.');
    expect(text).toContain('Card 5: the field "card" has the wrong type or shape.');
    expect(text.indexOf('Write them again.')).toBeLessThan(text.indexOf('Card 2:'));
    expect(text.lastIndexOf('<<<')).toBeLessThan(text.indexOf('Write them again.'));
  });

  it('ADR-013 holds the ids a card named only as data of the items block, never in a problem line', () => {
    const lines = message()
      .split('\n')
      .filter((line) => line.startsWith('Card '));

    expect(lines).toHaveLength(2);
    for (const line of lines) expect(line).not.toContain('FLOW-007');
  });
});
