import type { JSX } from 'preact';
import { Button } from '../components/Button.js';

// RF-1002, design-system.md section 4 (Pause updates): freezes the panels for reading while the run
// goes on. While paused a counter shows how many events wait and the button reads Resume. The counter
// has a fixed width so it never moves the buttons beside it, and it is not a live region: the page
// status says that updates are paused, once.

export interface PauseUpdatesProps {
  readonly paused: boolean;
  readonly waiting: number;
  readonly onToggle: () => void;
}

// RF-1002
export function PauseUpdates({ paused, waiting, onToggle }: PauseUpdatesProps): JSX.Element {
  return (
    <span class="rst-live-pause">
      {paused ? (
        <span class="rst-live-pause-count" data-testid="pause-count">
          {`${String(waiting)} ${waiting === 1 ? 'event' : 'events'} waiting`}
        </span>
      ) : (
        <span class="rst-live-pause-count" aria-hidden="true" />
      )}
      <Button onClick={onToggle}>{paused ? 'Resume' : 'Pause updates'}</Button>
    </span>
  );
}
