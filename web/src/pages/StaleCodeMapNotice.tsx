import type { JSX } from 'preact';
import { Button } from '../components/Button.js';
import type { StartForm } from './use-start-form.js';

// RF-113: a code map made by an older scanner is still usable, so this is a notice with a way to a
// new scan, not a block. The estimate says whether the map is out of date.
export function StaleCodeMapNotice({ form }: { readonly form: StartForm }): JSX.Element | null {
  const { estimate } = form.choice;
  if (estimate.status !== 'ready' || estimate.estimate.codeMap?.outdated !== true) return null;
  return (
    <section class="rst-card" aria-label="Outdated code map">
      <h2 class="rst-live-section__title">The code map is out of date.</h2>
      <p>
        A newer scanner finds more, for example third-party code that an understand run can leave
        out. Scan again first, or go on with this code map.
      </p>
      <Button
        onClick={() => {
          form.setStage('scan');
        }}
      >
        Scan again
      </Button>
    </section>
  );
}
