import type { JSX } from 'preact';

// RF-1106, DEC-107 (P3-91): the note that names the administrator's run cap on server keys. Scaffolding.

export interface ServerRunCapNoteProps {
  readonly serverKeys: boolean;
  readonly administrator: bigint | undefined;
  readonly typed: bigint;
  readonly where: 'start' | 'settings';
}

export function ServerRunCapNote(props: ServerRunCapNoteProps): JSX.Element | null {
  return props.serverKeys ? null : null;
}
