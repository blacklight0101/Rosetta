// RF-1008, P8-26: the start and the running time of a run as the project page's table reads them:
// "3 Nov, 09:25" (UTC, like the other dates the pages show) and "2 min" or "8 s".

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `3 Nov, 09:25` from an ISO instant. */
// RF-1008
export function startedText(instant: string): string {
  const month = months[Number(instant.slice(5, 7)) - 1] ?? instant.slice(5, 7);
  return `${String(Number(instant.slice(8, 10)))} ${month}, ${instant.slice(11, 16)}`;
}

/** `8 s`, `2 min`, `1 h 05 min`; a dash while the run has not ended or never started. */
// RF-1008
export function runningTimeText(startedAt: string | null, endedAt: string | null): string {
  if (startedAt === null || endedAt === null) return '–';
  const seconds = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(startedAt)) / 1000));
  if (seconds < 60) return `${String(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${String(minutes)} min`;
  return `${String(Math.floor(minutes / 60))} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** P8-88: skeleton, filled in by the next commit. */
export function wallTimeNote(runningMs: number | null, wallMs: number | null): string | null {
  return runningMs === wallMs ? null : null;
}
