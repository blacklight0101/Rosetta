import type { JSX } from 'preact';
import type { RoleEstimate } from '../api/estimate-schemas.js';
import { Field } from '../components/Field.js';
import { Glyph } from '../components/Glyph.js';
import { providerLabel, providerNames } from './provider-choices.js';

// RF-143, RF-1001, design-system.md section 14 (Start run): the notice that code will leave this
// machine. It names every provider the run's roles use, says what protects the code, and holds the
// consent checkbox; Start stays off until it is checked. The server enforces it too (RST-1515).

export interface CloudNoticeProps {
  /** The roles that send code off this machine. */
  readonly roles: readonly RoleEstimate[];
  readonly consent: boolean;
  /** The server's refusal, shown next to the checkbox. */
  readonly error: { readonly code: string; readonly message: string } | undefined;
  readonly onConsent: (checked: boolean) => void;
}

const titleId = 'cloud-notice-title';

function roleSentences(roles: readonly RoleEstimate[]): string {
  return roles.map((role) => `The ${role.role} uses ${providerLabel(role.provider)}.`).join(' ');
}

// RF-143
export function CloudNotice(props: CloudNoticeProps): JSX.Element {
  const { roles, consent, error, onConsent } = props;
  const names = providerNames(roles.map((role) => role.provider));
  return (
    <section class="rst-callout rst-callout--warn" aria-labelledby={titleId}>
      <div class="rst-callout__row">
        <span class="rst-callout__icon">
          <Glyph name="warning-triangle" />
        </span>
        <div class="rst-callout__body">
          <p>
            <strong id={titleId}>Code will leave this machine.</strong> {roleSentences(roles)}{' '}
            Excerpts are masked for secrets and every one is logged in the egress log.
          </p>
          <Field
            kind="checkbox"
            id="cloud-consent"
            label={`I understand; send masked excerpts to ${names} for this run`}
            checked={consent}
            error={error}
            announce={false}
            onChange={onConsent}
          />
        </div>
      </div>
    </section>
  );
}
