import { describe, expect, it } from 'vitest';
import type { AgentToolSet } from '../../../../src/application/agent/agent-tool-set.js';
import { ReadGate } from '../../../../src/application/agent/read-gate.js';
import type { ToolOutcome } from '../../../../src/application/agent/read-only-tools.js';
import { ToolRunner } from '../../../../src/application/agent/tool-runner.js';
import type { ToolCall } from '../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { entry } from '../../../support/code-map-builders.js';
import { toolsSetup } from '../../../support/agent-tools-harness.js';

// RF-1414, DEC-239 (P10-13 fix round): a read the budget refuses is not made, so it is not
// remembered and never becomes a repeat; a cut read is remembered as the lines it served; after the
// next ask the same call runs. A refused read of a path outside the repository is still refused and
// logged as a security event (RF-145) before the budget applies.

const big = 'src/Big.cs';
const other = 'src/Other.cs';
const entries = [
  entry(big, 10_000, { language: 'csharp', lines: 1000 }),
  entry(other, 10_000, { language: 'csharp', lines: 1000 }),
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
      if (!('path' in given) || !('startLine' in given) || !('endLine' in given)) {
        return Promise.resolve({ content: 'found', excerpts: [] });
      }
      const path = String(given.path);
      const startLine = Number(given.startLine);
      const endLine = Number(given.endLine);
      return Promise.resolve({ content: 'lines', excerpts: [{ path, startLine, endLine }] });
    },
  };
}

let next = 0;
const read = (path: string, startLine: number, endLine: number): ToolCall => ({
  id: `c${String((next += 1))}`,
  name: 'read_file',
  arguments: { path, startLine, endLine },
});

function setup() {
  const ran: ToolCall[] = [];
  const gate = new ReadGate(entries);
  const runner = new ToolRunner(fakeTools(ran), gate);
  const ask = (): void => {
    const more = gate.readMore(8);
    if (more === undefined) throw new Error('no ask');
    gate.askedToReadMore(more);
  };
  return { ran, gate, runner, ask };
}

describe('a read refused by the budget, after the next ask', () => {
  it('RF-1414 runs the same call once the next ask gives a new budget', async () => {
    const { ran, runner, ask } = setup();
    await runner.run(read(big, 1, 10), ids);
    ask();
    await runner.run(read(big, 11, 360), ids);
    await runner.run(read(other, 1, 400), ids);
    ask();

    const retried = await runner.run(read(other, 1, 400), ids);

    expect(ran).toHaveLength(3);
    expect(ran[2]?.arguments).toEqual({ path: other, startLine: 1, endLine: 350 });
    expect(retried.error).toBeUndefined();
    expect(runner.toolErrors).toBe(0);
  });

  it('RF-1414 runs a cut read again with its own arguments after the next ask', async () => {
    const { ran, runner, ask } = setup();
    await runner.run(read(big, 1, 10), ids);
    ask();
    await runner.run(read(big, 11, 410), ids);
    ask();

    const retried = await runner.run(read(big, 11, 410), ids);

    expect(ran).toHaveLength(3);
    expect(retried.error).toBeUndefined();
  });
});

describe('refused reads and repeats', () => {
  it('RF-1414 does not end the task when three refused reads are made again after an ask', async () => {
    const { runner, ask } = setup();
    await runner.run(read(big, 1, 10), ids);
    ask();
    await runner.run(read(big, 11, 360), ids);
    const refused = [read(big, 361, 760), read(big, 761, 1000), read(other, 1, 400)];
    for (const call of refused) await runner.run(call, ids);
    ask();

    for (const call of refused) await runner.run({ ...call, id: `${call.id}-again` }, ids);

    expect(runner.loopEnd()).toBeUndefined();
    expect(runner.toolErrors).toBe(0);
  });

  it('RF-1414 still answers a read served whole and made again as a repeat', async () => {
    const { ran, runner, ask } = setup();
    await runner.run(read(big, 1, 10), ids);
    ask();
    await runner.run(read(big, 11, 110), ids);
    ask();

    const again = await runner.run(read(big, 11, 110), ids);

    expect(ran).toHaveLength(2);
    expect(again.error?.code).toBe(ERROR_CODES.agentRepeatedCalls);
  });
});

describe('a path outside the repository once the budget is spent', () => {
  it('RF-1414 RF-145 refuses it and logs the security event, as without a budget', async () => {
    const { tools, logger } = toolsSetup();
    const gate = new ReadGate(entries);
    gate.note({ content: 'lines', excerpts: [{ path: big, startLine: 1, endLine: 10 }] });
    const more = gate.readMore(8);
    if (more === undefined) throw new Error('no ask');
    gate.askedToReadMore(more);
    gate.served(350);
    const runner = new ToolRunner(tools, gate);

    const outcome = await runner.run(read('../../etc/passwd', 1, 5), ids);

    expect(outcome.error?.code).toBe(ERROR_CODES.pathOutsideRoot);
    expect(logger.text()).toContain(ERROR_CODES.pathOutsideRoot);
  });
});
