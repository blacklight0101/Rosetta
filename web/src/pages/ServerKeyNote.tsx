import type { JSX } from 'preact';
import type { RunEstimate } from '../api/estimate-schemas.js';
import { Glyph } from '../components/Glyph.js';
import { Link } from '../components/Link.js';
import { providerNames } from './provider-choices.js';

// RF-1104, RF-1001, P1-107: a role that has no key of the user's own runs on the server's key. The
// page cannot see whether the server holds one, or whether the account may use it, so it says that
// the run may be refused (RST-2302, providerKeyMissing) and where to add an own key instead.

/** The providers whose roles run on the server's key in this estimate. */
function serverKeyProviders(estimate: RunEstimate): string {
  return providerNames(
    estimate.roles.filter((role) => role.keySource === 'server').map((role) => role.provider),
  );
}

// RF-1104
export function ServerKeyNote({
  estimate,
}: {
  readonly estimate: RunEstimate;
}): JSX.Element | null {
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
