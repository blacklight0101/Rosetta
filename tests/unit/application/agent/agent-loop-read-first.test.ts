import { describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import { ReadOnlyTools } from '../../../../src/application/agent/read-only-tools.js';
import { holdsDataMarker } from '../../../../src/domain/egress/data-block.js';
import {
  agentCodeMap,
  agentFiles,
  ordersArea,
  shippingCards,
} from '../../../support/agent-fixtures.js';
import {
  loopSetup,
  readOrder,
  textTurn,
  toolTurn,
  type Call,
} from '../../../support/agent-loop-harness.js';
import { MemoryRepositoryReader } from '../../../support/memory-repository-reader.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RF-206, DEC-136: a reader that gives its final answer before it has read any file of its area is
// not accepted. It is told which files it has not read and keeps its remaining turns to read them;
// if it still reads none, the task ends with the area marked "not read". An area with no readable
// file is not held to the rule.

const readOutsideArea: Call = {
  name: 'read_file',
  args: { path: 'src/Billing/Invoice.cs', startLine: 1, endLine: 3 },
};
const readMissing: Call = {
  name: 'read_file',
  args: { path: 'src/Orders/Nothing.cs', startLine: 1, endLine: 3 },
};

describe('RF-206 an answer before any read', () => {
  it('RF-206 is not accepted at turn 1: the agent is told which files to read and then reads', async () => {
    const { fake, request } = loopSetup([
      textTurn(shippingCards),
      toolTurn([readOrder]),
      textTurn(shippingCards),
    ]);

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('Done');
    expect(result.turns).toBe(3);
    expect(result.areaRead).toBe('read');
    expect(result.drafts.map((draft) => draft.title)).toEqual(['Free shipping over 50']);
    const told = fake.requests[1]?.messages.at(-1);
    expect(told?.role).toBe('user');
    expect(told?.content).toContain('You have read no file of your area.');
    expect(told?.content).toContain('src/Orders/OrderService.cs');
    expect(told?.content).toContain('src/Orders/Order.cs');
    expect(told?.content).toContain('Turns left: 4.');
  });

  it('RF-206 keeps the refused answer in the conversation, followed by the instruction', async () => {
    const { fake, request } = loopSetup([
      textTurn('First guess.'),
      toolTurn([readOrder]),
      textTurn(shippingCards),
    ]);

    await runAgentTask(request(fake));
    const messages = fake.requests[1]?.messages ?? [];

    expect(messages.slice(-2).map((message) => message.role)).toEqual(['assistant', 'user']);
    expect(messages.at(-2)?.content).toBe('First guess.');
  });

  it('RF-206 lists the unread files inside a data block, never as plain prompt text', async () => {
    const { fake, request } = loopSetup([
      textTurn(shippingCards),
      toolTurn([readOrder]),
      textTurn(shippingCards),
    ]);

    await runAgentTask(request(fake));
    const told = fake.requests[1]?.messages.at(-1)?.content ?? '';

    expect(holdsDataMarker(told)).toBe(true);
    expect(told).toContain('"source":"list_area_files"');
  });
});

describe('RF-206 the files an answer is refused for', () => {
  it('RF-206 does not list the files of other areas, nor binary or skipped files', async () => {
    const { fake, request } = loopSetup([
      textTurn(shippingCards),
      toolTurn([readOrder]),
      textTurn(shippingCards),
    ]);

    await runAgentTask(request(fake));
    const told = fake.requests[1]?.messages.at(-1)?.content ?? '';

    expect(told).not.toContain('Invoice.cs');
    expect(told).not.toContain('logo.png');
  });

  it('RF-206 a read of a file outside the area does not count', async () => {
    const { fake, request } = loopSetup([
      toolTurn([readOutsideArea]),
      textTurn(shippingCards),
      toolTurn([readOrder]),
      textTurn(shippingCards),
    ]);

    const result = await runAgentTask(request(fake));

    expect(result.turns).toBe(4);
    expect(result.areaRead).toBe('read');
  });
});

describe('RF-206 what counts as a read', () => {
  it('RF-206 a read that failed does not count', async () => {
    const { fake, request } = loopSetup([
      toolTurn([readMissing]),
      textTurn(shippingCards),
      toolTurn([readOrder]),
      textTurn(shippingCards),
    ]);

    const result = await runAgentTask(request(fake));

    expect(result.turns).toBe(4);
    expect(result.areaRead).toBe('read');
  });

  it('RF-206 a grep that returns lines of the area counts as a read', async () => {
    const grep: Call = { name: 'grep', args: { pattern: 'Shipping' } };
    const { fake, request } = loopSetup([toolTurn([grep]), textTurn(shippingCards)]);

    const result = await runAgentTask(request(fake));

    expect(result.turns).toBe(2);
    expect(result.areaRead).toBe('read');
  });
});

describe('RF-206 an agent that still reads nothing', () => {
  it('RF-206 is refused twice, then its answer is accepted with the area marked not read', async () => {
    const { fake, request } = loopSetup([
      textTurn(shippingCards),
      textTurn(shippingCards),
      textTurn(shippingCards),
    ]);

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('Done');
    expect(result.areaRead).toBe('not-read');
    expect(result.turns).toBe(3);
    expect(result.drafts.map((draft) => draft.title)).toEqual(['Free shipping over 50']);
  });

  it('RF-206 an answer with no turn left to read in is accepted at once, marked not read', async () => {
    const { fake, request } = loopSetup([textTurn(shippingCards)], { maxTurns: 1 });

    const result = await runAgentTask(request(fake));

    expect(result.state).toBe('Done');
    expect(result.areaRead).toBe('not-read');
    expect(result.turns).toBe(1);
  });
});

describe('RF-206 an area with nothing to read', () => {
  it('RF-206 an area of binary files only is not held to the rule and the result says why', async () => {
    const { fake, request, logger } = loopSetup([textTurn(shippingCards)]);
    const binaryOnly = { ...ordersArea, files: ['src/Orders/logo.png'] };
    const tools = new ReadOnlyTools({
      ...{ reader: new MemoryRepositoryReader(agentFiles), codeMap: agentCodeMap, logger },
      area: binaryOnly,
      ids: new SequenceIdGenerator(),
    });

    const result = await runAgentTask({ ...request(fake), tools });

    expect(result.state).toBe('Done');
    expect(result.turns).toBe(1);
    expect(result.areaRead).toBe('nothing-readable');
  });
});
