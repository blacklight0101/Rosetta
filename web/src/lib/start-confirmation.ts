// RF-425, DEC-97, DEC-117: when the start page asks before it starts an understand run. It asks
// when the likely cost is above the confirm threshold, unless the user already confirmed that
// figure or a higher one: a re-estimate that gives the same or a lower figure does not ask again,
// one that raises it does. A threshold of zero asks for any run that costs something; a run that
// costs nothing (local models) never asks.

export interface ConfirmationInput {
  /** The likely cost of the priced roles in micro-dollars; undefined while there is no estimate. */
  readonly likelyMicros: bigint | undefined;
  readonly thresholdMicros: bigint;
  /** The highest likely cost the user already confirmed, 0 if none. */
  readonly confirmedMicros: bigint;
}

// RF-425
export function needsConfirmation(input: ConfirmationInput): boolean {
  const { likelyMicros, thresholdMicros, confirmedMicros } = input;
  if (likelyMicros === undefined) return false;
  return likelyMicros > thresholdMicros && likelyMicros > confirmedMicros;
}

export interface CapConfirmationInput {
  /** The likely tokens of the whole estimate; undefined while there is no estimate or it is priced. */
  readonly likelyTokens: number | undefined;
  readonly capTokens: number;
  /** The highest likely token count the user already confirmed, 0 if none. */
  readonly confirmedTokens: number;
}

// RF-429
export function needsCapConfirmation(input: CapConfirmationInput): boolean {
  return input.capTokens < 0;
}
