// RF-144, RF-146, RF-201, ADR-013: the bounds of what one tool call may return. A model chooses the
// arguments, so every result is capped here, whatever the repository holds.

export interface ToolLimits {
  /** The most lines one read_file call may ask for (`scan.excerptMaxLines`, RF-144). */
  readonly maxReadLines: number;
  /** A longer line is cut to this many characters (RF-146). */
  readonly maxLineChars: number;
  /** The most characters of content in one result; a read stops at the last whole line that fits. */
  readonly maxResultChars: number;
  /** The most matches one grep call returns. */
  readonly maxGrepMatches: number;
  /** The most entries one list_area_files or codemap_query result names. */
  readonly maxListedItems: number;
}

export const defaultToolLimits: ToolLimits = {
  maxReadLines: 400,
  maxLineChars: 2000,
  maxResultChars: 40_000,
  maxGrepMatches: 100,
  maxListedItems: 200,
};

/** At most 200 characters, like the grep pattern of RF-146. */
export const maxQueryChars = 200;
/** A repository path longer than this is refused before it is looked up. */
export const maxPathChars = 512;
