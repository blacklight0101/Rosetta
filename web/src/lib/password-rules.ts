// RF-1103: the rule checklist of the change-password page. Length and user name are judged while
// the person types, with the server's own counting (code points) and comparison (lower case). The
// list of common passwords stays on the server: that rule stays open until the server refuses the
// password, and only that password.

export type RuleId = 'length' | 'common' | 'user-name';
export type RuleState = 'pending' | 'pass' | 'fail';

export interface RuleResult {
  readonly id: RuleId;
  readonly label: string;
  readonly state: RuleState;
}

export interface RuleInput {
  readonly password: string;
  readonly userName: string;
  /** The server refused this very password as a common one. */
  readonly refusedAsCommon: boolean;
}

const MIN_LENGTH = 12;
const lengthLabel = `At least ${String(MIN_LENGTH)} characters`;

function lengthRule(password: string): RuleResult {
  const length = Array.from(password).length;
  if (length === 0) return { id: 'length', label: lengthLabel, state: 'pending' };
  if (length >= MIN_LENGTH) return { id: 'length', label: lengthLabel, state: 'pass' };
  return { id: 'length', label: `${lengthLabel} (${String(length)} so far)`, state: 'fail' };
}

function userNameRule({ password, userName }: RuleInput): RuleResult {
  const label = 'Does not contain your user name';
  if (password === '') return { id: 'user-name', label, state: 'pending' };
  const contains = password.toLowerCase().includes(userName.toLowerCase());
  return { id: 'user-name', label, state: contains ? 'fail' : 'pass' };
}

// RF-1103
export function evaluateRules(input: RuleInput): readonly RuleResult[] {
  return [
    lengthRule(input.password),
    {
      id: 'common',
      label: 'Not on the list of common passwords',
      state: input.refusedAsCommon ? 'fail' : 'pending',
    },
    userNameRule(input),
  ];
}
