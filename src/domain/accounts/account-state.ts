// Architecture section 5, AccountState. The users table stores three of the states; `Locked` is
// derived from `locked_until` (data-model.md section 4, RF-1100).

export const STORED_ACCOUNT_STATES = ['Active', 'MustChangePassword', 'Disabled'] as const;

export type StoredAccountState = (typeof STORED_ACCOUNT_STATES)[number];

export type AccountState = StoredAccountState | 'Locked';
