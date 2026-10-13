import type { JSX } from 'preact';
import type { Snapshot } from '../api/history-schemas.js';
import { Button } from '../components/Button.js';
import { bytesText } from '../lib/bytes.js';
import { tokensLabel } from '../lib/live-run/format.js';
import { secondsText } from './admin-format.js';
import { ScrollRegion } from './ScrollRegion.js';

// RF-1012, History artboard: the downloaded snapshots with their commit, download time, files, size,
// the runs that use them and their last use. Delete is disabled with the reason while a run in
// progress uses the snapshot.

export interface SnapshotsTableProps {
  readonly snapshots: readonly Snapshot[];
  readonly onDelete: (snapshot: Snapshot) => void;
}

const minutes = (instant: string): string =>
  secondsText(instant).slice(0, 'YYYY-MM-DD HH:MM'.length);

export const shortCommit = (snapshot: Snapshot): string => snapshot.commitSha.slice(0, 7);

function UsedBy({ snapshot }: { readonly snapshot: Snapshot }): JSX.Element {
  const { runs, activeRuns, lastUsedAt } = snapshot;
  if (runs === 0) return <>unused</>;
  const plural = runs === 1 ? 'run' : 'runs';
  const running = activeRuns === 0 ? '' : `, ${String(activeRuns)} running`;
  return (
    <>
      {`${String(runs)} ${plural}${running}`}
      {lastUsedAt === null ? null : (
        <div class="rst-table__sub">{`last used ${minutes(lastUsedAt)}`}</div>
      )}
    </>
  );
}

function DeleteButton(props: {
  readonly snapshot: Snapshot;
  readonly onDelete: (snapshot: Snapshot) => void;
}): JSX.Element {
  const { snapshot } = props;
  const name = `snapshot ${snapshot.repository} ${shortCommit(snapshot)}`;
  if (snapshot.activeRuns > 0) {
    return (
      <Button
        variant="danger-outline"
        ariaLabel={`Delete (in use): ${name}`}
        disabledReason="In use by a running run"
      >
        Delete (in use)
      </Button>
    );
  }
  return (
    <Button
      variant="danger-outline"
      ariaLabel={`Delete: ${name}`}
      onClick={() => {
        props.onDelete(snapshot);
      }}
    >
      Delete
    </Button>
  );
}

function Row(props: {
  readonly snapshot: Snapshot;
  readonly onDelete: (snapshot: Snapshot) => void;
}): JSX.Element {
  const { snapshot } = props;
  return (
    <tr>
      <td class="rst-mono">{snapshot.repository}</td>
      <td class="rst-mono">{shortCommit(snapshot)}</td>
      <td>{minutes(snapshot.downloadedAt)}</td>
      <td class="rst-table__num">{tokensLabel(snapshot.fileCount)}</td>
      <td class="rst-table__num">{bytesText(snapshot.sizeBytes)}</td>
      <td>
        <UsedBy snapshot={snapshot} />
      </td>
      <td>
        <DeleteButton snapshot={snapshot} onDelete={props.onDelete} />
      </td>
    </tr>
  );
}

// RF-1012
export function SnapshotsTable({ snapshots, onDelete }: SnapshotsTableProps): JSX.Element {
  return (
    <ScrollRegion label="Snapshots table">
      <table class="rst-table" aria-label="Downloaded snapshots">
        <thead>
          <tr>
            <th scope="col">Repository</th>
            <th scope="col">Commit</th>
            <th scope="col">Downloaded (UTC)</th>
            <th scope="col" class="rst-table__num">
              Files
            </th>
            <th scope="col" class="rst-table__num">
              Size
            </th>
            <th scope="col">Used by</th>
            <th scope="col">
              <span class="rst-visually-hidden">Delete</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {snapshots.map((snapshot) => (
            <Row key={snapshot.key} snapshot={snapshot} onDelete={onDelete} />
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}
