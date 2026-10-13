import type { JSX } from 'preact';
import { deleteProject, deleteRun } from '../api/history.js';
import type { HistoryRun, RunHistory } from '../api/history-schemas.js';
import { useApp } from '../app/app-context.js';
import { useRouteParams } from '../app/route-params.js';
import { navigate } from '../app/router.js';
import { EmptyState } from '../components/EmptyState.js';
import { ErrorBanner } from '../components/ErrorBanner.js';
import { bytesText } from '../lib/bytes.js';
import { DeleteProjectSection } from './DeleteProjectSection.js';
import { DeletionNotice } from './DeletionNotice.js';
import { HistoryRuns } from './HistoryRuns.js';
import { ProjectDialog, RunDialog } from './history-dialogs.js';
import { useDeletion } from './use-deletion.js';
import { useHistory } from './use-history.js';

// RF-1008, RF-1012, RF-1105, History artboard: `/projects/:projectId/history`, the runs of a project
// with their source, commit, stage, state, cost and links to the report and zip, and the deletion of
// a run or of the project behind a confirmation that names the folder and the space it frees. Another
// user's project answers 404 like an unknown one, and the page shows that error and no table.

function HistoryView(props: {
  readonly history: RunHistory;
  readonly forget: (runId: string, freedBytes: number) => void;
}): JSX.Element {
  const { client } = useApp();
  const { history } = props;
  const runDeletion = useDeletion<HistoryRun>({
    remove: (run) => deleteRun(client, run.id),
    done: (run, { freedBytes }) => {
      props.forget(run.id, freedBytes);
      return `Run ${run.runId} deleted. ${bytesText(freedBytes)} freed.`;
    },
  });
  const projectDeletion = useDeletion<RunHistory>({
    remove: (target) => deleteProject(client, target.project.id),
    done: () => {
      navigate('/projects');
      return '';
    },
  });
  const error = runDeletion.error ?? projectDeletion.error;
  return (
    <>
      <DeletionNotice text={runDeletion.notice} />
      {error === undefined ? null : <ErrorBanner error={error} />}
      {history.runs.length === 0 ? (
        <EmptyState message="No runs yet. A run shows here as soon as you start one." />
      ) : (
        <HistoryRuns runs={history.runs} onDelete={runDeletion.ask} />
      )}
      <DeleteProjectSection
        history={history}
        onAsk={() => {
          projectDeletion.ask(history);
        }}
      />
      <RunDialog deletion={runDeletion} projectFolder={history.project.folder} />
      <ProjectDialog deletion={projectDeletion} />
    </>
  );
}

// RF-1008
export function HistoryPage(): JSX.Element {
  const { state, forget } = useHistory(useRouteParams()['projectId'] ?? '');
  if (state.status === 'loading') {
    return (
      <p class="rst-loading" role="status">
        Loading the history
      </p>
    );
  }
  const title = <h1 class="rst-page__title">History</h1>;
  if (state.status === 'failed') {
    return (
      <div class="rst-p140-history">
        {title}
        <ErrorBanner error={state.error} />
      </div>
    );
  }
  return (
    <div class="rst-p140-history">
      <div>
        {title}
        <p class="rst-settings__lead">
          <span class="rst-mono">{state.history.project.name}</span>
        </p>
      </div>
      <HistoryView history={state.history} forget={forget} />
    </div>
  );
}
