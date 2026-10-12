import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { resetPassword } from '../api/admin.js';
import type { Account } from '../api/admin-schemas.js';
import type { ApiFailure } from '../api/client.js';
import { namesAField, problemFor } from '../api/problems.js';
import { useApp } from '../app/app-context.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { useRefusalFocus } from '../lib/use-refusal-focus.js';

// RF-1102, RF-1101: reset the password of an account. Every session of the account ends at once and
// the account must choose another password at its next sign-in. The new password is typed here,
// sent once and cleared; the page never shows it again.

export interface ResetPasswordPanelProps {
  readonly account: { readonly id: string; readonly userName: string };
  readonly onReset: (account: Account) => void;
  readonly onCancel: () => void;
}

interface Reset {
  readonly password: string;
  readonly busy: boolean;
  readonly failure: ApiFailure | undefined;
  readonly setPassword: (password: string) => void;
  readonly submit: () => Promise<void>;
}

function useReset(props: ResetPasswordPanelProps): Reset {
  const { account, onReset } = props;
  const { client } = useApp();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | undefined>();

  const submit = async (): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    const result = await resetPassword(client, account.id, password);
    setBusy(false);
    if (result.ok) {
      setPassword('');
      onReset(result.value);
      return;
    }
    setFailure(result.error);
  };
  return { password, busy, failure, setPassword, submit };
}

// RF-1102
export function ResetPasswordPanel(props: ResetPasswordPanelProps): JSX.Element {
  const { account, onCancel } = props;
  const { password, busy, failure, setPassword, submit } = useReset(props);
  const formRef = useRef<HTMLFormElement>(null);
  useRefusalFocus(formRef, failure);
  return (
    <section
      class="rst-card rst-settings__section"
      aria-labelledby="reset-password-title"
      data-testid="reset-password-panel"
    >
      <h2 id="reset-password-title" class="rst-settings__heading">
        {`Reset password for ${account.userName}`}
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
        {failure === undefined || namesAField(failure, ['password']) ? null : (
          <ErrorBanner error={failure} />
        )}
        <Field
          kind="password"
          id="reset-new-password"
          label="New password"
          autoComplete="new-password"
          help="Their sessions end at once and they must choose another password at their next sign-in."
          value={password}
          error={problemFor(failure, 'password')}
          announce={false}
          onInput={setPassword}
        />
        <div class="rst-projects__actions">
          <Button type="submit" variant="primary" busy={busy}>
            Reset password
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </div>
      </form>
    </section>
  );
}
