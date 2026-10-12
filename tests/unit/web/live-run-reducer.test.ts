import { describe, expect, it } from 'vitest';
import { applyEvent, initialRunState } from '../../../web/src/lib/live-run/reduce-run.js';
import { overviewOf } from '../../../web/src/lib/live-run/run-summary.js';
import {
  agentEnded,
  agentStarted,
  cardProposed,
  ev,
  planned,
  startedData,
  stateAfter,
  toolCalled,
  toolResult,
  turn,
} from './live-run-fixtures.js';

// RF-1002, RF-1003, RF-424, RF-1004, DEC-103: the events of a run folded into the page state.

describe('the agent panels', () => {
  it('RF-1002 plans one panel per agent with its area, role and model, in the order planned', () => {
    const state = stateAfter(
      planned(1, 'reader-001', 'Catalog'),
      planned(2, 'reader-002', 'Services'),
    );

    expect(state.agents.map((agent) => [agent.area, agent.role, agent.model, agent.state])).toEqual(
      [
        ['Catalog', 'reader', 'qwen3.5:9b', 'Planned'],
        ['Services', 'reader', 'qwen3.5:9b', 'Planned'],
      ],
    );
  });

  it('RF-1002 counts turns and tokens of the agent that took them', () => {
    const state = stateAfter(
      planned(1, 'reader-001', 'Catalog'),
      agentStarted(2, 'reader-001', 'Catalog'),
      turn(3, 'reader-001', 1, [900, 40]),
      turn(4, 'reader-001', 2, [1_000, 60]),
    );

    expect(state.agents[0]).toMatchObject({
      state: 'Running',
      turn: 2,
      inputTokens: 1_900,
      outputTokens: 100,
    });
  });
});

describe('the agent panels and their tool calls', () => {
  it('RF-1002 shows the tool call in progress and then its result', () => {
    const calling = stateAfter(
      planned(1, 'reader-001', 'Catalog'),
      agentStarted(2, 'reader-001', 'Catalog'),
      toolCalled(3, 'reader-001', { path: 'Catalog/Edit.aspx.cs', startLine: 40, endLine: 80 }),
    );
    const answered = applyEvent(calling, toolResult(4, 'reader-001', true));

    expect(calling.agents[0]?.tool).toEqual({
      text: 'read_file Catalog/Edit.aspx.cs:40-80',
      status: 'running',
    });
    expect(answered.agents[0]?.tool).toEqual({
      text: 'read_file Catalog/Edit.aspx.cs:40-80',
      status: 'ok',
    });
  });

  it('RF-1002 describes a search by its pattern and a call without arguments by its name', () => {
    const base = stateAfter(planned(1, 'reader-001', 'Catalog'));

    const search = applyEvent(
      base,
      toolCalled(2, 'reader-001', { pattern: 'PriceInDollars' }, 'search_text'),
    );
    const listing = applyEvent(search, toolCalled(3, 'reader-001', {}, 'list_area_files'));

    expect(search.agents[0]?.tool?.text).toBe('search_text "PriceInDollars"');
    expect(listing.agents[0]?.tool?.text).toBe('list_area_files');
  });
});

describe('the agent panels, tools and cards', () => {
  it('RF-1002 counts the files read once each, and only when the read succeeded', () => {
    const state = stateAfter(
      planned(1, 'reader-001', 'Catalog'),
      toolCalled(2, 'reader-001', { path: 'a.cs', startLine: 1, endLine: 5 }),
      toolResult(3, 'reader-001', true),
      toolCalled(4, 'reader-001', { path: 'a.cs', startLine: 6, endLine: 9 }),
      toolResult(5, 'reader-001', true),
      toolCalled(6, 'reader-001', { path: 'b.cs', startLine: 1, endLine: 5 }),
      toolResult(7, 'reader-001', false),
    );

    expect(state.agents[0]?.filesRead).toEqual(['a.cs']);
    expect(state.agents[0]?.tool?.status).toBe('failed');
  });

  it('RF-1002 lists the cards an agent found so far and shows how the agent ended', () => {
    const state = stateAfter(
      planned(1, 'reader-001', 'Catalog'),
      agentStarted(2, 'reader-001', 'Catalog'),
      cardProposed(3, 'reader-001', 'BR-001'),
      agentEnded(4, 'reader-001', 'Done', 1),
    );

    expect(state.agents[0]).toMatchObject({
      state: 'Done',
      turn: 3,
      cards: [{ cardId: 'BR-001', type: 'BR', title: 'Title of BR-001' }],
    });
    expect(state.cards).toHaveLength(1);
  });

  it('RF-1002 creates the panel of an agent whose planned event the page missed', () => {
    const state = stateAfter(agentStarted(5, 'reader-007', 'Late'));

    expect(state.agents.map((agent) => [agent.agentTaskId, agent.area, agent.state])).toEqual([
      ['reader-007', 'Late', 'Running'],
    ]);
  });
});

describe('the overview and the event log', () => {
  it('RF-1002 counts agents planned, running, done and failed', () => {
    const state = stateAfter(
      ...['a', 'b', 'c', 'd', 'e'].map((area, index) =>
        planned(index + 1, `reader-00${String(index + 1)}`, area),
      ),
      agentStarted(6, 'reader-002', 'b'),
      agentStarted(7, 'reader-003', 'c'),
      agentEnded(8, 'reader-003', 'Done'),
      agentStarted(9, 'reader-004', 'd'),
      agentEnded(10, 'reader-004', 'Failed'),
      agentStarted(11, 'reader-005', 'e'),
      agentEnded(12, 'reader-005', 'InvalidOutput'),
    );

    expect(overviewOf(state)).toEqual({ planned: 1, running: 1, done: 1, failed: 2 });
  });

  it('RF-1002 keeps every event as a log line with its sequence, time, type and a short text', () => {
    const state = stateAfter(
      ev(1, 'run.started', startedData),
      planned(2, 'reader-001', 'Catalog'),
      toolCalled(3, 'reader-001', { path: 'a.cs', startLine: 1, endLine: 5 }),
      ev(4, 'a.type.of.the.future', { anything: true }),
    );

    expect(state.log.map((line) => [line.seq, line.type])).toEqual([
      [1, 'run.started'],
      [2, 'agent.planned'],
      [3, 'agent.tool.called'],
      [4, 'a.type.of.the.future'],
    ]);
    expect(state.log[2]).toMatchObject({ at: '2026-10-12T10:00:03.000Z' });
    expect(state.log[2]?.text).toContain('Catalog');
    expect(state.log[2]?.text).toContain('read_file a.cs:1-5');
    expect(state.startedAt).toBe('2026-10-12T10:00:01.000Z');
  });
});

describe('replay of events', () => {
  it('RF-1006 ignores an event it has already applied, so a replay changes nothing', () => {
    const once = stateAfter(planned(1, 'reader-001', 'Catalog'), turn(2, 'reader-001', 1, [10, 5]));

    const replayed = applyEvent(
      applyEvent(once, planned(1, 'reader-001', 'Catalog')),
      turn(2, 'reader-001', 1, [10, 5]),
    );

    expect(replayed).toBe(once);
    expect(replayed.lastSeq).toBe(2);
  });

  it('RF-1006 starts from an empty run', () => {
    expect(initialRunState()).toMatchObject({ lastSeq: 0, agents: [], claims: [], log: [] });
  });
});
