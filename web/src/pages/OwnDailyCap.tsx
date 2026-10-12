import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { getOwnDailyCap, saveOwnDailyCap } from '../api/account.js';
import type { ApiFailure } from '../api/client.js';
import { problemFor, type FieldMessage } from '../api/problems.js';
import { useApp } from '../app/app-context.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { dollarsToMicros, microsToDollars } from '../lib/usd.js';
import { useRefusalFocus } from '../lib/use-refusal-focus.js';

// DEC-107, RF-1106, design-system.md section 14 (settings and keys): the optional daily cap on the
// user's own keys. It is typed in dollars and saved as micro-dollars; an empty field means no cap.
// Runs on the user's own keys stop before they would pass it in a UTC day; the server keys keep
// the administrator's caps.

const field = 'ownDailyCapMicros';
const notAnAmount: Omit<FieldMessage, 'code'> = {
  message: 'Enter an amount in dollars, for example 2.50, or leave the field empty for no cap.',
};

type LoadState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly saved: string | null };

function savedMessage(micros: string | null): string {
  return micros === null
    ? 'Saved: no daily cap on your own keys.'
    : `Saved: runs on your own keys stop before they pass $${microsToDollars(micros)} in a UTC day.`;
}

function useOwnCap(): LoadState {
  const { client } = useApp();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  useEffect(() => {
    const abort = new AbortController();
    void getOwnDailyCap(client, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setState(
        result.ok
          ? { status: 'ready', saved: result.value }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      abort.abort();
    };
  }, [client]);
  return state;
}

interface CapSave {
  readonly text: string;
  readonly busy: boolean;
  readonly invalid: boolean;
  readonly failure: ApiFailure | undefined;
  readonly message: string;
  readonly type: (value: string) => void;
  readonly submit: () => Promise<void>;
}

function useCapSave(saved: string | null): CapSave {
  const { client } = useApp();
  const [text, setText] = useState(saved === null ? '' : microsToDollars(saved));
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | undefined>();
  const [message, setMessage] = useState('');

  const submit = async (): Promise<void> => {
    const micros = text.trim() === '' ? null : dollarsToMicros(text);
    setFailure(undefined);
    setMessage('');
    setInvalid(micros === undefined);
    if (micros === undefined) return;
    setBusy(true);
    const result = await saveOwnDailyCap(client, micros);
    setBusy(false);
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    setText(result.value === null ? '' : microsToDollars(result.value));
    setMessage(savedMessage(result.value));
  };
  const type = (value: string): void => {
    setText(value);
    setInvalid(false);
  };
  return { text, busy, invalid, failure, message, type, submit };
}

function CapForm({ saved }: { readonly saved: string | null }): JSX.Element {
  const { text, busy, invalid, failure, message, type, submit } = useCapSave(saved);
  const formRef = useRef<HTMLFormElement>(null);
  useRefusalFocus(formRef, failure);

  const fieldError = invalid ? notAnAmount : problemFor(failure, field);
  return (
    <form
      ref={formRef}
      class="rst-key-row__form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {failure === undefined || problemFor(failure, field) !== undefined ? null : (
        <ErrorBanner error={failure} />
      )}
      <Field
        kind="text"
        id="own-daily-cap-field"
        label="Daily cap for my own keys"
        placeholder="No cap"
        value={text}
        help="Optional, in US dollars. Runs that use your own keys stop before they would pass this amount in a UTC day. Leave it empty for no cap."
        error={fieldError}
        onInput={type}
      />
      <div class="rst-key-row__actions">
        <Button type="submit" variant="primary" busy={busy}>
          Save cap
        </Button>
      </div>
      <p class="rst-settings__note" role="status">
        {message}
      </p>
    </form>
  );
}

// DEC-107
export function OwnDailyCap(): JSX.Element {
  const state = useOwnCap();
  return (
    <section
      class="rst-card rst-settings__section"
      aria-labelledby="own-cap"
      data-testid="own-daily-cap"
    >
      <h2 id="own-cap" class="rst-settings__heading">
        Spending cap
      </h2>
      {state.status === 'loading' ? (
        <p class="rst-loading" role="status">
          Loading your cap
        </p>
      ) : null}
      {state.status === 'failed' ? <ErrorBanner error={state.error} /> : null}
      {state.status === 'ready' ? <CapForm saved={state.saved} /> : null}
    </section>
  );
}
