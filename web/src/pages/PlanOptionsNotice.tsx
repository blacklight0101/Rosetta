import type { JSX } from 'preact';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Button } from '../components/Button.js';
import type { OptionsLoad } from './use-plan-options.js';

// RF-608, RF-609, RF-143: what the options of the planner are doing: waiting for the consent,
// being asked, or not available (with the reason and a way to ask again).

export interface PlanOptionsNoticeProps {
  readonly load: OptionsLoad;
  /** The planner would send code off this machine and the consent is not given yet. */
  readonly waitingForConsent: boolean;
  readonly askAgain: () => void;
}

// RF-608
export function PlanOptionsNotice(props: PlanOptionsNoticeProps): JSX.Element | null {
  const { load, waitingForConsent, askAgain } = props;
  if (load.status === 'failed') {
    return (
      <div class="rst-plan-options-note">
        <ErrorBanner error={load.error} />
        <p class="rst-plan-note">
          The options could not be made. You can still choose from the catalogue or type your own.
        </p>
        <Button onClick={askAgain}>Ask again</Button>
      </div>
    );
  }
  if (load.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Asking the planner for options from the code map
      </p>
    );
  }
  if (load.status === 'idle' && waitingForConsent) {
    return (
      <p class="rst-plan-note" role="status">
        The planner reads excerpts of your code to propose options. Give the consent below to ask
        it.
      </p>
    );
  }
  return null;
}
