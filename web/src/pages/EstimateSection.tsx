import type { JSX } from 'preact';
import type { RunEstimate } from '../api/estimate-schemas.js';
import type { Project } from '../api/project-schemas.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { Glyph } from '../components/Glyph.js';
import { Link } from '../components/Link.js';
import type { CapWarning } from '../lib/cap-warnings.js';
import { scanSubjectOf } from '../lib/live-run/scan-subject.js';
import { capComparison } from '../lib/cap-comparison.js';
import { effectiveRunCapMicros } from '../lib/run-cap.js';
import type { EstimateLoad } from './use-estimate.js';
import { EstimateTable } from './EstimateTable.js';
import { ServerKeyNote } from './ServerKeyNote.js';
import { ServerRunCapNote } from './ServerRunCapNote.js';

// RF-425, RF-1001, DEC-71, DEC-108, DEC-117, design-system.md section 14 (Start run): the estimate
// card. The run cap is editable here, with a meter of the likely cost against it and a marker at the
// high estimate (a model without a price is named as left out of both); the confirm threshold
// stands beside it, since it may not be above the cap. A warning names every cap the likely
// estimate is over, and Start stays available. A role on the server's key says that the run may be
// refused (ServerKeyNote.tsx).

interface FieldError {
  readonly code?: string;
  readonly message: string;
}

interface CapField {
  readonly text: string;
  readonly capMicros: bigint;
  /** RF-1106: the administrator's run cap on server keys, and whether the estimate uses them. */
  readonly serverRunCap: {
    readonly administrator: bigint | undefined;
    readonly serverKeys: boolean;
  };
  /** `budget.run.maxTokens`: the cap an estimate of local models is compared with (Q-51). */
  readonly capTokens: number;
  readonly error: FieldError | undefined;
  readonly onInput: (text: string) => void;
  /** `budget.confirmAboveCostMicros` in dollars, which may not be above the cap (DEC-117). */
  readonly threshold: {
    readonly text: string;
    readonly error: FieldError | undefined;
    readonly onInput: (text: string) => void;
  };
}

export interface EstimateSectionProps {
  /** A scan makes no model calls, so there is nothing to estimate. */
  readonly scanOnly: boolean;
  /** Where the project's code comes from; the scan note names what it reads (RF-150). */
  readonly sourceKind: Project['sourceKind'];
  readonly estimate: EstimateLoad;
  readonly cap: CapField;
  readonly warnings: readonly CapWarning[];
  /** The project's settings page with its caps section, linked from a cap warning. */
  readonly capsHref: string;
}

const hintId = 'cap-hint';

function CapMeter(props: { readonly estimate: RunEstimate; readonly cap: CapField }): JSX.Element {
  const { estimate, cap } = props;
  const micros = effectiveRunCapMicros({ typed: cap.capMicros, ...cap.serverRunCap });
  const shown = capComparison(estimate, { micros, tokens: cap.capTokens });
  const mark = Math.min(100, shown.mark);
  return (
    <div class="rst-start__meter">
      <div
        class={shown.used > 100 ? 'rst-cap-meter rst-cap-meter--over' : 'rst-cap-meter'}
        role="meter"
        aria-label={shown.label}
        aria-describedby={hintId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, shown.used)}
      >
        <div
          class="rst-cap-meter__fill"
          style={{ inlineSize: `${String(Math.min(100, shown.used))}%` }}
        />
        <div class="rst-cap-meter__mark" style={{ insetInlineStart: `${String(mark)}%` }} />
      </div>
      <p id={hintId} class="rst-settings__note">
        {shown.sentence} The run stops before any call that could pass the cap.
      </p>
    </div>
  );
}

/** The caps of the project are where a run cap or a first-call reservation is changed. */
const namesProjectCaps = (id: CapWarning['id']): boolean => id === 'run' || id.startsWith('first-calls-');

function Warnings({
  warnings,
  capsHref,
}: {
  readonly warnings: readonly CapWarning[];
  readonly capsHref: string;
}): JSX.Element | null {
  if (warnings.length === 0) return null;
  return (
    <div class="rst-callout rst-callout--warn" role="status" data-testid="cap-warning">
      {warnings.map((warning) => (
        <div key={warning.id} class="rst-callout__row">
          <span class="rst-callout__icon">
            <Glyph name="warning-triangle" />
          </span>
          <p>
            {warning.text}
            {namesProjectCaps(warning.id) ? (
              <>
                {' '}
                <Link href={capsHref}>Review the caps</Link>
              </>
            ) : null}
          </p>
        </div>
      ))}
    </div>
  );
}

/** The run cap with its meter, and the confirm threshold beside it (DEC-117). */
function CapFields(props: { readonly cap: CapField; readonly estimate: RunEstimate }): JSX.Element {
  const { cap, estimate } = props;
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
        <CapMeter estimate={estimate} cap={cap} />
      </div>
      <div class="rst-start__threshold">
        <Field
          kind="text"
          id="confirm-above"
          label="Ask before a run estimated above (USD)"
          help="It may not be above the run cap; lower it with the cap."
          value={cap.threshold.text}
          error={cap.threshold.error}
          announce={false}
          onInput={cap.threshold.onInput}
        />
      </div>
    </>
  );
}

function Body(props: EstimateSectionProps & { readonly onRetry: () => void }): JSX.Element {
  const { estimate, cap, warnings, onRetry } = props;
  if (props.scanOnly) {
    return (
      <p class="rst-settings__note">
        A scan reads {scanSubjectOf(props.sourceKind)} and writes the code map. It makes no model
        calls and costs nothing.
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
      <CapFields cap={cap} estimate={estimate.estimate} />
      <ServerRunCapNote
        serverKeys={cap.serverRunCap.serverKeys}
        administrator={cap.serverRunCap.administrator}
        typed={cap.capMicros}
        where="start"
      />
      <Warnings warnings={warnings} capsHref={props.capsHref} />
      <ServerKeyNote estimate={estimate.estimate} />
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
