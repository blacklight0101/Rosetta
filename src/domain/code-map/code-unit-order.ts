// RF-106: one comparison for every sorted list of the scan, so the order never depends on a locale.

/** Orders strings by UTF-16 code unit, the same everywhere. */
export function byCodeUnit(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
