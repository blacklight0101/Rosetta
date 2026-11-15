import { describe, expect, it } from 'vitest';
import type { AgentToolSet } from '../../../../src/application/agent/agent-tool-set.js';
import { ReadGate } from '../../../../src/application/agent/read-gate.js';
import type { ToolOutcome } from '../../../../src/application/agent/read-only-tools.js';
import { ToolRunner } from '../../../../src/application/agent/tool-runner.js';
import type { ToolCall } from '../../../../src/application/ports/llm-provider.js';
import { entry } from '../../../support/code-map-builders.js';

// RF-1414, DEC-239: with the cap set to 350, after a read-more ask read_file serves at most 350
// lines until the next answer (DEC-246: the cap is off by default, and then nothing is cut); a read past the budget is cut from its start line, one made with no line left is not run
// (a notice, not a tool error); grep is neither counted nor cut.

const big = 'src/Big.cs';
const entries = [
  entry(big, 10_000, { language: 'csharp', lines: 1000 }),
  entry('src/Other.cs', 10_000, { language: 'csharp', lines: 1000 }),
];
const ids = { runId: 'run-1', agentTaskId: 'task-1', callId: 'run-1#1' };

/** Serves exactly the lines a read_file call asks for, and records each call it runs. */
function fakeTools(ran: ToolCall[]): AgentToolSet {
  const args = (call: ToolCall) =>
    typeof call.arguments === 'object' && call.arguments !== null ? call.arguments : {};
  return {
    definitions: [],
    areaOverview: () => '',
    readableAreaFiles: () => entries.map((file) => file.path),
    readableAreaEntries: () => entries,
    renderBlock: (source, text) => `[${source}] ${text}`,
    rowSpans: () => Promise.resolve(undefined),
    run: (call): Promise<ToolOutcome> => {
      ran.push(call);
      const given = args(call);
      if (call.name !== 'read_file' || !('startLine' in given) || !('endLine' in given)) {
        return Promise.resolve({ content: 'found', excerpts: [] });
      }
      const startLine = Number(given.startLine);
      const endLine = Number(given.endLine);
      return Promise.resolve({ content: 'lines', excerpts: [{ path: big, startLine, endLine }] });
    },
  };
}

let next = 0;
const read = (startLine: number, endLine: number): ToolCall => ({
  id: `c${String((next += 1))}`,
  name: 'read_file',
  arguments: { path: big, startLine, endLine },
});

/** RF-1414: the cap DEC-239 measured; it is off by default (DEC-246). */
const cap = 350;

function setup(capped = true) {
  const ran: ToolCall[] = [];
  const gate = new ReadGate(entries, capped ? cap : undefined);
  const runner = new ToolRunner(fakeTools(ran), gate);
  const ask = (): void => {
    const more = gate.readMore(8);
    if (more === undefined) throw new Error('no ask');
    gate.askedToReadMore(more);
  };
  return { ran, gate, runner, ask };
}

describe('the read-more line budget off by default', () => {
  it('RF-1414 serves every read after an ask whole when no cap is set (DEC-246)', async () => {
    const { ran, runner, ask } = setup(false);
    await runner.run(read(1, 10), ids);
    ask();

    await runner.run(read(11, 410), ids);
    await runner.run(read(411, 810), ids);

    expect(ran[1]?.arguments).toMatchObject({ startLine: 11, endLine: 410 });
    expect(ran[2]?.arguments).toMatchObject({ startLine: 411, endLine: 810 });
    expect(runner.toolErrors).toBe(0);
  });
});

describe('the read-more line budget in the tool runner', () => {
  it('RF-1414 does not cap the reads before the first ask', async () => {
    const { ran, runner } = setup();

    await runner.run(read(1, 400), ids);

    expect(ran[0]?.arguments).toMatchObject({ startLine: 1, endLine: 400 });
  });

  it('RF-1414 cuts a read past the budget to the lines left from its start line', async () => {
    const { ran, runner, ask } = setup();
    await runner.run(read(1, 10), ids);
    ask();

    await runner.run(read(11, 110), ids);
    await runner.run(read(111, 510), ids);

    expect(ran[1]?.arguments).toMatchObject({ startLine: 11, endLine: 110 });
    expect(ran[2]?.arguments).toEqual({ path: big, startLine: 111, endLine: 360 });
  });
});

describe('a read with no line left', () => {
  it('RF-1414 does not run a read made with no line left, and it is no tool error', async () => {
    const { ran, runner, ask } = setup();
    await runner.run(read(1, 10), ids);
    ask();
    await runner.run(read(11, 360), ids);

    const spent = await runner.run(read(361, 400), ids);

    expect(ran).toHaveLength(2);
    expect(spent.error).toBeUndefined();
    expect(spent.excerpts ?? []).toEqual([]);
    expect(spent.content).toContain('[read_file]');
    expect(spent.content).toMatch(/350 lines/u);
    expect(spent.content).toMatch(/final answer/u);
    expect(runner.toolErrors).toBe(0);
  });

  it('RF-1414 neither counts nor cuts grep, and gives a new budget at the next ask', async () => {
    const { ran, runner, ask } = setup();
    await runner.run(read(1, 10), ids);
    ask();
    await runner.run(read(11, 360), ids);
    await runner.run({ id: 'g1', name: 'grep', arguments: { pattern: 'Total' } }, ids);
    ask();

    await runner.run(read(361, 760), ids);

    expect(ran.map((call) => call.name)).toEqual(['read_file', 'read_file', 'grep', 'read_file']);
    expect(ran[3]?.arguments).toMatchObject({ startLine: 361, endLine: 710 });
  });
});
