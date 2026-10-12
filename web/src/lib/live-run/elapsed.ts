// RF-1002: the time of an event in the log, counted from the start of the run.

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

/** `mm:ss.s` after `startedAt`; the clock time `hh:mm:ss` (UTC) when the start is unknown or later. */
// RF-1002
export function elapsedLabel(startedAt: string | undefined, at: string): string {
  const event = Date.parse(at);
  const start = startedAt === undefined ? Number.NaN : Date.parse(startedAt);
  if (Number.isNaN(event) || Number.isNaN(start) || event < start) {
    return Number.isNaN(event) ? at : new Date(event).toISOString().slice(11, 19);
  }
  const tenths = Math.floor((event - start) / 100);
  const seconds = Math.floor(tenths / 10);
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}.${String(tenths % 10)}`;
}
