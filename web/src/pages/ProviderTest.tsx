import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { testProviders } from '../api/account.js';
import type { ApiFailure } from '../api/client.js';
import type { RoleTest } from '../api/schemas.js';
import { useApp } from '../app/app-context.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Glyph } from '../components/Glyph.js';
import { microsToDollars } from '../lib/usd.js';

// RF-407, design-system.md section 14 (settings and keys): the Test button. The server makes one
// tiny call per role of a new project through the same guards as a run and answers each role as
// reachable or with its error code, what happened and what to do, and what the call cost; the
// calls are counted in the user's usage. The roles are the ones a new project starts with (the
// server's default models), not a project's own.

type TestState =
  | { readonly status: 'idle' }
  | { readonly status: 'running' }
  | { readonly status: 'done'; readonly roles: readonly RoleTest[] }
  | { readonly status: 'failed'; readonly error: ApiFailure };

const roleLabels: Readonly<Record<RoleTest['role'], string>> = {
  reader: 'Reader',
  verifier: 'Verifier',
  planner: 'Planner',
  summariser: 'Summariser',
};

const roleOrder = ['reader', 'verifier', 'planner', 'summariser'] as const;

function useProviderTest(): { readonly state: TestState; readonly press: () => void } {
  const { client } = useApp();
  const [state, setState] = useState<TestState>({ status: 'idle' });
  // A second press before the first answer must not send a second test: each one costs money.
  const running = useRef(false);

  const press = (): void => {
    if (running.current) return;
    running.current = true;
    setState({ status: 'running' });
    void testProviders(client).then((result) => {
      running.current = false;
      setState(
        result.ok
          ? { status: 'done', roles: result.value }
          : { status: 'failed', error: result.error },
      );
    });
  };
  return { state, press };
}

function Outcome({ result }: { readonly result: RoleTest }): JSX.Element {
  if (result.status === 'reachable') {
    return (
      <span class="rst-badge rst-badge--ok-tint">
        <Glyph name="check" />
        Reachable
      </span>
    );
  }
  return (
    <span class="rst-badge rst-badge--danger-tint">
      <Glyph name="cross" />
      Failed
    </span>
  );
}

function ResultRow({ result }: { readonly result: RoleTest }): JSX.Element {
  return (
    <li class="rst-provider-test__result" data-testid="provider-test-result">
      <div class="rst-provider-test__summary">
        <span class="rst-provider-test__role">{roleLabels[result.role]}</span>
        <span class="rst-mono">
          {result.provider} · {result.model}
        </span>
        <Outcome result={result} />
        <span class="rst-provider-test__cost">Cost ${microsToDollars(result.costMicros)}</span>
      </div>
      {result.code === undefined ? null : (
        <p class="rst-provider-test__error">
          <span class="rst-mono">{result.code}</span> {result.message} {result.nextStep}
        </p>
      )}
    </li>
  );
}

/** RNF-010: while the answer is awaited each role shows that it is being tested. */
function Pending(): JSX.Element {
  return (
    <>
      <p class="rst-loading">
        Testing the providers. A model that is not loaded yet can take half a minute.
      </p>
      <ul class="rst-provider-test__results">
        {roleOrder.map((role) => (
          <li key={role} class="rst-provider-test__result" data-testid="provider-test-pending">
            <div class="rst-provider-test__summary">
              <span class="rst-provider-test__role">{roleLabels[role]}</span>
              <span class="rst-badge rst-badge--neutral-tint">
                <Glyph name="clock" />
                Testing...
              </span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Results({ state }: { readonly state: TestState }): JSX.Element | null {
  if (state.status !== 'done') return null;
  return (
    <ul class="rst-provider-test__results">
      {state.roles.map((result) => (
        <ResultRow key={result.role} result={result} />
      ))}
    </ul>
  );
}

// RF-407
export function ProviderTest(): JSX.Element {
  const { state, press } = useProviderTest();
  return (
    <section
      class="rst-card rst-settings__section"
      aria-labelledby="provider-test"
      data-testid="provider-test"
    >
      <h2 id="provider-test" class="rst-settings__heading">
        Test providers
      </h2>
      <p class="rst-settings__note">
        Sends one tiny request to the provider and model of each role (the models a new project
        starts with) and shows whether it answers. Each test is counted in your usage.
      </p>
      <div class="rst-key-row__actions">
        <Button variant="secondary" busy={state.status === 'running'} onClick={press}>
          Test providers
        </Button>
      </div>
      {state.status === 'failed' ? <ErrorBanner error={state.error} /> : null}
      <div role="status" aria-live="polite">
        {state.status === 'running' ? <Pending /> : null}
        <Results state={state} />
      </div>
    </section>
  );
}
