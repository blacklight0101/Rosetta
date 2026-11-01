// RF-1108, EV-80: how every page says where a queued run stands: its place and how many runs are
// ahead of it. A wait estimate is not part of the requirement.

/** For example `2 runs ahead`, `1 run ahead` or `no run ahead`. */
function aheadText(position: number): string {
  const ahead = position - 1;
  if (ahead <= 0) return 'no run ahead';
  return `${String(ahead)} ${ahead === 1 ? 'run' : 'runs'} ahead`;
}

/** For example `position 3, 2 runs ahead`. */
export function queueText(position: number): string {
  return `position ${String(position)}, ${aheadText(position)}`;
}

/** `, position 3, 2 runs ahead` after a step's text, or nothing when the place is not known. */
export function queueSuffix(position: number | null | undefined): string {
  return position === null || position === undefined ? '' : `, ${queueText(position)}`;
}
