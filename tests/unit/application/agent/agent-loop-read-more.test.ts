import { describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import type { AgentToolSet } from '../../../../src/application/agent/agent-tool-set.js';
import type { FileEntry } from '../../../../src/domain/code-map/file-entry.js';
import { shippingCards } from '../../../support/agent-fixtures.js';
import {
  loopSetup,
  readOrder,
  textTurn,
  toolTurn,
  type Call,
} from '../../../support/agent-loop-harness.js';
import { entry } from '../../../support/code-map-builders.js';

// RF-206, Q-50, P3-78: a reader that answers with turns left after reading less than half of the
// first-party tokens of its area is refused once, with the unread files (formulas, macros and the
// largest first); the next answer is accepted whatever the coverage.

/** A workbook area of 30,000 first-party tokens: `workbook.md` is the only file read in the tests. */
const workbookFiles: readonly FileEntry[] = [
  entry('wb/workbook.md', 1000),
  entry('wb/Sheet1/values.md', 20000),
  entry('wb/Sheet1/formulas.md', 3000),
  entry('wb/Sheet2/formulas.md', 1000),
  entry('wb/macros/Module1.bas', 900),
  entry('wb/Sheet1/notes.md', 2100),
  entry('wb/Sheet1/validation.md', 2000),
];

const codeFiles: readonly FileEntry[] = [
  entry('src/Small.cs', 100),
  entry('src/Big.cs', 5000),
  entry('src/Middle.cs', 900),
  entry('src/Other.cs', 3000),
];

function toolsOver(files: readonly FileEntry[]): AgentToolSet {
  return {
    definitions: [],
    areaOverview: () => 'overview',
    readableAreaFiles: () => files.map((file) => file.path),
    readableAreaEntries: () => files,
    renderBlock: (_source, text) => text,
    rowSpans: () => Promise.resolve(undefined),
    run(call) {
      const path = String((call.arguments as { path?: unknown }).path);
      const file = files.find((each) => each.path === path);
      const excerpts = file === undefined ? [] : [{ path, startLine: 1, endLine: file.lines }];
      return Promise.resolve({ content: `read ${path}`, excerpts });
    },
  };
}

const read = (path: string): Call => ({ name: 'read_file', args: { path } });

function over(files: readonly FileEntry[], outcomes: Parameters<typeof loopSetup>[0], max = 8) {
  const setup = loopSetup(outcomes, { maxTurns: max });
  const tools = toolsOver(files);
  return { ...setup, run: () => runAgentTask({ ...setup.request(setup.fake), tools }) };
}

describe('P3-78 an answer after reading little of the area', () => {
  it('RF-206 refuses an answer at 3% once, ranks formulas then macros then the largest, and the agent reads more', async () => {
    const t = over(workbookFiles, [
      toolTurn([read('wb/workbook.md')]),
      textTurn(shippingCards),
      toolTurn([read('wb/Sheet1/formulas.md')]),
      textTurn(shippingCards),
    ]);

    const result = await t.run();

    expect(result.state).toBe('Done');
    expect(result.turns).toBe(4);
    const told = t.fake.requests[2]?.messages.at(-1);
    expect(told?.role).toBe('user');
    const text = told?.content ?? '';
    expect(text).toContain('3%');
    expect(text).toContain('Turns left: 6');
    const order = [
      'wb/Sheet1/formulas.md',
      'wb/Sheet2/formulas.md',
      'wb/macros/Module1.bas',
      'wb/Sheet1/values.md',
      'wb/Sheet1/notes.md',
      'wb/Sheet1/validation.md',
    ].map((path) => text.indexOf(path));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).not.toContain('wb/workbook.md\n');
  });
});

describe('P3-78 the answer that follows the refusal', () => {
  it('RF-206 accepts a second answer at low coverage', async () => {
    const t = over(workbookFiles, [
      toolTurn([read('wb/workbook.md')]),
      textTurn(shippingCards),
      textTurn(shippingCards),
    ]);

    const result = await t.run();

    expect(result.state).toBe('Done');
    expect(result.turns).toBe(3);
    expect(result.drafts.map((draft) => draft.title)).toEqual(['Free shipping over 50']);
    expect(result.areaRead).toBe('read');
  });

  it('RF-206 accepts an answer at 60% at once', async () => {
    const t = over(workbookFiles, [
      toolTurn([read('wb/Sheet1/values.md'), read('wb/Sheet1/notes.md')]),
      textTurn(shippingCards),
    ]);

    const result = await t.run();

    expect(result.state).toBe('Done');
    expect(result.turns).toBe(2);
  });
});

describe('P3-78 an answer the rule lets through', () => {
  it('RF-206 accepts the answer when no turn is left to read more', async () => {
    const t = over(workbookFiles, [toolTurn([read('wb/workbook.md')]), textTurn(shippingCards)], 2);

    const result = await t.run();

    expect(result.state).toBe('Done');
    expect(result.turns).toBe(2);
  });

  it('RF-206 accepts the answer when one turn is left, too little to read and answer again', async () => {
    const t = over(workbookFiles, [toolTurn([read('wb/workbook.md')]), textTurn(shippingCards)], 3);

    const result = await t.run();

    expect(result.state).toBe('Done');
    expect(result.turns).toBe(2);
  });
});

describe('P3-78 the files listed and counted', () => {
  it('RF-206 ranks the largest files first in a code project', async () => {
    const t = over(codeFiles, [
      toolTurn([read('src/Small.cs')]),
      textTurn(shippingCards),
      textTurn(shippingCards),
    ]);

    await t.run();

    const text = t.fake.requests[2]?.messages.at(-1)?.content ?? '';
    const order = ['src/Big.cs', 'src/Other.cs', 'src/Middle.cs'].map((p) => text.indexOf(p));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(order[0]).toBeGreaterThanOrEqual(0);
  });

  it('RF-231 counts first-party tokens only: a vendored library left unread does not hold the answer', async () => {
    const files = [entry('src/App.cs', 400), entry('Scripts/jquery-3.4.1.min.js', 90000)];
    const t = over(files, [toolTurn([read('src/App.cs')]), textTurn(shippingCards)]);

    const result = await t.run();

    expect(result.turns).toBe(2);
  });

  it('RF-206 still refuses an answer before any read with the read-first instruction, then this one', async () => {
    const t = over(workbookFiles, [
      textTurn(shippingCards),
      toolTurn([read('wb/workbook.md')]),
      textTurn(shippingCards),
      textTurn(shippingCards),
    ]);

    const result = await t.run();

    expect(result.turns).toBe(4);
    expect(t.fake.requests[1]?.messages.at(-1)?.content).toContain('You have read no file');
    expect(t.fake.requests[3]?.messages.at(-1)?.content).toContain('3%');
  });

  it('RF-206 lets an area read in full through at the first answer (orders fixture)', async () => {
    const { fake, request } = loopSetup([toolTurn([readOrder]), textTurn(shippingCards)]);

    const result = await runAgentTask(request(fake));

    expect(result.turns).toBe(2);
  });
});
