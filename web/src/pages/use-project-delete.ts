import { useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import { deleteProject, getHistory } from '../api/history.js';
import type { RunHistory } from '../api/history-schemas.js';
import { useApp } from '../app/app-context.js';
import { useDeletion, type Deletion } from './use-deletion.js';

// RF-1012, P8-99: Delete project from a row of the projects list. The confirmation names the folder
// and the space it frees, which the history of the project knows, so `ask` reads the history first and
// opens the dialog with it; the project is removed only after the confirmation, and the list is read
// again afterwards.

export interface ProjectDelete {
  readonly deletion: Deletion<RunHistory>;
  /** The refusal of the history read that precedes the confirmation, if any. */
  readonly lookupError: ApiFailure | undefined;
  readonly ask: (projectId: string) => void;
}

// RF-1012
export function useProjectDelete(onDeleted: () => void): ProjectDelete {
  const { client } = useApp();
  const [lookupError, setLookupError] = useState<ApiFailure | undefined>(undefined);
  const deletion = useDeletion<RunHistory>({
    remove: (target) => deleteProject(client, target.project.id),
    done: () => {
      onDeleted();
      return 'Project deleted.';
    },
  });
  const ask = (projectId: string): void => {
    setLookupError(undefined);
    void getHistory(client, projectId, new AbortController().signal).then((result) => {
      if (result.ok) deletion.ask(result.value);
      else setLookupError(result.error);
    });
  };
  return { deletion, lookupError, ask };
}
