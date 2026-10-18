import type { JSX } from 'preact';
import { Field } from '../components/Field.js';
import { Glyph } from '../components/Glyph.js';
import { providerLabel } from './provider-choices.js';

// RF-143, RF-1001, design-system.md section 14 (Start run): the notice that the planner would send
// masked excerpts of the code to a cloud provider. It names the provider and holds the consent
// checkbox the options and the run wait for. The server enforces it too (RST-1515).

export interface PlanConsentNoticeProps {
  readonly provider: string;
  readonly consent: boolean;
  readonly onConsent: (checked: boolean) => void;
}

const titleId = 'plan-consent-title';

// RF-143
export function PlanConsentNotice(props: PlanConsentNoticeProps): JSX.Element {
  const name = providerLabel(props.provider);
  return (
    <section class="rst-callout rst-callout--warn" aria-labelledby={titleId}>
      <div class="rst-callout__row">
        <span class="rst-callout__icon">
          <Glyph name="warning-triangle" />
        </span>
        <div class="rst-callout__body">
          <p>
            <strong id={titleId}>Code will leave this machine.</strong> The planner uses {name}.
            Excerpts are masked for secrets and every one is logged in the egress log.
          </p>
          <Field
            kind="checkbox"
            id="plan-consent"
            label={`I understand; send masked excerpts to ${name} to plan`}
            checked={props.consent}
            onChange={props.onConsent}
          />
        </div>
      </div>
    </section>
  );
}
