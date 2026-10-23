import { projectOf, templateSettings } from './project-fixtures.js';
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

/** The fixture project with a run token cap of `maxTokens` and every other setting as it is. */
export function projectWithTokenCap(maxTokens: number): Record<string, unknown> {
  const settings = templateSettings();
  const { run } = settings.budget;
  return projectOf('p-1', 'octo/demo', {
    settings: { ...settings, budget: { ...settings.budget, run: { ...run, maxTokens } } },
  });
}
