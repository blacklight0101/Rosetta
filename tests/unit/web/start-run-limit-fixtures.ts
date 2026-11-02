import { estimateOf, roleOf } from './start-run-fixtures.js';

// P5-07: fixtures for the cap fields of the start page, which show dollars for a priced estimate
// and a token cap for a local one.

/** The reader on OpenAI with the own key, priced and below the default confirm threshold ($0.04 likely). */
export const cheapPricedEstimate = estimateOf([
  roleOf({
    role: 'reader',
    provider: 'openai',
    kind: 'openai',
    model: 'gpt-5-nano',
    keySource: 'user',
    costs: ['20000', '40000', '80000'],
  }),
]);
