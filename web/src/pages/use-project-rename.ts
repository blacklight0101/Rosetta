import { useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import { renameProject } from '../api/projects.js';
import { useApp } from '../app/app-context.js';

// RF-010, P8-134, DEC-222: Rename from a row of the projects list. `ask` opens the dialog with the
// current name; `save` sends the typed name, and on success closes the dialog and reads the list
// again; a refusal stays in the dialog, next to the field.

interface RenameTarget {
  readonly id: string;
  /** The name when the dialog opened, for its title. */
  readonly name: string;
}

export interface ProjectRename {
  /** The project the dialog is renaming; undefined while no dialog is open. */
  readonly target: RenameTarget | undefined;
  readonly name: string;
  readonly busy: boolean;
  readonly error: ApiFailure | undefined;
  readonly ask: (target: RenameTarget) => void;
  readonly type: (name: string) => void;
  readonly save: () => void;
  readonly cancel: () => void;
}

// RF-010
export function useProjectRename(onRenamed: () => void): ProjectRename {
  const { client } = useApp();
  const [target, setTarget] = useState<RenameTarget | undefined>(undefined);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiFailure | undefined>(undefined);
  const save = (): void => {
    if (target === undefined || busy) return;
    setBusy(true);
    void renameProject(client, target.id, name).then((result) => {
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTarget(undefined);
      onRenamed();
    });
  };
  const ask = (next: RenameTarget): void => {
    setError(undefined);
    setName(next.name);
    setTarget(next);
  };
  const cancel = (): void => {
    setTarget(undefined);
  };
  return { target, name, busy, error, ask, type: setName, save, cancel };
}
