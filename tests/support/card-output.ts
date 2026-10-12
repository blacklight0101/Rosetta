import { parseCardOutput } from '../../src/application/cards/parse-cards.js';

/** One card as an agent writes it (citations as strings); override what a test cares about. */
export function cardObject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FEAT',
    title: 'Order checkout',
    area: 'orders',
    summary: 'The shop turns a basket into an order.',
    confidence: 'High',
    claims: [{ text: 'It creates an order.', citations: ['src/Orders/Checkout.cs:10-24'] }],
    ...overrides,
  };
}

/** The agent's answer `{ "cards": [card] }` as JSON text. */
export function cardsJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ cards: [cardObject(overrides)] });
}

/** The problems the parser reports for an answer; empty when the answer is valid. */
export function problemsOf(raw: string): readonly { path: string; message: string }[] {
  const parsed = parseCardOutput(raw);
  return parsed.ok ? [] : parsed.error;
}

export function problemPaths(raw: string): readonly string[] {
  return problemsOf(raw).map((problem) => problem.path);
}
