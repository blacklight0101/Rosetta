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
  readonly busy: boolean;
  readonly failure: ApiFailure | undefined;
  readonly rules: readonly RuleResult[];
  readonly setCurrent: (value: string) => void;
  readonly setNext: (value: string) => void;
  readonly setRepeat: (value: string) => void;
  readonly submit: () => Promise<void>;
}

// RF-1103
export function usePasswordChange(userName: string): PasswordChange {
  const { client, assign } = useApp();
  const [current, setCurrent] = useState('');
  const [next, setNextValue] = useState('');
  const [repeat, setRepeatValue] = useState('');
  const [mismatch, setMismatch] = useState(false);
  const [refusedAsCommon, setRefusedAsCommon] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | undefined>();

  const submit = async (): Promise<void> => {
    setFailure(undefined);
    if (repeat !== next) {
      setMismatch(true);
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
    setBusy(false);
  };

  return {
    current,
    next,
    repeat,
    mismatch,
    busy,
    failure,
    rules: evaluateRules({ password: next, userName, refusedAsCommon: refusedAsCommon === next }),
    setCurrent,
    setNext: (value) => {
      setNextValue(value);
      setMismatch(false);
    },
    setRepeat: (value) => {
      setRepeatValue(value);
      setMismatch(false);
    },
    submit,
  };
}
