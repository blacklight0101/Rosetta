import { describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import { textTurn, toolTurn } from '../../../support/agent-loop-harness.js';
import { cardObject } from '../../../support/card-output.js';
import { readValues, valuesPath, workbookLoop } from '../../../support/workbook-loop-harness.js';

// RF-202 (Q-47): the reader of a workbook cites rows or line text; Rosetta maps the rows to
// lines, and a claim about to be dropped for its citation gets the repair attempt first.

function cardWith(...citations: string[]): Record<string, unknown> {
  return cardObject({
    area: 'loan',
    claims: [{ text: 'The payment is computed from the rate.', citations }],
  });
}

function answer(card: Record<string, unknown>): string {
  return JSON.stringify({ cards: [card] });
}

describe('row citations of a rendered workbook', () => {
  it('RF-202 values.md:R8 and values.md:R2-R3 are stored as lines', async () => {
    const { request, loop } = workbookLoop([
      toolTurn([readValues]),
      textTurn(answer(cardWith(`${valuesPath}:R8`, `${valuesPath}:R2-R3`))),
    ]);

    const result = await runAgentTask(request());

    expect(result.state).toBe('Done');
    expect(loop.fake.requests).toHaveLength(2);
    expect(result.drafts[0]?.claims[0]?.citations).toEqual([
      { path: valuesPath, startLine: 5, endLine: 5 },
      { path: valuesPath, startLine: 2, endLine: 4 },
    ]);
  });

  it('RF-202 a row that is not in the file is dropped after the repair attempts', async () => {
    const rowless = cardWith(`${valuesPath}:R5`);
    const { request, loop } = workbookLoop([
      toolTurn([readValues]),
      textTurn(answer(rowless)),
      textTurn(answer(cardWith(`${valuesPath}:R6`))),
      textTurn(answer(rowless)),
      textTurn(answer(cardWith(`${valuesPath}:2-3`))),
    ]);

    const result = await runAgentTask(request());

    expect(result.drafts).toEqual([]);
    expect(result.problems.map((problem) => problem.message).join('\n')).toContain(
      `${valuesPath}:R5`,
    );
    expect(loop.fake.requests).toHaveLength(4);
  });
});

describe('citations that hold line text', () => {
  it('RF-202 a citation holding line text gets the repair attempt and a corrected answer keeps its claims', async () => {
    const written = `${valuesPath}:R2 | C2 0.05`;
    const { request, loop } = workbookLoop([
      toolTurn([readValues]),
      textTurn(answer(cardWith(written))),
      textTurn(answer(cardWith(`${valuesPath}:2-3`))),
    ]);

    const result = await runAgentTask(request());

    expect(result.state).toBe('Done');
    expect(result.problems).toEqual([]);
    expect(result.drafts[0]?.claims[0]?.citations).toEqual([
      { path: valuesPath, startLine: 2, endLine: 3 },
    ]);
    const repair = loop.fake.requests[2]?.messages.at(-1)?.content ?? '';
    expect(repair).toContain(written);
    expect(repair).toContain('startLine-endLine');
  });

  it('RF-202 answers that stay bad are repaired as before and the claims are dropped', async () => {
    const written = `${valuesPath}:R2 | C2 0.05`;
    const { request, loop } = workbookLoop([
      toolTurn([readValues]),
      textTurn(answer(cardWith(written))),
      textTurn(answer(cardWith(`${valuesPath}:R2 | C2 0.06`))),
      textTurn(answer(cardWith(written))),
    ]);

    const result = await runAgentTask(request());

    expect(result.drafts).toEqual([]);
    expect(result.state).toBe('InvalidOutput');
    expect(loop.fake.requests).toHaveLength(4);
  });
});
