import type { JSX } from 'preact';
import type { HeldConsent } from '../api/consent.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { consentLineText } from '../lib/consent-line.js';
import type { HeldConsentState } from './use-held-consent.js';

// RF-143, RF-209, DEC-209 (P8-81), artboard P8Deepen: while a consent of the project holds, the
// start page, the Deepen panel and Plan setup show this one line instead of the consent and the
// private-code confirmation: a tick, the day it was given, the providers, the day it ends, and
// Withdraw, which withdraws it so the boxes come back.

// RF-143
export function ConsentLine(props: {
  readonly consent: HeldConsent;
  readonly held: Pick<HeldConsentState, 'withdraw' | 'withdrawing' | 'error'>;
}): JSX.Element {
  const { held } = props;
  return (
    <>
      <div role="note" class="rst-consent-line">
        <span aria-hidden="true" class="rst-consent-line__tick">
          &#10003;
        </span>
        <span class="rst-consent-line__text">{consentLineText(props.consent)}</span>
        <Button variant="link" busy={held.withdrawing} onClick={held.withdraw}>
          Withdraw
        </Button>
      </div>
      {held.error === undefined ? null : <ErrorBanner error={held.error} />}
    </>
  );
}
