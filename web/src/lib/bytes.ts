// RF-1012, History artboard: the space a deletion frees, in decimal units (the unit a disk reports)
// with one decimal from a kilobyte up: `5 B`, `3.2 MB`, `18.4 MB`.

const units = ['kB', 'MB', 'GB', 'TB'] as const;
const step = 1000;

// RF-1012
export function bytesText(bytes: number): string {
  if (bytes < step) return `${String(bytes)} B`;
  let value = bytes / step;
  let unit = 0;
  while (value >= step && unit < units.length - 1) {
    value /= step;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit] ?? 'TB'}`;
}
