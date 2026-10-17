// RF-264: the overview call of the webforms run in the end-to-end server (e2e-provider.ts) answers
// with the usage of every answer there; the meter test counts its tokens.

export const OVERVIEW_CALL_USAGE = { inputTokens: 24, outputTokens: 2 } as const;

export const OVERVIEW_CALL_TOKENS =
  OVERVIEW_CALL_USAGE.inputTokens + OVERVIEW_CALL_USAGE.outputTokens;
