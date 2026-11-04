// RF-1008, P8-26, P8-88: the start and the running time of a run as the tables read them:
// "3 Nov, 09:25" (UTC, like the other dates the pages show) and "8 s", "66 min" or "2 h 10 min".

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The wall time follows the running time only when it is at least this much longer. */
const WALL_NOTE_AFTER_MS = 60_000;

/** `3 Nov, 09:25` from an ISO instant. */
// RF-1008
export function startedText(instant: string): string {
  const month = months[Number(instant.slice(5, 7)) - 1] ?? instant.slice(5, 7);
  return `${String(Number(instant.slice(8, 10)))} ${month}, ${instant.slice(11, 16)}`;
}

/** `8 s`, `66 min`, `2 h 10 min`; a dash while the run has not ended or never started. */
// RF-1008
export function runningTimeText(ms: number | null): string {
  if (ms === null) return '–';
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${String(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 120) return `${String(minutes)} min`;
  return `${String(Math.floor(minutes / 60))} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** `(over 2 h 10 min)` when the run waited at least a minute between its first start and its end. */
// RF-1008
export function wallTimeNote(runningMs: number | null, wallMs: number | null): string | null {
  if (runningMs === null || wallMs === null) return null;
  return wallMs - runningMs < WALL_NOTE_AFTER_MS ? null : `(over ${runningTimeText(wallMs)})`;
}
