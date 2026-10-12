import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import { namesAField, problemFor } from '../api/problems.js';
import { useUser } from '../app/session-context.js';
import { AuthLayout } from '../components/AuthLayout.js';
import { Button } from '../components/Button.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { Field } from '../components/Field.js';
import { RuleChecklist } from '../components/RuleChecklist.js';
import { SignOutButton } from '../components/SignOutButton.js';
import { useRefusalFocus } from '../lib/use-refusal-focus.js';
import { usePasswordChange, type PasswordChange } from './use-password-change.js';

// RF-1103, RF-1102, design-system.md section 14: forced at the first sign-in (the account is in
// MustChangePassword) or opened from the settings. The rules are shown before typing and follow
// the typing; the server judges them, and a refusal shows next to its field.

interface Wording {
  readonly heading: string;
  readonly intro: string;
  readonly currentLabel: string;
  readonly submit: string;
}

const firstSignIn: Wording = {
  heading: 'Choose your password',
  intro:
    'The administrator set a temporary password. Pick your own before you continue; only you will know it.',
  currentLabel: 'Temporary password',
  submit: 'Save and continue',
};

const fromSettings: Wording = {
  heading: 'Change your password',
  intro: 'Enter your current password, then the new one.',
  currentLabel: 'Current password',
  submit: 'Change password',
};

const rulesId = 'change-password-rules';

function PasswordFields(props: {
  readonly form: PasswordChange;
  readonly currentLabel: string;
}): JSX.Element {
  const { form, currentLabel } = props;
  return (
    <>
      <Field
        kind="password"
        id="change-password-current"
        label={currentLabel}
        autoComplete="current-password"
        value={form.current}
        error={problemFor(form.failure, 'currentPassword')}
        onInput={form.setCurrent}
      />
      <Field
        kind="password"
        id="change-password-new"
        label="New password"
        autoComplete="new-password"
        value={form.next}
        error={problemFor(form.failure, 'newPassword')}
        describedBy={rulesId}
        onInput={form.setNext}
      />
      <RuleChecklist rules={form.rules} id={rulesId} />
      <Field
        kind="password"
        id="change-password-repeat"
        label="Repeat the new password"
        autoComplete="new-password"
        value={form.repeat}
        error={form.mismatch ? { message: 'The two passwords do not match.' } : undefined}
        onInput={form.setRepeat}
      />
    </>
  );
}

// RF-1103
export function ChangePasswordPage(): JSX.Element {
  const user = useUser();
  const form = usePasswordChange(user.userName);
  const wording = user.state === 'MustChangePassword' ? firstSignIn : fromSettings;
  const { failure } = form;
  const formRef = useRef<HTMLFormElement>(null);
  useRefusalFocus(formRef, form.refusals);
  return (
    <AuthLayout
      end={
        <>
          <span class="rst-auth__user">
            Signed in as <strong>{user.userName}</strong>
          </span>
          <SignOutButton />
        </>
      }
    >
      <form
        ref={formRef}
        class="rst-auth__card rst-auth__card--wide"
        aria-labelledby="change-password-title"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void form.submit();
        }}
      >
        <div class="rst-auth__intro">
          <h1 id="change-password-title" class="rst-auth__title">
            {wording.heading}
          </h1>
          <p class="rst-auth__lead">{wording.intro}</p>
        </div>
        {failure === undefined ||
        namesAField(failure, ['currentPassword', 'newPassword']) ? null : (
          <ErrorBanner error={failure} />
        )}
        <PasswordFields form={form} currentLabel={wording.currentLabel} />
        <Button type="submit" variant="primary" busy={form.busy}>
          {wording.submit}
        </Button>
        <p class="rst-auth__note">Changing your password signs you out everywhere else.</p>
      </form>
    </AuthLayout>
  );
}
