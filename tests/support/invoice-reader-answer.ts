// P3-105, EV-08, EV-11: the reader answers and claims of the Invoice workbook evaluation (Deepen
// run, 2026-10-22; the Invoice_Generator test workbook is public), trimmed to what the card is
// about. The two claims about the index and the VAT claim citing `values.md` are recorded; the
// `formulas.md` line of the repaired answer is a stand-in, as the run kept no copy of that file.

const vatClaimOnValues = {
  text: 'The VAT to Pay (AA) is calculated based on the Net Amount.',
  citations: ['Invoice_Generator.xlsm/Invoice/values.md:8-8'],
};

const entCard = {
  type: 'ENT',
  title: 'Invoice sheet',
  area: 'Invoice_Generator.xlsm',
  summary: 'The Invoice sheet keeps one row per invoice.',
  confidence: 'High',
  claims: [
    {
      text: 'The Invoice sheet has the columns Customer, Company, Net Amount and VAT to Pay.',
      citations: ['Invoice_Generator.xlsm/Invoice/values.md:7-7'],
    },
  ],
};

const vatCard = (claims: readonly unknown[]) => ({
  type: 'BR',
  title: 'VAT to Pay Calculation',
  area: 'Invoice_Generator.xlsm',
  summary: 'The VAT to pay of an invoice follows from its net amount.',
  confidence: 'Medium',
  claims,
});

const fenced = (cards: readonly unknown[]): string =>
  `\`\`\`json\n${JSON.stringify({ cards })}\n\`\`\``;

/** BR-013 as recorded: the rule claim cites only a line of `values.md`. */
export const invoiceAnswerWithValuesOnlyRule = fenced([entCard, vatCard([vatClaimOnValues])]);

/** The answer to the targeted repair: the same claim, cited at the formula. */
export const invoiceAnswerWithFormulaCitation = fenced([
  entCard,
  vatCard([
    {
      text: vatClaimOnValues.text,
      citations: ['Invoice_Generator.xlsm/Invoice/formulas.md:12-12'],
    },
  ]),
]);

/** The rule cited at the formula and at a value as its example: nothing to ask. */
export const invoiceAnswerWithFormulaAndValue = fenced([
  entCard,
  vatCard([
    {
      text: vatClaimOnValues.text,
      citations: [
        'Invoice_Generator.xlsm/Invoice/formulas.md:12-12',
        'Invoice_Generator.xlsm/Invoice/values.md:8-8',
      ],
    },
  ]),
]);

/** A workflow claim whose only evidence is a values line, on a FLOW card. */
export const invoiceAnswerWithValuesOnlyFlow = fenced([
  {
    type: 'FLOW',
    title: 'Invoice export',
    area: 'Invoice_Generator.xlsm',
    summary: 'An invoice is exported.',
    confidence: 'Medium',
    claims: [
      {
        text: 'An invoice is exported to PDF and Excel.',
        citations: ['Invoice_Generator.xlsm/Dashboard/values.md:5-5'],
      },
    ],
    flow: { trigger: 'The user presses Export.', outcome: 'A PDF and an Excel copy exist.' },
  },
]);

/** The recorded claims of INT-001 and INT-004, which describe Rosetta's own file as a feature. */
export const indexFileClaims = [
  {
    claimId: 'INT-001.c1',
    text: 'The workbook index in workbook.md lists sheets along with their state, used range, counts, defined names, tables, data connections, pivot tables, charts, and macros.',
    citations: [{ path: 'Invoice_Generator.xlsm/workbook.md', startLine: 1, endLine: 110 }],
  },
  {
    claimId: 'INT-004.c1',
    text: "The presence of a workbook.md file indicates a mechanism for indexing the workbook's contents.",
    citations: [{ path: 'Invoice_Generator.xlsm/workbook.md', startLine: 1, endLine: 110 }],
  },
] as const;

/** The recorded claim INT-005.c1: about named ranges, cited in the index but not about it. */
export const namedRangeClaim = {
  claimId: 'INT-005.c1',
  text: 'The workbook defines named ranges for the PDF folder location on the Dashboard sheet and the Excel folder location on the Dashboard sheet.',
  citations: [{ path: 'Invoice_Generator.xlsm/workbook.md', startLine: 52, endLine: 53 }],
} as const;
