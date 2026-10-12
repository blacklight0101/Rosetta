import { useState } from 'preact/hooks';
import { changePassword } from '../api/account.js';
import type { ApiFailure } from '../api/client.js';
import { problemFor } from '../api/problems.js';
import { useApp } from '../app/app-context.js';
import { evaluateRules, type RuleResult } from '../lib/password-rules.js';

// RF-1103: the state of the change-password form. The checklist follows the new password while it
// is typed; the server judges the rules and the current password, and a refusal that names the
// common-passwords list marks that one rule for the password it refused.

const projectsPath = '/projects';
const tooCommon = 'RST-2203';

export interface PasswordChange {
  readonly current: string;
  readonly next: string;
  readonly repeat: string;
  readonly mismatch: boolean;
  /** Counts refusals (a repeat that differs or an answer of the server), to move focus on each. */
  readonly refusals: number;
  readonly busy: boolean;
  readonly failure: ApiFailure | undefined;
  readonly rules: readonly RuleResult[];
  readonly setCurrent: (value: string) => void;
  readonly setNext: (value: string) => void;
  readonly setRepeat: (value: string) => void;
  readonly submit: () => Promise<void>;
}

/** A setter that also withdraws the "do not match" message, because the person is typing again. */
function clearing(
  set: (value: string) => void,
  setMismatch: (mismatch: boolean) => void,
): (value: string) => void {
  return (value) => {
    set(value);
    setMismatch(false);
  };
}

// RF-1103
export function usePasswordChange(userName: string): PasswordChange {
  const { client, assign } = useApp();
  const [current, setCurrent] = useState('');
  const [next, setNextValue] = useState('');
  const [repeat, setRepeatValue] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [refusedAsCommon, setRefusedAsCommon] = useState<string | undefined>();
  const [refusals, setRefusals] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | undefined>();

  const submit = async (): Promise<void> => {
    setFailure(undefined);
    if (repeat !== next) {
      setMismatch(true);
      setRefusals((count) => count + 1);
      return;
    }
    setBusy(true);
    const result = await changePassword(client, { currentPassword: current, newPassword: next });
    if (result.ok) {
      assign(projectsPath);
      return;
    }
    if (problemFor(result.error, 'newPassword')?.code === tooCommon) setRefusedAsCommon(next);
    setFailure(result.error);
    setRefusals((count) => count + 1);
    setBusy(false);
  };

  return {
    current,
    next,
    repeat,
    mismatch,
    refusals,
    busy,
    failure,
    rules: evaluateRules({ password: next, userName, refusedAsCommon: refusedAsCommon === next }),
    setCurrent,
    setNext: clearing(setNextValue, setMismatch),
    setRepeat: clearing(setRepeatValue, setMismatch),
    submit,
  };
}
