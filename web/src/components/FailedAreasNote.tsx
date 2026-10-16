import type { JSX } from 'preact';

// RF-208, RF-1008, RF-1002: a run that ended with areas whose task gave no usable card is never
// shown as a plain success. This says how many next to its state (history list, Projects table, top
// bar of the run page); it is nothing for a run without failed areas.

export interface FailedAreasNoteProps {
  readonly count: number;
  /** The class of the note where it is shown; the text is the same everywhere. */
  readonly class?: string;
}

/** `1 area failed`, `2 areas failed`. */
function failedAreasText(count: number): string {
  return `${String(count)} ${count === 1 ? 'area' : 'areas'} failed`;
}

// RF-208
export function FailedAreasNote({
  count,
  class: className,
}: FailedAreasNoteProps): JSX.Element | null {
  if (!(count > 0)) return null;
  return <span class={className ?? 'rst-table__sub'}>{failedAreasText(count)}</span>;
}
