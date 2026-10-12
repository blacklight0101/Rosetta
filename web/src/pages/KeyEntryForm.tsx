import type { JSX, RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { saveKey } from '../api/account.js';
import type { ApiFailure } from '../api/client.js';
import { namesAField, problemFor } from '../api/problems.js';
import type { KeySummary } from '../api/schemas.js';
import { useApp } from '../app/app-context.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { useRefusalFocus } from '../lib/use-refusal-focus.js';
import type { ProviderMeta } from './provider-meta.js';

// RF-1104: the fields that save a key for one provider (an OpenAI-compatible key also takes its
// base URL). The typed key lives in this form only: it is cleared when the form goes away, and
// nothing else keeps it.

export interface KeyEntryFormProps {
  readonly provider: ProviderMeta;
  readonly submitLabel: string;
  readonly onSaved: (summary: KeySummary) => void;
  /** Present when the form can be dismissed (a replacement, not a first key). */
  readonly onCancel?: () => void;
  /** Text that describes the key field, for example what a replacement removes. */
  readonly note?: string;
  /** Moves focus to the key field when the form appears. */
  readonly focusOnShow?: boolean;
}

interface KeyEntry {
  readonly key: string;
  readonly baseUrl: string;
  readonly busy: boolean;
  readonly failure: ApiFailure | undefined;
  readonly setKey: (value: string) => void;
  readonly setBaseUrl: (value: string) => void;
  readonly submit: () => Promise<void>;
}

function useKeyEntry(props: KeyEntryFormProps): KeyEntry {
  const { provider, onSaved } = props;
  const { client } = useApp();
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | undefined>();

  const submit = async (): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    const result = await saveKey(
      client,
      provider.id,
      provider.takesBaseUrl ? { key, baseUrl } : { key },
    );
    if (result.ok) {
      setKey('');
      onSaved(result.value);
      return;
    }
    setFailure(result.error);
    setBusy(false);
  };
  return { key, baseUrl, busy, failure, setKey, setBaseUrl, submit };
}

/** RNF-010: focus goes to the key field when asked, and to the first invalid field on a refusal. */
function useKeyFocus(
  failure: ApiFailure | undefined,
  focusOnShow: boolean,
  providerId: string,
): RefObject<HTMLFormElement> {
  const formRef = useRef<HTMLFormElement>(null);
  useRefusalFocus(formRef, failure);
  useEffect(() => {
    if (focusOnShow) document.getElementById(`key-${providerId}`)?.focus();
  }, [focusOnShow, providerId]);
  return formRef;
}

// RF-1104
export function KeyEntryForm(props: KeyEntryFormProps): JSX.Element {
  const { provider, submitLabel, onCancel, note, focusOnShow = false } = props;
  const entry = useKeyEntry(props);
  const { failure } = entry;
  const formRef = useKeyFocus(failure, focusOnShow, provider.id);
  return (
    <form
      ref={formRef}
      class="rst-key-row__form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void entry.submit();
      }}
    >
      {failure === undefined || namesAField(failure, ['key', 'baseUrl']) ? null : (
        <ErrorBanner error={failure} />
      )}
      {provider.takesBaseUrl ? (
        <Field
          kind="url"
          id={`base-url-${provider.id}`}
          label="Base URL"
          placeholder="https://api.example.com/v1"
          value={entry.baseUrl}
          error={problemFor(failure, 'baseUrl')}
          onInput={entry.setBaseUrl}
        />
      ) : null}
      <Field
        kind="password"
        id={`key-${provider.id}`}
        label="API key"
        autoComplete="off"
        help={note}
        value={entry.key}
        error={problemFor(failure, 'key')}
        onInput={entry.setKey}
      />
      <div class="rst-key-row__actions">
        <Button type="submit" variant="primary" busy={entry.busy}>
          {submitLabel}
        </Button>
        {onCancel === undefined ? null : <Button onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}
