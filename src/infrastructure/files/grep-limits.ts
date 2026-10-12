// RF-146: the bounds of a model-supplied search.
export const grepLimits = {
  maxPatternLength: 200,
  maxLineLength: 2000,
  timeoutMs: 2000,
  /** Matches past this are dropped and the agent is told (P1-67). */
  maxMatches: 1000,
} as const;

export function isPatternTooLong(pattern: string): boolean {
  return pattern.length > grepLimits.maxPatternLength;
}

/** A line as it is searched: cut to the limit, with a flag the agent sees. */
export interface SearchedLine {
  readonly text: string;
  readonly cut: boolean;
}

export function cutLine(line: string): SearchedLine {
  return line.length > grepLimits.maxLineLength
    ? { text: line.slice(0, grepLimits.maxLineLength), cut: true }
    : { text: line, cut: false };
}
