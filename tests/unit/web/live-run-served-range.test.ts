import { describe, expect, it } from 'vitest';
import { agentStarted, ev, planned, stateAfter, toolCalled } from './live-run-fixtures.js';

// RF-1002, RF-230 (P3-61): a read shows the lines it gave back. The owner saw one file with two
// ranges (`macros/Calendar.cls:1-340` and `:1-317`): two readers asked for different ends of a file
// of 317 lines, and the tool answered with the lines that exist.

const path = 'macros/Calendar.cls';

/** A successful `read_file` result that says which lines it gave back. */
const served = (seq: number, task: string, startLine: number, endLine: number) =>
  ev(
    seq,
    'agent.tool.result',
    {
      turn: 1,
      tool: 'read_file',
      ok: true,
      startLine,
      endLine,
      linesReturned: endLine - startLine + 1,
    },
    task,
  );

describe('RF-1002 the range of a read on the panel of an agent', () => {
  it('RF-1002 shows the lines returned once the read answered, not the lines asked for', () => {
    const asked = [
      planned(1, 'reader-001', 'Macros'),
      agentStarted(2, 'reader-001', 'Macros'),
      toolCalled(3, 'reader-001', { path, startLine: 1, endLine: 340 }),
    ];

    const calling = stateAfter(...asked);
    const answered = stateAfter(...asked, served(4, 'reader-001', 1, 317));

    expect(calling.agents[0]?.tool?.text).toBe(`read_file ${path}:1-340`);
    expect(answered.agents[0]?.tool).toEqual({ text: `read_file ${path}:1-317`, status: 'ok' });
  });

  it('RF-1002 shows one range for one file when two readers asked for different ends', () => {
    const state = stateAfter(
      planned(1, 'reader-001', 'Macros'),
      planned(2, 'reader-002', 'Macros'),
      toolCalled(3, 'reader-001', { path, startLine: 1, endLine: 340 }),
      toolCalled(4, 'reader-002', { path, startLine: 1, endLine: 317 }),
      served(5, 'reader-001', 1, 317),
      served(6, 'reader-002', 1, 317),
    );

    expect(state.agents.map((agent) => agent.tool?.text)).toEqual([
      `read_file ${path}:1-317`,
      `read_file ${path}:1-317`,
    ]);
  });

  it('RF-1002 keeps the lines asked for when the result names none, as in a log from before', () => {
    const state = stateAfter(
      planned(1, 'reader-001', 'Macros'),
      toolCalled(2, 'reader-001', { path, startLine: 1, endLine: 40 }),
      ev(3, 'agent.tool.result', { turn: 1, tool: 'read_file', ok: true }, 'reader-001'),
    );

    expect(state.agents[0]?.tool?.text).toBe(`read_file ${path}:1-40`);
  });
});

describe('RF-1002 a result the page cannot place', () => {
  it('RF-1002 shows no tool line for a result whose call the page never saw', () => {
    const state = stateAfter(planned(1, 'reader-001', 'Macros'), served(2, 'reader-001', 1, 317));

    expect(state.agents[0]?.tool).toBeUndefined();
  });

  it('RF-1002 keeps the line of a tool that is not a read when its result names lines', () => {
    const state = stateAfter(
      planned(1, 'reader-001', 'Macros'),
      toolCalled(2, 'reader-001', { pattern: 'Sub' }, 'grep'),
      ev(
        3,
        'agent.tool.result',
        { turn: 1, tool: 'grep', ok: true, startLine: 1, endLine: 5 },
        'reader-001',
      ),
    );

    expect(state.agents[0]?.tool?.text).toBe('grep "Sub"');
  });

  it('RF-1002 keeps the lines asked for when a read failed', () => {
    const state = stateAfter(
      planned(1, 'reader-001', 'Macros'),
      toolCalled(2, 'reader-001', { path, startLine: 1, endLine: 340 }),
      ev(3, 'agent.tool.result', { turn: 1, tool: 'read_file', ok: false }, 'reader-001'),
    );

    expect(state.agents[0]?.tool).toEqual({ text: `read_file ${path}:1-340`, status: 'failed' });
  });
});

describe('RF-1002 the range of a read in the event log', () => {
  it('RF-1002 names the lines a read returned on its result line', () => {
    const state = stateAfter(
      planned(1, 'reader-001', 'Macros'),
      toolCalled(2, 'reader-001', { path, startLine: 1, endLine: 340 }),
      served(3, 'reader-001', 1, 317),
    );

    const lines = state.log.map((line) => line.text);

    expect(lines.at(-1)).toContain('read_file ok · lines 1-317');
  });
});
