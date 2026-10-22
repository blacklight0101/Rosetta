import type { JSX } from 'preact';
import { Glyph } from '../components/Glyph.js';
import { dollars } from '../lib/estimate-math.js';

// RF-1106, DEC-107 (P3-91): the note that names the administrator's run cap. On the start page it
// is shown for a run on the server's keys, whose cap is the lower of the two. In the project settings
// no key is known yet, so the note says what a run on the server's keys stops at. A note is shown only
// when the administrator's run cap is lower than the typed one.

export interface ServerRunCapNoteProps {
  /** True when the estimate has a role on the server's key (start page only). */
  readonly serverKeys: boolean;
  /** The administrator's run cap; undefined while unknown, which shows nothing. */
  readonly administrator: bigint | undefined;
  /** The project's run cap as typed or saved. */
  readonly typed: bigint;
  readonly where: 'start' | 'settings';
}

function textOf(administrator: bigint, typed: bigint, where: 'start' | 'settings'): string {
  const cap = dollars(administrator);
  const project = dollars(typed);
  return where === 'start'
    ? `On the server's keys the run cap is ${cap}, the administrator's run cap, lower than the ${project} of this project. Only the administrator can raise it.`
    : `A run on the server's keys stops at ${cap}, the administrator's run cap, which is lower than the ${project} set here. Only the administrator can raise it.`;
}

// RF-1106
export function ServerRunCapNote(props: ServerRunCapNoteProps): JSX.Element | null {
  const { serverKeys, administrator, typed, where } = props;
  if (administrator === undefined || administrator >= typed) return null;
  if (where === 'start' && !serverKeys) return null;
  return (
    <div class="rst-callout rst-callout--info" data-testid="server-run-cap-note">
      <div class="rst-callout__row">
        <span class="rst-callout__icon">
          <Glyph name="exclamation" />
        </span>
        <p>{textOf(administrator, typed, where)}</p>
      </div>
    </div>
  );
}
