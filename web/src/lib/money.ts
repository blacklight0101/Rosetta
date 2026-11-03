// RF-428, RF-1020, DEC-54: skeleton for the red commit; the formatter follows in the next commit.

export interface Money {
  readonly text: string;
  readonly exact: string;
}

export const formatMoney = (micros: string): Money => ({ text: micros, exact: micros });

export const priceTableText = (version: string): string => version;
