import { moneyText } from '../money.js';

// RF-1003, DEC-54: numbers of the live page as people read them: tokens with thousands separators, cost
// by the one money formatter (four decimals below $1, two above).

export const tokensLabel = (tokens: number): string => tokens.toLocaleString('en-US');

export const costLabel = (micros: number): string => moneyText(micros);

/** An amount left of the approved amount, rounded down so it never exceeds what is left (DEC-206). */
export const leftLabel = (micros: number): string => moneyText(micros, 'down');
