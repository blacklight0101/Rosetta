import { describe, expect, it } from 'vitest';
import { ReadGate, readMoreLines } from '../../../../src/application/agent/read-gate.js';
import type { ToolOutcome } from '../../../../src/application/agent/read-only-tools.js';
import { entry } from '../../../support/code-map-builders.js';

// RF-1414, DEC-239: after a read-more ask, the lines read_file serves count against a budget of
// 350 lines until the next answer; each new ask gives a new budget; before the first ask there is none.

const big = 'src/Big.cs';
const entries = [
  entry(big, 10_000, { language: 'csharp', lines: 1000 }),
  entry('src/Other.cs', 10_000, { language: 'csharp', lines: 1000 }),
];

const readOf = (startLine: number, endLine: number): ToolOutcome => ({
  content: 'block',
  excerpts: [{ path: big, startLine, endLine }],
});

function askedGate(): ReadGate {
  const gate = new ReadGate(entries);
  gate.note(readOf(1, 10));
  const ask = gate.readMore(8);
  if (ask === undefined) throw new Error('no ask');
  gate.askedToReadMore(ask);
  return gate;
}

describe('the read-more line budget', () => {
  it('RF-1414 caps at 350 lines and states the budget in the ask', () => {
    const gate = new ReadGate(entries);
    gate.note(readOf(1, 10));

    expect(readMoreLines).toBe(350);
    expect(gate.readMore(8)?.lines).toBe(350);
  });

  it('RF-1414 has no budget before the first ask', () => {
    const gate = new ReadGate(entries);
    gate.note(readOf(1, 10));
    gate.served(400);

    expect(gate.linesLeftToRead()).toBeUndefined();
  });

  it('RF-1414 counts every line served after an ask, down to zero', () => {
    const gate = askedGate();

    expect(gate.linesLeftToRead()).toBe(350);
    gate.served(100);
    expect(gate.linesLeftToRead()).toBe(250);
    gate.served(400);
    expect(gate.linesLeftToRead()).toBe(0);
  });

  it('RF-1414 gives a new budget at each new ask', () => {
    const gate = askedGate();
    gate.note(readOf(11, 360));
    gate.served(350);
    const again = gate.readMore(6);
    if (again === undefined) throw new Error('no second ask');
    gate.askedToReadMore(again);

    expect(gate.linesLeftToRead()).toBe(350);
  });
});
