import type { JSX } from 'preact';
import { deleteSnapshot } from '../api/history.js';
import type { Snapshot } from '../api/history-schemas.js';
import { useApp } from '../app/app-context.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { bytesText } from '../lib/bytes.js';
import { DeletionNotice } from './DeletionNotice.js';
import { shortCommit, SnapshotsTable } from './SnapshotsTable.js';
import { useDeletion, type Deletion } from './use-deletion.js';
import { useSnapshots } from './use-snapshots.js';

// RF-1012, RF-1102, History artboard: `/admin/snapshots`, the snapshots the server downloaded, with
// their size and last use, for the administrator, who deletes the ones no run in progress uses behind
// a confirmation that names the folder and the space it frees. The runs that used a deleted snapshot
// keep their reports and cards; the next run fetches the files again.

function SnapshotDialog({
  deletion,
}: {
  readonly deletion: Deletion<Snapshot>;
}): JSX.Element | null {
  const { pending, busy, confirm, cancel } = deletion;
  if (pending === undefined) return null;
  return (
    <ConfirmDialog
      title={`Delete snapshot ${pending.repository} ${shortCommit(pending)}?`}
      confirmLabel="Delete snapshot"
      busy={busy}
      onConfirm={confirm}
      onCancel={cancel}
    >
      <p>This removes the downloaded copy of the repository files at this commit.</p>
      <ul class="rst-p140-dialog__list">
        <li>
          Folder <span class="rst-mono">{`sources/${pending.key}`}</span>
        </li>
        <li>
          Frees <strong>{bytesText(pending.sizeBytes)}</strong>
        </li>
        <li>
          Runs that used it keep their reports and cards; the next run fetches the files again
        </li>
      </ul>
      <p class="rst-p140-dialog__warning">This cannot be undone.</p>
    </ConfirmDialog>
  );
}

function Snapshots(props: {
  readonly snapshots: readonly Snapshot[];
  readonly forget: (key: string) => void;
}): JSX.Element {
  const { client } = useApp();
  const deletion = useDeletion<Snapshot>({
    remove: (snapshot) => deleteSnapshot(client, snapshot.key),
    done: (snapshot, { freedBytes }) => {
      props.forget(snapshot.key);
      const name = `${snapshot.repository} ${shortCommit(snapshot)}`;
      return `Snapshot ${name} deleted. ${bytesText(freedBytes)} freed.`;
    },
  });
  return (
    <>
      <DeletionNotice text={deletion.notice} />
      {deletion.error === undefined ? null : <ErrorBanner error={deletion.error} />}
      {props.snapshots.length === 0 ? (
        <EmptyState message="No snapshots are downloaded. The next run downloads one." />
      ) : (
        <SnapshotsTable snapshots={props.snapshots} onDelete={deletion.ask} />
      )}
      <p class="rst-settings__note">
        Deleting never changes the project totals: the cost ledger keeps every call ever paid for.
      </p>
      <SnapshotDialog deletion={deletion} />
    </>
  );
}

// RF-1012
export function AdminSnapshotsPage(): JSX.Element {
  const { state, forget } = useSnapshots();
  if (state.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Loading the snapshots
      </p>
    );
  }
  return (
    <div class="rst-p140-history">
      <h1 class="rst-page__title">Downloaded snapshots</h1>
      {state.status === 'failed' ? (
        <ErrorBanner error={state.error} />
      ) : (
        <Snapshots snapshots={state.snapshots} forget={forget} />
      )}
    </div>
  );
}
