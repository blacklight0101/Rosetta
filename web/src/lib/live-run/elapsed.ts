// RF-1002: the time of an event in the log, counted from the start of the run.

/** `mm:ss.s` after `startedAt`; the clock time `hh:mm:ss` (UTC) when the start is unknown or later. */
// RF-1002
export function elapsedLabel(startedAt: string | undefined, at: string): string {
  void startedAt;
  void at;
  return '';
}
