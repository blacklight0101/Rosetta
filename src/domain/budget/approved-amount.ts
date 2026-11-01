// RF-430, RF-432, ADR-026, DEC-196: the amount the user approved for a run (the journey's likely
// total, P7-04) and what Continue (+N) adds to it. The remainder is the worst case less the likely
// total, recorded at the start so the question offers it; a run without one is offered half its
// approved amount (the worst case of RF-430 is half as much again as the likely total).

/** Tokens and micro-dollars. */
export interface Amount {
  readonly tokens: number;
  readonly costMicros: number;
}

export interface ApprovedAmount extends Amount {
  /** RF-432: the journey's worst case less the approved (likely) total, for Continue (+N). */
  readonly remainder?: Amount | undefined;
}

/** RF-432: the N that Continue (+N) offers by default. */
// RF-432
export function continueAmountOf(approved: ApprovedAmount): Amount {
  const { remainder } = approved;
  if (remainder !== undefined && (remainder.tokens > 0 || remainder.costMicros > 0)) {
    return { tokens: remainder.tokens, costMicros: remainder.costMicros };
  }
  return { tokens: Math.ceil(approved.tokens / 2), costMicros: Math.ceil(approved.costMicros / 2) };
}

/** RF-432: the approved amount raised by N; the remainder stays for the next question. */
// RF-432
export function raiseApprovedAmount(approved: ApprovedAmount, extra: Amount): ApprovedAmount {
  return {
    ...approved,
    tokens: approved.tokens + extra.tokens,
    costMicros: approved.costMicros + extra.costMicros,
  };
}
