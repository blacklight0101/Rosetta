import type { JSX } from 'preact';
import { plural, type Chosen } from './area-selection.js';

// RF-1018, P1-172: library code was chosen. The notice says what it adds to the estimate and asks
// once; Start waits for the answer (start-gate.ts).

export function LibraryChoiceNotice(props: {
  readonly chosen: Chosen;
  readonly confirmed: boolean;
  readonly onConfirm: (confirmed: boolean) => void;
}): JSX.Element {
  const { chosen } = props;
  return (
    <section class="rst-callout rst-callout--warn" aria-label="Library areas chosen">
      <p>
        You chose {plural(chosen.libraryAreas, 'library area')}. They add{' '}
        {chosen.libraryTokens.toLocaleString('en-US')} tokens to the estimate. Library code is
        rarely what a reader needs to understand the project, and it costs the most to read.
      </p>
      <label class="rst-start__choice">
        <input
          type="checkbox"
          checked={props.confirmed}
          onChange={(event) => {
            props.onConfirm(event.currentTarget.checked);
          }}
        />
        Read the library areas too
      </label>
    </section>
  );
}
