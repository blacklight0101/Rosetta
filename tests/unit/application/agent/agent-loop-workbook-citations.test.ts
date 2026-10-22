import { describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../../src/application/agent/agent-loop.js';
import { ungatedLoopSetup, textTurn } from '../../../support/agent-loop-harness.js';
import {
  invoiceAnswerWithFormulaAndValue,
  invoiceAnswerWithFormulaCitation,
  invoiceAnswerWithValuesOnlyFlow,
  invoiceAnswerWithValuesOnlyRule,
} from '../../../support/invoice-reader-answer.js';
import { loanReaderAnswer } from '../../../support/loan-reader-answer.js';

// P3-105, RF-208, RF-206, EV-08: a rule claim of a workbook that cites only lines of values.md is
// asked once for the line of formulas.md (or of the macro) that shows the rule; the claim is kept
// whatever the answer, and the two repairs of RF-208 are not exceeded.

const citedPaths = (draft: { claims: readonly { citations: readonly { path: string }[] }[] }) =>
  draft.claims.flatMap((claim) => claim.citations.map((citation) => citation.path));

describe('runAgentTask when a rule claim cites only values', () => {
  it('RF-208 asks once for the formula line and keeps the claim with the formulas.md citation', async () => {
    const { fake, request } = ungatedLoopSetup([
      textTurn(invoiceAnswerWithValuesOnlyRule),
      textTurn(invoiceAnswerWithFormulaCitation),
    ]);

    const result = await runAgentTask(request(fake));

    expect(fake.requests).toHaveLength(2);
    const asked = fake.requests[1]?.messages.at(-1)?.content ?? '';
    expect(asked).toContain('VAT to Pay Calculation');
    expect(asked).toMatch(/formulas\.md/u);
    const rule = result.drafts.find((draft) => draft.type === 'BR');
    expect(rule && citedPaths(rule)).toEqual(['Invoice_Generator.xlsm/Invoice/formulas.md']);
    expect(result.problems).toEqual([]);
  });

  it('RF-208 keeps the claim as it is when the repair answer still cites only values, and asks no more', async () => {
    const { fake, request } = ungatedLoopSetup([
      textTurn(invoiceAnswerWithValuesOnlyRule),
      textTurn(invoiceAnswerWithValuesOnlyRule.replace('Medium', 'High')),
      textTurn(invoiceAnswerWithValuesOnlyRule),
    ]);

    const result = await runAgentTask(request(fake));

    expect(fake.requests).toHaveLength(2);
    const rule = result.drafts.find((draft) => draft.type === 'BR');
    expect(rule && citedPaths(rule)).toEqual(['Invoice_Generator.xlsm/Invoice/values.md']);
    expect(result.problems).toEqual([]);
  });

  it('RF-208 asks for the macro or formula line of a workflow claim that cites only values', async () => {
    const { fake, request } = ungatedLoopSetup([
      textTurn(invoiceAnswerWithValuesOnlyFlow),
      textTurn(invoiceAnswerWithValuesOnlyFlow),
    ]);

    await runAgentTask(request(fake));

    expect(fake.requests).toHaveLength(2);
    expect(fake.requests[1]?.messages.at(-1)?.content ?? '').toMatch(/macro/u);
  });
});

describe('runAgentTask when a rule claim already cites its formula', () => {
  it('RF-208 asks nothing when the rule is cited at the formula, even beside a values line', async () => {
    const { fake, request } = ungatedLoopSetup([textTurn(invoiceAnswerWithFormulaAndValue)]);

    const result = await runAgentTask(request(fake));

    expect(fake.requests).toHaveLength(1);
    expect(result.drafts).toHaveLength(2);
  });

  it('RF-208 asks nothing of an entity claim that cites values, which is where data is shown', async () => {
    const { fake, request } = ungatedLoopSetup([textTurn(loanReaderAnswer)]);

    await runAgentTask(request(fake));

    expect(fake.requests).toHaveLength(1);
  });
});
