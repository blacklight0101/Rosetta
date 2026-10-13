import type { JSX } from 'preact';
import type { HistoryRun, RunHistory } from '../api/history-schemas.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { bytesText } from '../lib/bytes.js';
import { costLabel, tokensLabel } from '../lib/live-run/format.js';
import type { Deletion } from './use-deletion.js';

// RF-1012, design-system.md section 7: what the confirmation of a deletion says. It names the
// folder, the space it frees, what is kept and that nothing can bring it back.

function RunDeletion(props: {
  readonly projectFolder: string;
  readonly run: HistoryRun;
}): JSX.Element {
  const { run } = props;
  const { costMicros, inputTokens, outputTokens } = run.totals;
  return (
    <>
      <p>This removes the run folder with its cards, report, transcripts and logs.</p>
      <ul class="rst-p140-dialog__list">
        <li>
          Folder <span class="rst-mono">{`${props.projectFolder}/runs/${run.runId}`}</span>
        </li>
        <li>
          Frees <strong>{bytesText(run.sizeBytes)}</strong>
        </li>
        <li>Its snapshot stays</li>
        <li>
          Project totals keep this run&apos;s{' '}
          <strong>{`${tokensLabel(inputTokens + outputTokens)} tokens · ${costLabel(costMicros)}`}</strong>
        </li>
      </ul>
      <p class="rst-p140-dialog__warning">This cannot be undone.</p>
    </>
  );
}

function ProjectDeletion(props: { readonly history: RunHistory }): JSX.Element {
  const { project, runs } = props.history;
  return (
    <>
      <p>This removes the project with all its runs, cards, reports, transcripts and logs.</p>
      <ul class="rst-p140-dialog__list">
        <li>
          Folder <span class="rst-mono">{project.folder}</span>
        </li>
        <li>
          Frees <strong>{bytesText(project.sizeBytes)}</strong>
        </li>
        <li>{`Removes ${String(runs.length)} ${runs.length === 1 ? 'run' : 'runs'}`}</li>
        <li>The cost ledger keeps every call ever paid for, so your totals do not change</li>
      </ul>
      <p class="rst-p140-dialog__warning">This cannot be undone.</p>
    </>
  );
}

// RF-1012
export function RunDialog(props: {
  readonly deletion: Deletion<HistoryRun>;
  readonly projectFolder: string;
}): JSX.Element | null {
  const { pending, busy, confirm, cancel } = props.deletion;
  if (pending === undefined) return null;
  return (
    <ConfirmDialog
      title={`Delete run ${pending.runId}?`}
      confirmLabel="Delete run"
      busy={busy}
      onConfirm={confirm}
      onCancel={cancel}
    >
      <RunDeletion projectFolder={props.projectFolder} run={pending} />
    </ConfirmDialog>
  );
}

// RF-1012
export function ProjectDialog(props: {
  readonly deletion: Deletion<RunHistory>;
}): JSX.Element | null {
  const { pending, busy, confirm, cancel } = props.deletion;
  if (pending === undefined) return null;
  return (
    <ConfirmDialog
      title={`Delete project ${pending.project.name}?`}
      confirmLabel="Delete project"
      busy={busy}
      onConfirm={confirm}
      onCancel={cancel}
    >
      <ProjectDeletion history={pending} />
    </ConfirmDialog>
  );
}
