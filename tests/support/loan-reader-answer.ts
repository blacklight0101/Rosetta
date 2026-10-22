// P3-104, EV-07: the reader answer of the Loan workbook evaluation (2026-10-22), trimmed to an ENT
// card, one BR card and the SCRN card that had no `claims` array. Recorded, not invented: the
// SCRN card carries four inputs and the `tenu` validation (cited) and nothing else.

const entCard = {
  type: 'ENT',
  title: 'Loan Amortization Calculator',
  area: 'Loan.xlsx',
  summary: 'Sheet1 is a loan amortization calculator with payment, principal, interest, balance.',
  confidence: 'High',
  claims: [
    {
      text: 'Sheet1 contains columns for Payment Number (A), Payment (B), Principal (C), Interest (D), and Balance (E).',
      citations: ['Loan.xlsx/Sheet1/values.md:6-6', 'Loan.xlsx/Sheet1/values.md:11-11'],
    },
  ],
};

const brCard = {
  type: 'BR',
  title: 'Monthly payment calculation',
  area: 'Loan.xlsx',
  summary: 'The monthly payment is calculated using the PMT Excel function.',
  confidence: 'High',
  claims: [
    {
      text: 'Payment amount in column B uses formula PMT($C$2/$C$4,$C$3*$C$4,$C$5).',
      citations: ['Loan.xlsx/Sheet1/formulas.md:5-6'],
    },
  ],
};

const input = (
  name: string,
  inputKind: string,
  required: boolean,
  validations: unknown[] = [],
) => ({
  name,
  inputKind,
  required,
  validations,
});

export const loanScreenCard = {
  type: 'SCRN',
  title: 'Loan Calculator Sheet1',
  area: 'Loan.xlsx',
  summary: 'Users can input annual interest rate, years, payments per year, and loan amount.',
  confidence: 'High',
  screen: {
    route: 'Sheet1',
    roles: [],
    fields: [
      input('Annual Interest Rate', 'number', true),
      input('Years', 'number', true),
      input('Payments per Year', 'dropdown', false, [
        {
          text: 'Must be one of: tenu (weekly, 52; monthly, 12; quarterly, 4; yearly, 1)',
          citations: ['Loan.xlsx/Sheet1/validation.md:6-6'],
        },
      ]),
      input('Amount', 'number', true),
    ],
    actions: [],
    leadsTo: [],
  },
};

/** The recorded answer: the SCRN card has no `claims` key at all. */
export const loanReaderAnswer = `Let me write my cards:\n\n\`\`\`json\n${JSON.stringify(
  { cards: [entCard, brCard, loanScreenCard] },
  null,
  2,
)}\n\`\`\``;

/** The same answer with a BR card that has no claims and no structured block: unreadable. */
export const loanAnswerWithUnreadableCard = `\`\`\`json\n${JSON.stringify({
  cards: [entCard, { ...brCard, title: 'Principal portion', claims: undefined }, loanScreenCard],
})}\n\`\`\``;
