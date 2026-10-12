import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { signIn } from '../api/account.js';
import type { ApiFailure } from '../api/client.js';
import { useApp } from '../app/app-context.js';
import { AuthLayout } from '../components/AuthLayout.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { Link } from '../components/Link.js';

// RF-1100, design-system.md section 14: user name, password and one generic error. A locked
// account gets the same answer as a wrong password from the server, so this page never shows
// anything that reveals whether an account exists. There is no sign-up here (RF-1102).

const projectsPath = '/projects';
const changePasswordPath = '/account/password';

interface SignInForm {
  readonly userName: string;
  readonly password: string;
  readonly busy: boolean;
  readonly failure: ApiFailure | undefined;
  readonly setUserName: (value: string) => void;
  readonly setPassword: (value: string) => void;
  readonly submit: () => Promise<void>;
}

function useSignIn(): SignInForm {
  const { client, assign } = useApp();
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | undefined>();

  const submit = async (): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    const result = await signIn(client, { userName, password });
    if (result.ok) {
      // The server sends an account that must change its password there anyway; going straight
      // saves the redirect.
      assign(result.value.user.state === 'MustChangePassword' ? changePasswordPath : projectsPath);
      return;
    }
    setPassword('');
    setFailure(result.error);
    setBusy(false);
  };
  // RNF-010: after a refusal the password field, now empty, takes focus; the banner is announced.
  useEffect(() => {
    if (failure !== undefined) document.getElementById('sign-in-password')?.focus();
  }, [failure]);
  return { userName, password, busy, failure, setUserName, setPassword, submit };
}

// RF-1100
export function SignInPage(): JSX.Element {
  const form = useSignIn();
  return (
    <AuthLayout end={<Link href="/">About Rosetta</Link>}>
      <form
        class="rst-auth__card"
        aria-labelledby="sign-in-title"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.submit();
        }}
      >
        <div class="rst-auth__intro">
          <h1 id="sign-in-title" class="rst-auth__title">
            Sign in
          </h1>
          <p class="rst-auth__lead">Use the account the administrator created for you.</p>
        </div>
        {form.failure === undefined ? null : <ErrorBanner error={form.failure} codeAfter />}
        <Field
          kind="text"
          id="sign-in-user"
          label="User name"
          autoComplete="username"
          value={form.userName}
          onInput={form.setUserName}
        />
        <Field
          kind="password"
          id="sign-in-password"
          label="Password"
          autoComplete="current-password"
          value={form.password}
          onInput={form.setPassword}
        />
        <Button type="submit" variant="primary" busy={form.busy}>
          Sign in
        </Button>
        <p class="rst-auth__note">
          No account? Rosetta is invite-only. Ask the administrator, or use Request access on the
          home page.
        </p>
      </form>
    </AuthLayout>
  );
}
