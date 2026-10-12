import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { signOut } from '../api/account.js';
import type { ApiFailure } from '../api/client.js';
import { useApp } from '../app/app-context.js';
import { Button } from './Button.js';

// RF-1101: Sign out in the header. The session is deleted on the server first; only when that
// worked does the page leave for the sign-in page. A failure stays on the page with its code.

const signInPath = '/sign-in';

// RF-1101
export function SignOutButton(): JSX.Element {
  const { client, assign } = useApp();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | undefined>();

  const leave = async (): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    const result = await signOut(client);
    if (result.ok) {
      assign(signInPath);
      return;
    }
    setFailure(result.error);
    setBusy(false);
  };

  return (
    <>
      <Button
        variant="ghost"
        busy={busy}
        onClick={() => {
          void leave();
        }}
      >
        Sign out
      </Button>
      {failure === undefined ? null : (
        <span class="rst-header__error" role="alert">
          <span class="rst-mono">{failure.code}</span> {failure.message}
        </span>
      )}
    </>
  );
}
