import type { JSX, RefObject } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { deleteKey } from '../api/account.js';
import type { ApiFailure } from '../api/client.js';
import type { KeyProvider, KeySummary } from '../api/schemas.js';
import { useApp } from '../app/app-context.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Glyph } from '../components/Glyph.js';
import { useRefusalFocus } from '../lib/use-refusal-focus.js';
import { KeyEntryForm } from './KeyEntryForm.js';
import type { ProviderMeta } from './provider-meta.js';

// RF-1104, design-system.md section 14 (settings and keys): one provider. Without a key it offers
// the fields to save one; with a key it shows only the last four characters, and Replace and
// Delete each ask first. The Test button of P1-29 joins the buttons of the saved state.

export interface KeyRowProps {
  readonly provider: ProviderMeta;
  readonly saved: KeySummary | undefined;
  readonly onSaved: (summary: KeySummary) => void;
  readonly onRemoved: (provider: KeyProvider) => void;
}

type Mode = 'view' | 'replace' | 'delete';

const savedOn = (updatedAt: string): string => updatedAt.slice(0, 'YYYY-MM-DD'.length);

/** RNF-010: the confirmation takes focus when it appears, so it is read out; a failure, the banner. */
function useConfirmationFocus(failure: ApiFailure | undefined): RefObject<HTMLDivElement> {
  const group = useRef<HTMLDivElement>(null);
  useRefusalFocus(group, failure);
  useEffect(() => {
    group.current?.focus();
  }, []);
  return group;
}

function DeleteButtons(props: {
  readonly busy: boolean;
  readonly onConfirm: () => Promise<void>;
  readonly onCancel: () => void;
}): JSX.Element {
  return (
    <div class="rst-key-row__actions">
      <Button
        variant="danger"
        busy={props.busy}
        onClick={() => {
          void props.onConfirm();
        }}
      >
        Delete key
      </Button>
      <Button onClick={props.onCancel}>Cancel</Button>
    </div>
  );
}

function DeleteConfirmation(props: {
  readonly provider: ProviderMeta;
  readonly saved: KeySummary;
  readonly onRemoved: (provider: KeyProvider) => void;
  readonly onCancel: () => void;
}): JSX.Element {
  const { provider, saved, onRemoved, onCancel } = props;
  const { client } = useApp();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | undefined>();
  const group = useConfirmationFocus(failure);

  const confirm = async (): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    const result = await deleteKey(client, provider.id);
    if (result.ok) {
      onRemoved(provider.id);
      return;
    }
    setFailure(result.error);
    setBusy(false);
  };

  return (
    <div
      ref={group}
      class="rst-key-row__confirm"
      role="group"
      aria-labelledby={`delete-question-${provider.id}`}
      tabIndex={-1}
    >
      {failure === undefined ? null : <ErrorBanner error={failure} />}
      <p id={`delete-question-${provider.id}`}>
        Delete the key ending {saved.last4}? Your runs then use the server keys if the administrator
        allows them for your account.
      </p>
      <DeleteButtons busy={busy} onConfirm={confirm} onCancel={onCancel} />
    </div>
  );
}

function SavedSummary({ saved }: { readonly saved: KeySummary }): JSX.Element {
  return (
    <p class="rst-key-row__saved">
      <span>
        Key ending <span class="rst-mono">{saved.last4}</span>
      </span>
      <span class="rst-badge rst-badge--ok-tint">
        <Glyph name="check" />
        Your key · saved {savedOn(saved.updatedAt)}
      </span>
    </p>
  );
}

function KeyActions(props: {
  readonly provider: ProviderMeta;
  readonly onMode: (mode: Mode) => void;
}): JSX.Element {
  return (
    <div class="rst-key-row__actions">
      <Button
        id={`replace-${props.provider.id}`}
        onClick={() => {
          props.onMode('replace');
        }}
      >
        Replace
      </Button>
      <Button
        id={`delete-${props.provider.id}`}
        variant="danger-outline"
        onClick={() => {
          props.onMode('delete');
        }}
      >
        Delete
      </Button>
    </div>
  );
}

function SavedKey(props: KeyRowProps & { readonly saved: KeySummary }): JSX.Element {
  const { provider, saved, onSaved, onRemoved } = props;
  const [mode, setMode] = useState<Mode>('view');
  const [returnTo, setReturnTo] = useState<string | undefined>();
  const backToView = (): void => {
    setReturnTo(`${mode}-${provider.id}`);
    setMode('view');
  };
  // RNF-010: leaving a confirmation puts focus back on the button that opened it.
  useEffect(() => {
    if (mode === 'view' && returnTo !== undefined) document.getElementById(returnTo)?.focus();
  }, [mode, returnTo]);
  return (
    <>
      <SavedSummary saved={saved} />
      {mode === 'view' ? <KeyActions provider={provider} onMode={setMode} /> : null}
      {mode === 'replace' ? (
        <>
          <KeyEntryForm
            provider={provider}
            submitLabel="Replace key"
            note={`The saved key ending ${saved.last4} is removed once the new one is saved.`}
            focusOnShow
            onSaved={(summary) => {
              backToView();
              onSaved(summary);
            }}
            onCancel={backToView}
          />
        </>
      ) : null}
      {mode === 'delete' ? (
        <DeleteConfirmation
          provider={provider}
          saved={saved}
          onRemoved={(removed) => {
            backToView();
            onRemoved(removed);
          }}
          onCancel={backToView}
        />
      ) : null}
    </>
  );
}

// RF-1104
export function KeyRow(props: KeyRowProps): JSX.Element {
  const { provider, saved, onSaved } = props;
  const had = useRef(saved !== undefined);
  // RNF-010: when the row changes between "no key" and "saved" the control that had focus is gone;
  // focus moves to the one that took its place.
  useEffect(() => {
    const has = saved !== undefined;
    if (has === had.current) return;
    had.current = has;
    document.getElementById(has ? `replace-${provider.id}` : `key-${provider.id}`)?.focus();
  }, [saved, provider.id]);
  return (
    <div class="rst-key-row" data-testid="key-row">
      <div>
        <h3 class="rst-key-row__name">{provider.label}</h3>
        <p class="rst-key-row__hint">{provider.hint}</p>
      </div>
      <div class="rst-key-row__body">
        {saved === undefined ? (
          <KeyEntryForm provider={provider} submitLabel="Save key" onSaved={onSaved} />
        ) : (
          <SavedKey {...props} saved={saved} />
        )}
      </div>
    </div>
  );
}
