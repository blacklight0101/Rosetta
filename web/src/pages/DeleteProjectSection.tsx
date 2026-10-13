import type { JSX } from 'preact';
import type { RunHistory } from '../api/history-schemas.js';
import { Button } from '../components/Button.js';
import { bytesText } from '../lib/bytes.js';

// RF-1012: the section of the history page that deletes the project, with the folder and the space
// it would free. The button is disabled with the reason while any run is queued or running.

export interface DeleteProjectSectionProps {
  readonly history: RunHistory;
  readonly onAsk: () => void;
}

// RF-1012
export function DeleteProjectSection({ history, onAsk }: DeleteProjectSectionProps): JSX.Element {
  const { project, runs } = history;
  const active = runs.some((run) => run.queueState !== 'Ended');
  return (
    <section class="rst-card rst-p140-project" aria-labelledby="rst-p140-project-title">
      <h2 id="rst-p140-project-title" class="rst-p140-heading">
        Delete project
      </h2>
      <p class="rst-settings__note">
        Removes <span class="rst-mono">{project.name}</span> with all its runs. Its folder{' '}
        <span class="rst-mono">{project.folder}</span> holds {bytesText(project.sizeBytes)}. The
        cost ledger keeps every call, so your totals do not change.
      </p>
      <div>
        <Button
          variant="danger-outline"
          {...(active
            ? { disabledReason: 'A run is in progress. Stop it before deleting the project.' }
            : {})}
          onClick={onAsk}
        >
          Delete project
        </Button>
      </div>
    </section>
  );
}
