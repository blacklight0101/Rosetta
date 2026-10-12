import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { Account, Caps, ListedAccount, Money } from '../api/admin-schemas.js';
import { useUser } from '../app/session-context.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { withChange, withNew } from './admin-format.js';
import { AccountsTable } from './AccountsTable.js';
import { CapBanner } from './CapBanner.js';
import { CapsForm } from './CapsForm.js';
import { CreateAccountForm } from './CreateAccountForm.js';
import { ResetPasswordPanel } from './ResetPasswordPanel.js';
import { useAccountActions, type AccountActions } from './use-account-actions.js';
import { useAdminOverview, type OverviewEditor } from './use-admin-overview.js';
import { WorkspacePanel } from './WorkspacePanel.js';

// RF-1102, RF-1105, RF-1106, RF-1107, design-system.md section 14 (administration: users): the
// accounts with their state and cost, the actions on them, the form that creates an account, the
// caps on the server keys with the month meter, and the warning banner from 80% of the monthly
// cap. Only an administrator reaches it; the API answers 403 to anyone else.

type Panel =
  | { readonly kind: 'reset'; readonly account: ListedAccount }
  | { readonly kind: 'workspace'; readonly account: ListedAccount };

function Panels(props: {
  readonly panel: Panel | undefined;
  readonly onReset: (account: Account) => void;
  readonly onClose: () => void;
}): JSX.Element | null {
  const { panel, onReset, onClose } = props;
  if (panel === undefined) return null;
  return panel.kind === 'reset' ? (
    <ResetPasswordPanel
      key={`reset-${panel.account.id}`}
      account={panel.account}
      onReset={onReset}
      onCancel={onClose}
    />
  ) : (
    <WorkspacePanel
      key={`workspace-${panel.account.id}`}
      account={panel.account}
      onClose={onClose}
    />
  );
}

function AccountsSection(props: {
  readonly users: readonly ListedAccount[];
  readonly ownId: string;
  readonly actions: AccountActions;
  readonly onReset: (account: ListedAccount) => void;
  readonly onWorkspace: (account: ListedAccount) => void;
}): JSX.Element {
  const { users, ownId, actions, onReset, onWorkspace } = props;
  return (
    <section class="rst-card rst-settings__section" aria-labelledby="accounts">
      <h2 id="accounts" class="rst-settings__heading">
        Accounts
      </h2>
      {actions.failure === undefined ? null : <ErrorBanner error={actions.failure} />}
      <p class="rst-settings__note" role="status">
        {actions.notice}
      </p>
      <AccountsTable
        users={users}
        ownId={ownId}
        busyId={actions.busyId}
        onChange={(user, change) => {
          void actions.change(user, change);
        }}
        onReset={onReset}
        onWorkspace={onWorkspace}
      />
    </section>
  );
}

function UsersView(props: {
  readonly editor: OverviewEditor;
  readonly users: readonly ListedAccount[];
  readonly caps: Caps;
  readonly spent: readonly Money[];
}): JSX.Element {
  const { editor, users, caps, spent } = props;
  const own = useUser();
  const [panel, setPanel] = useState<Panel | undefined>();
  const actions = useAccountActions((account) => {
    editor.setUsers((current) => withChange(current, account));
  });
  return (
    <>
      <CapBanner spent={spent} caps={caps} onCapsPage />
      <AccountsSection
        users={users}
        ownId={own.id}
        actions={actions}
        onReset={(account) => {
          setPanel({ kind: 'reset', account });
        }}
        onWorkspace={(account) => {
          setPanel({ kind: 'workspace', account });
        }}
      />
      <Panels
        panel={panel}
        onReset={(account) => {
          editor.setUsers((current) => withChange(current, account));
          actions.say(
            `Password reset for ${account.userName}. They must choose a new password at their next sign-in.`,
          );
          setPanel(undefined);
        }}
        onClose={() => {
          setPanel(undefined);
        }}
      />
      <div class="rst-admin__columns">
        <CreateAccountForm
          onCreated={(account) => {
            editor.setUsers((current) => withNew(current, account));
          }}
        />
        <CapsForm caps={caps} spent={spent} onSaved={editor.setCaps} />
      </div>
    </>
  );
}

// RF-1102
export function AdminUsersPage(): JSX.Element {
  const editor = useAdminOverview();
  const { overview } = editor;
  return (
    <div class="rst-settings rst-admin">
      <div>
        <h1 class="rst-page__title">Users and caps</h1>
        <p class="rst-settings__lead">
          There is no sign-up: every account starts here. Opening someone&apos;s workspace is
          recorded in the audit.
        </p>
      </div>
      {overview.status === 'loading' ? (
        <p class="rst-loading" role="status">
          Loading the accounts
        </p>
      ) : null}
      {overview.status === 'failed' ? <ErrorBanner error={overview.error} /> : null}
      {overview.status === 'ready' ? (
        <UsersView
          editor={editor}
          users={overview.users}
          caps={overview.caps}
          spent={overview.serverSpent}
        />
      ) : null}
    </div>
  );
}
