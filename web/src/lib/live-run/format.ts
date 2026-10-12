import { microsToDollars } from '../usd.js';

// RF-1003: numbers of the live page as people read them: tokens with thousands separators, cost in
// dollars with at least the cents (a fraction of a cent is kept: a small model call costs less).

export const tokensLabel = (tokens: number): string => tokens.toLocaleString('en-US');

export const costLabel = (micros: number): string =>
  `$${microsToDollars(String(Math.round(micros)))}`;
