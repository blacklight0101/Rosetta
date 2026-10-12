import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { createUser } from '../api/admin.js';
import type { Account } from '../api/admin-schemas.js';
import type { ApiFailure } from '../api/client.js';
import { namesAField, problemFor } from '../api/problems.js';
import { useApp } from '../app/app-context.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { useRefusalFocus } from '../lib/use-refusal-focus.js';

// RF-1102, RF-1107, design-system.md section 14 (administration: users): the Create an account
// form. There is no sign-up; every account starts here. The new password must be changed at first
// sign-in unless the box is cleared (the teacher account, RF-1107). A refusal shows next to its
// field with its code; the typed password is cleared once the account exists.

const fields = ['userName', 'displayName', 'password'];
const roleOptions = [
  { value: 'user', label: 'user' },
  { value: 'admin', label: 'admin' },
] as const;

interface Draft {
  readonly userName: string;
  readonly displayName: string;
  readonly role: 'admin' | 'user';
  readonly password: string;
  readonly mustChangePassword: boolean;
}

const emptyDraft: Draft = {
  userName: '',
  displayName: '',
  role: 'user',
  password: '',
  mustChangePassword: true,
};

interface Creation {
  readonly draft: Draft;
  readonly busy: boolean;
  readonly failure: ApiFailure | undefined;
  readonly message: string;
  readonly edit: (patch: Partial<Draft>) => void;
  readonly submit: () => Promise<void>;
}

function useCreation(onCreated: (account: Account) => void): Creation {
  const { client } = useApp();
  const [draft, setDraft] = useState(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | undefined>();
  const [message, setMessage] = useState('');

  const submit = async (): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    setMessage('');
    const result = await createUser(client, {
      ...draft,
      userName: draft.userName.trim(),
      displayName: draft.displayName.trim(),
    });
    setBusy(false);
    if (!result.ok) {
      setFailure(result.error);
      return;
    }
    setDraft(emptyDraft);
    setMessage(
      result.value.state === 'MustChangePassword'
        ? `Created account ${result.value.userName}. It must choose a new password at first sign-in.`
        : `Created account ${result.value.userName}.`,
    );
    onCreated(result.value);
  };
  const edit = (patch: Partial<Draft>): void => {
    setDraft((current) => ({ ...current, ...patch }));
  };
  return { draft, busy, failure, message, edit, submit };
}

interface FieldsProps {
  readonly draft: Draft;
  readonly failure: ApiFailure | undefined;
  readonly edit: (patch: Partial<Draft>) => void;
}

function NameFields(props: FieldsProps): JSX.Element {
  const { draft, failure, edit } = props;
  return (
    <>
      <div class="rst-admin__pair">
        <Field
          kind="text"
          id="new-user-name"
          label="User name"
          autoComplete="off"
          value={draft.userName}
          error={problemFor(failure, 'userName')}
          announce={false}
          onInput={(userName) => {
            edit({ userName });
          }}
        />
        <Field
          kind="text"
          id="new-display-name"
          label="Display name"
          autoComplete="off"
          value={draft.displayName}
          error={problemFor(failure, 'displayName')}
          announce={false}
          onInput={(displayName) => {
            edit({ displayName });
          }}
        />
      </div>
    </>
  );
}

function AccessFields(props: FieldsProps): JSX.Element {
  const { draft, failure, edit } = props;
  return (
    <>
      <div class="rst-admin__pair">
        <Field
          kind="select"
          id="new-role"
          label="Role"
          value={draft.role}
          options={roleOptions}
          onChange={(role) => {
            edit({ role: role === 'admin' ? 'admin' : 'user' });
          }}
        />
        <Field
          kind="password"
          id="new-password"
          label="Initial password"
          autoComplete="new-password"
          value={draft.password}
          error={problemFor(failure, 'password')}
          announce={false}
          onInput={(password) => {
            edit({ password });
          }}
        />
      </div>
      <Field
        kind="checkbox"
        id="new-must-change"
        label="Must choose a new password at first sign-in"
        help="Clear it for the teacher account: the evaluators sign in with the password from the hand-in form (RF-1107)."
        checked={draft.mustChangePassword}
        onChange={(mustChangePassword) => {
          edit({ mustChangePassword });
        }}
      />
    </>
  );
}

// RF-1102
export function CreateAccountForm(props: {
  readonly onCreated: (account: Account) => void;
}): JSX.Element {
  const { draft, busy, failure, message, edit, submit } = useCreation(props.onCreated);
  const formRef = useRef<HTMLFormElement>(null);
  useRefusalFocus(formRef, failure);
  return (
    <section class="rst-card rst-settings__section" aria-labelledby="create-account">
      <h2 id="create-account" class="rst-settings__heading">
        Create an account
      </h2>
      <form
        ref={formRef}
        class="rst-admin__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {failure === undefined || namesAField(failure, fields) ? null : (
          <ErrorBanner error={failure} />
        )}
        <NameFields draft={draft} failure={failure} edit={edit} />
        <AccessFields draft={draft} failure={failure} edit={edit} />
        <div class="rst-projects__actions">
          <Button type="submit" variant="primary" busy={busy}>
            Create account
          </Button>
        </div>
        <p class="rst-settings__note" role="status">
          {message}
        </p>
        <p class="rst-settings__note">
          Give the password to the person outside Rosetta. It is never shown again.
        </p>
      </form>
    </section>
  );
}
