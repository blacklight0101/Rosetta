import type { JSX } from 'preact';
import { useApp } from '../app/app-context.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { Link } from '../components/Link.js';
import { KeyRow } from './KeyRow.js';
import { providers } from './provider-meta.js';
import { useProviderKeys } from './use-provider-keys.js';

// RF-1104, RF-1103, DEC-107, design-system.md section 14 (settings and keys): the user's provider
// keys, the optional daily cap for those keys and the way to the change-password page.

function ProviderKeys(): JSX.Element {
  const { client } = useApp();
  const { state, saved, removed } = useProviderKeys(client);
  if (state.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Loading your keys
      </p>
    );
  }
  if (state.status === 'failed') return <ErrorBanner error={state.error} />;
  return (
    <>
      {providers.map((provider) => (
        <KeyRow
          key={provider.id}
          provider={provider}
          saved={state.keys.find((key) => key.provider === provider.id)}
          onSaved={saved}
          onRemoved={removed}
        />
      ))}
    </>
  );
}

// DEC-107: the user's optional daily cap for their own keys. No endpoint stores it yet (the usage
// caps belong to P1-27), so the slot is drawn but not wired; the field is disabled and says so.
function OwnDailyCapSlot(): JSX.Element {
  return (
    <section
      class="rst-card rst-settings__section"
      aria-labelledby="own-cap"
      data-testid="own-daily-cap"
    >
      <h2 id="own-cap" class="rst-settings__heading">
        Spending cap
      </h2>
      <Field
        kind="text"
        id="own-daily-cap-field"
        label="Daily cap for my own keys"
        placeholder="No cap"
        value=""
        disabled
        help="Optional. Runs that use your own keys stop when they would pass this amount in a UTC day. This setting is not available yet."
        onInput={() => undefined}
      />
    </section>
  );
}

// RF-1104
export function SettingsPage(): JSX.Element {
  return (
    <div class="rst-settings">
      <div>
        <h1 class="rst-page__title">Settings and keys</h1>
        <p class="rst-settings__lead">
          Your own provider keys are used first. Without one, your runs use the server&apos;s keys
          under your daily cap.
        </p>
      </div>
      <section class="rst-card rst-settings__section" aria-labelledby="keys">
        <h2 id="keys" class="rst-settings__heading">
          Provider keys
        </h2>
        <p class="rst-settings__note">
          Keys are encrypted on the server and never shown again after saving; you see only the last
          four characters. Replace and Delete ask for confirmation.
        </p>
        <ProviderKeys />
      </section>
      <OwnDailyCapSlot />
      <section class="rst-card rst-settings__section rst-settings__password" aria-labelledby="pw">
        <div>
          <h2 id="pw" class="rst-settings__heading">
            Password
          </h2>
          <p class="rst-settings__note">Changing it signs you out on every other browser.</p>
        </div>
        <Link href="/account/password" class="rst-button rst-button--secondary">
          Change password
        </Link>
      </section>
    </div>
  );
}
