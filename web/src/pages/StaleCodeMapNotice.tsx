import type { JSX } from 'preact';
import { Button } from '../components/Button.js';
import type { StartForm } from './use-start-form.js';

// RF-113, DEC-136: a code map from an older scanner. A new scan is the first action; starting an
// understand run on the old map needs the confirmation below. The notice goes once the stage is Scan.
export function StaleCodeMapNotice({ form }: { readonly form: StartForm }): JSX.Element | null {
  const { oldMap } = form;
  if (!oldMap.outdated || form.stage !== 'understand') return null;
  return (
    <section class="rst-card" aria-label="Outdated code map">
      <h2 class="rst-live-section__title">The code map is out of date.</h2>
      <p>
        A newer scanner finds more, for example third-party code that an understand run can leave
        out. Scan again first.
      </p>
      <Button
        onClick={() => {
          form.setStage('scan');
        }}
      >
        Scan again
      </Button>
      <label class="rst-start__choice">
        <input
          type="checkbox"
          checked={oldMap.confirmed}
          onChange={(event) => {
            oldMap.set(event.currentTarget.checked);
          }}
        />
        Use the old code map for this run
      </label>
    </section>
  );
}
