import { describe, expect, it } from 'vitest';
import type { AgentToolSet } from '../../../../src/application/agent/agent-tool-set.js';
import type { ToolOutcome } from '../../../../src/application/agent/read-only-tools.js';
import { RunEventPublisher } from '../../../../src/application/runs/run-event-publisher.js';
import {
  toolsWithEvents,
  TurnCounter,
} from '../../../../src/application/understand/task-events.js';
import { MemoryEventSink } from '../../../../src/infrastructure/events/memory-event-sink.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';

// RF-1002, RF-230 (P3-61): `agent.tool.result` says which lines a read gave back. The tool answers
// with the lines that exist, so a read asked to go past the end of the file ends at the last line;
// the page showed the lines asked for, and two readers of one file showed two different ranges.

const scope = scopeFor('20261012-100000-understand');

function toolSet(outcome: ToolOutcome): AgentToolSet {
  return {
    definitions: [],
    areaOverview: () => '',
    readableAreaFiles: () => [],
    renderBlock: () => '',
    rowSpans: () => Promise.resolve(undefined),
    run: () => Promise.resolve(outcome),
  };
}

async function resultOf(name: string, args: unknown, outcome: ToolOutcome) {
  const sink = new MemoryEventSink();
  const clock = new FixedClock('2026-10-12T10:00:00.000Z');
  const events = await RunEventPublisher.open({ scope, sink, history: sink, clock });
  const task = { events, agentTaskId: 'reader-001', onAnswer: () => Promise.resolve() };
  const tools = toolsWithEvents(toolSet(outcome), task, new TurnCounter());

  await tools.run(
    { id: 'c1', name, arguments: args },
    { runId: 'r', callId: 'r#1', agentTaskId: 'reader-001' },
  );

  return (await sink.read(scope, 0)).find((event) => event.type === 'agent.tool.result')?.data;
}

const calendar = 'macros/Calendar.cls';

describe('RF-1002 the result of a read', () => {
  it('RF-1002 gives the lines returned, not the lines asked for, when the file is shorter', async () => {
    const outcome: ToolOutcome = {
      content: 'text',
      excerpts: [{ path: calendar, startLine: 1, endLine: 317 }],
    };

    const data = await resultOf(
      'read_file',
      { path: calendar, startLine: 1, endLine: 340 },
      outcome,
    );

    expect(data).toEqual({
      ...{ turn: 0, tool: 'read_file', ok: true },
      ...{ startLine: 1, endLine: 317, linesReturned: 317 },
    });
  });

  it('RF-1002 gives the lines a cut read returned when the tool limits shortened it', async () => {
    const outcome: ToolOutcome = {
      content: 'text',
      excerpts: [{ path: calendar, startLine: 101, endLine: 180 }],
    };

    const data = await resultOf(
      'read_file',
      { path: calendar, startLine: 101, endLine: 300 },
      outcome,
    );

    expect(data).toMatchObject({ startLine: 101, endLine: 180, linesReturned: 80 });
  });
});

describe('RF-1002 the result of a read that gave nothing', () => {
  it('RF-1002 gives no lines for a read that returned no excerpt', async () => {
    const data = await resultOf(
      'read_file',
      { path: calendar, startLine: 1, endLine: 9 },
      { content: 'text' },
    );

    expect(data).toEqual({ turn: 0, tool: 'read_file', ok: true });
  });

  it('RF-1002 gives no lines for a refused read or for a tool that is not a read', async () => {
    const refused: ToolOutcome = {
      content: 'error',
      error: { code: 'RST-1204', message: 'refused' },
      excerpts: [{ path: calendar, startLine: 1, endLine: 9 }],
    };
    const grep: ToolOutcome = {
      content: 'text',
      excerpts: [{ path: calendar, startLine: 4, endLine: 4 }],
    };

    const failed = await resultOf(
      'read_file',
      { path: calendar, startLine: 1, endLine: 9 },
      refused,
    );
    const searched = await resultOf('grep', { pattern: 'Sub' }, grep);

    expect(failed).toEqual({ turn: 0, tool: 'read_file', ok: false, refusedReason: 'RST-1204' });
    expect(searched).toEqual({ turn: 0, tool: 'grep', ok: true });
  });
});
