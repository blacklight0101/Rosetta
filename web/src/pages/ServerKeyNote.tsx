import type { JSX } from 'preact';
import type { RunEstimate } from '../api/estimate-schemas.js';
import { Glyph } from '../components/Glyph.js';
import { Link } from '../components/Link.js';
import { likelyText, missingKeyProviders, worstCaseText } from '../lib/journey-approval.js';
import { providerNames } from './provider-choices.js';

// RF-1104, RF-1001, P1-107: a role that has no key of the user's own runs on the server's key. The
// page cannot see whether the server holds one, or whether the account may use it, so it says that
// the run may be refused (RST-2302, providerKeyMissing) and where to add an own key instead.
// RF-431: when the estimate knows a role has no usable key at all, it says the key is missing, and
// Start stays unavailable. RF-430: the journey total the user approves, and its worst case.

/** The providers whose roles run on the server's key in this estimate. */
function serverKeyProviders(estimate: RunEstimate): string {
  return providerNames(
    estimate.roles
      .filter((role) => role.keySource === 'server' && role.keyMissing !== true)
      .map((role) => role.provider),
  );
}

// RF-431
function KeyMissingNote({ estimate }: { readonly estimate: RunEstimate }): JSX.Element | null {
  const names = providerNames(missingKeyProviders(estimate));
  if (names === '') return null;
  return (
    <div class="rst-callout rst-callout--warn" data-testid="key-missing-note">
      <div class="rst-callout__row">
        <span class="rst-callout__icon">
          <Glyph name="exclamation" />
        </span>
        <p>
          Key missing: {names} has no key you can use, so the run would be refused (RST-2302). Add
          your own key in <Link href="/settings">Settings and keys</Link>, or ask the administrator
          to allow the server&apos;s key.
        </p>
      </div>
    </div>
  );
}

// RF-430
function JourneyNote({ estimate }: { readonly estimate: RunEstimate }): JSX.Element | null {
  const { journey } = estimate;
  const likely = likelyText(estimate);
  const worst = worstCaseText(estimate);
  if (journey === undefined || likely === undefined || worst === undefined) return null;
  const basis =
    journey.basis === 'history'
      ? 'From the measured totals of earlier runs of this model.'
      : 'From fixed assumptions: no earlier run of this model yet.';
  return (
    <p class="rst-settings__note" data-testid="journey-total">
      {`The whole journey (understand with claim checking, ${String(journey.deepenRounds)} Deepen rounds and the plan): likely ${likely}, worst case ${worst}. Starting approves the worst case: the run asks before it goes past it. ${basis}`}
    </p>
  );
}

// RF-1104
function ServerOnlyNote({ estimate }: { readonly estimate: RunEstimate }): JSX.Element | null {
  const names = serverKeyProviders(estimate);
  if (names === '') return null;
  return (
    <div class="rst-callout rst-callout--info" data-testid="server-key-note">
      <div class="rst-callout__row">
        <span class="rst-callout__icon">
          <Glyph name="exclamation" />
        </span>
        <p>
          {names} runs on the server&apos;s key. If the server holds no key for it, or your account
          may not use the server&apos;s keys, the run is refused (RST-2302). To use your own key,
          add it in <Link href="/settings">Settings and keys</Link>.
        </p>
      </div>
    </div>
  );
}

// RF-1104, RF-430, RF-431
export function ServerKeyNote({ estimate }: { readonly estimate: RunEstimate }): JSX.Element {
  return (
    <>
      <JourneyNote estimate={estimate} />
      <KeyMissingNote estimate={estimate} />
      <ServerOnlyNote estimate={estimate} />
    </>
  );
}
