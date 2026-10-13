import type { JSX } from 'preact';
import type { ListedAccount } from '../api/admin-schemas.js';
import { Button } from '../components/Button.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { costText, signInText } from './admin-format.js';
import { ScrollRegion } from './ScrollRegion.js';

// RF-1102, RF-1104, RF-1105, design-system.md section 14 (administration: users): every account
// with its role, state, last sign-in, projects, month-to-date cost and whether it may use the
// server's keys, and the actions on one line. The own account offers none: an administrator never
// disables or resets themselves (RST-2213).

export interface AccountsTableProps {
  readonly users: readonly ListedAccount[];
  readonly ownId: string;
  readonly busyId: string | undefined;
  readonly onChange: (user: ListedAccount, change: 'disable' | 'enable') => void;
  readonly onReset: (user: ListedAccount) => void;
  readonly onWorkspace: (user: ListedAccount) => void;
}

type RowProps = Omit<AccountsTableProps, 'users'> & { readonly user: ListedAccount };

function RowActions(props: RowProps): JSX.Element | null {
  const { user, busyId, onChange, onReset, onWorkspace } = props;
  if (user.id === props.ownId) return null;
  const change = user.state === 'Disabled' ? 'enable' : 'disable';
  const word = change === 'enable' ? 'Enable' : 'Disable';
  return (
    <div class="rst-admin__actions">
      <Button
        ariaLabel={`Open workspace of ${user.userName}`}
        onClick={() => {
          onWorkspace(user);
        }}
      >
        Open workspace
      </Button>
      <Button
        ariaLabel={`${word} ${user.userName}`}
        busy={busyId === user.id}
        onClick={() => {
          onChange(user, change);
        }}
      >
        {word}
      </Button>
      <Button
        ariaLabel={`Reset password for ${user.userName}`}
        onClick={() => {
          onReset(user);
        }}
      >
        Reset password
      </Button>
    </div>
  );
}

function AccountRow(props: RowProps): JSX.Element {
  const { user } = props;
  return (
    <tr>
      <td>
        <strong>{user.displayName}</strong>
        <div class="rst-mono rst-table__sub">{user.userName}</div>
      </td>
      <td>
        <StatusBadge list="Role" value={user.role} />
      </td>
      <td>
        <StatusBadge list="AccountState" value={user.state} />
      </td>
      <td>{signInText(user.lastSignInAt)}</td>
      <td class="rst-table__num">{user.projects}</td>
      <td class="rst-table__num">{costText(user.monthToDate)}</td>
      <td>{user.serverKeysAllowed ? 'allowed' : 'not allowed'}</td>
      <td>
        <RowActions {...props} />
      </td>
    </tr>
  );
}

// RF-1102
export function AccountsTable({ users, ...rest }: AccountsTableProps): JSX.Element {
  return (
    <ScrollRegion label="Accounts table">
      <table class="rst-table">
        <caption class="rst-visually-hidden">Accounts</caption>
        <thead>
          <tr>
            <th scope="col">User</th>
            <th scope="col">Role</th>
            <th scope="col">State</th>
            <th scope="col">Last sign-in (UTC)</th>
            <th scope="col" class="rst-table__num">
              Projects
            </th>
            <th scope="col" class="rst-table__num">
              Month to date
            </th>
            <th scope="col">Server keys</th>
            <th scope="col">
              <span class="rst-visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <AccountRow key={user.id} user={user} {...rest} />
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}
