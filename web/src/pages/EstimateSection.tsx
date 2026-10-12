import type { JSX } from 'preact';
import type { RunEstimate } from '../api/estimate-schemas.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { Glyph } from '../components/Glyph.js';
import type { CapWarning } from '../lib/cap-warnings.js';
import { dollars, percentOf, pricedTotal } from '../lib/estimate-math.js';
import type { EstimateLoad } from './use-estimate.js';
import { EstimateTable } from './EstimateTable.js';

// RF-425, RF-1001, DEC-71, DEC-108, design-system.md section 14 (Start run): the estimate card. The
// run cap is editable here, with a meter of the likely cost against it and a marker at the high
// estimate; a warning names every cap the likely estimate is over, and Start stays available.

interface CapField {
  readonly text: string;
  readonly capMicros: bigint;
  readonly error: { readonly code?: string; readonly message: string } | undefined;
  readonly onInput: (text: string) => void;
}

export interface EstimateSectionProps {
  /** A scan makes no model calls, so there is nothing to estimate. */
  readonly scanOnly: boolean;
  readonly estimate: EstimateLoad;
  readonly cap: CapField;
  readonly warnings: readonly CapWarning[];
}

const hintId = 'cap-hint';

function CapMeter(props: { readonly estimate: RunEstimate; readonly cap: bigint }): JSX.Element {
  const { estimate, cap } = props;
  const likely = pricedTotal(estimate, 'likely');
  const high = pricedTotal(estimate, 'high');
  const used = percentOf(likely, cap);
  const mark = Math.min(100, percentOf(high, cap));
  return (
    <div class="rst-start__meter">
      <div
        class={used > 100 ? 'rst-cap-meter rst-cap-meter--over' : 'rst-cap-meter'}
        role="meter"
        aria-label="Likely cost against the cap"
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, used)}
      >
        <div class="rst-cap-meter__fill" style={{ inlineSize: `${String(Math.min(100, used))}%` }} />
        <div class="rst-cap-meter__mark" style={{ insetInlineStart: `${String(mark)}%` }} />
      </div>
      <p id={hintId} class="rst-settings__note">
        Likely {dollars(likely)} is {used}% of the cap; the marker shows the high estimate,{' '}
        {dollars(high)}. The run stops before any call that could pass the cap.
      </p>
    </div>
  );
}

function Warnings({ warnings }: { readonly warnings: readonly CapWarning[] }): JSX.Element | null {
  if (warnings.length === 0) return null;
  return (
    <div class="rst-callout rst-callout--warn" role="status" data-testid="cap-warning">
      {warnings.map((warning) => (
        <div key={warning.id} class="rst-callout__row">
          <span class="rst-callout__icon">
            <Glyph name="warning-triangle" />
          </span>
          <p>{warning.text}</p>
        </div>
      ))}
    </div>
  );
}

function Body(props: EstimateSectionProps & { readonly onRetry: () => void }): JSX.Element {
  const { estimate, cap, warnings, onRetry } = props;
  if (props.scanOnly) {
    return (
      <p class="rst-settings__note">
        A scan reads the repository and writes the code map. It makes no model calls and costs
        nothing.
      </p>
    );
  }
  if (estimate.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Estimating
      </p>
    );
  }
  if (estimate.status === 'failed') {
    return (
      <>
        <ErrorBanner error={estimate.error} />
        <div>
          <Button onClick={onRetry}>Try again</Button>
        </div>
      </>
    );
  }
  if (estimate.status === 'none') return <p class="rst-settings__note">No estimate yet.</p>;
  return (
    <>
      <div class="rst-start__cap">
        <Field
          kind="text"
          id="run-cap"
          label="Run cap (USD)"
          value={cap.text}
          error={cap.error}
          describedBy={hintId}
          announce={false}
          onInput={cap.onInput}
        />
        <CapMeter estimate={estimate.estimate} cap={cap.capMicros} />
      </div>
      <Warnings warnings={warnings} />
      <EstimateTable estimate={estimate.estimate} />
    </>
  );
}

// RF-425
export function EstimateSection(
  props: EstimateSectionProps & { readonly onRetry: () => void },
): JSX.Element {
  return (
    <section class="rst-card rst-settings__section" aria-labelledby="estimate-heading">
      <h2 id="estimate-heading" class="rst-settings__heading">
        Estimate before running
      </h2>
      <Body {...props} />
    </section>
  );
}
