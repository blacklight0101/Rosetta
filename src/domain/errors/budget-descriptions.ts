import type { ErrorCode, ErrorDescription } from './codes.js';

// RF-007, RF-420..RF-428, RF-1106: the plain message and the next step of the budget and cost codes
// (RST-1600..1699), in numeric order. descriptions.ts merges them with the rest; describeError there
// is the only way to read them.

export type BudgetErrorCode = Extract<ErrorCode, `RST-16${string}`>;

export const BUDGET_ERROR_DESCRIPTIONS: Readonly<Record<BudgetErrorCode, ErrorDescription>> = {
  'RST-1600': {
    message: 'A model call was not made because it could pass a spending or token cap.',
    nextStep:
      'The results so far are saved. Raise the run cap in the project settings, wait for the next UTC day, or ask the administrator about the server caps.',
  },
  'RST-1601': {
    message:
      'The model has no usable price, so it cannot run with these keys: it is missing from the price table, or its price override has no cache-write price.',
    nextStep:
      'Add a price for the model to the project settings and use your own key (an Anthropic model needs its cache-write price too), or turn on allowUnpriced for your own key; server keys run only priced models.',
  },
  'RST-1602': {
    message: 'The price table file is missing or invalid.',
    nextStep:
      'Restore prices/default-prices.yaml: a dated version, USD and whole-number prices per million tokens.',
  },
  'RST-1603': {
    message:
      'A model call without an output limit was refused, because its cost could not be capped.',
    nextStep: 'Report this as a bug: every role sets maxOutputTokens.',
  },
  'RST-1604': {
    message: 'The cost of a model call could not be recorded, so its answer was not used.',
    nextStep: 'Check that PostgreSQL is running and reachable, then start the run again.',
  },
  'RST-1605': {
    message:
      'The cost report of the run has a total above the largest whole number a report can hold exactly.',
    nextStep: 'Report this as a bug: no run can reach that much cost under the caps.',
  },
};
