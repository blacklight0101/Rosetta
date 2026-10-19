import { useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { Project } from '../api/project-schemas.js';
import { getProject, saveProjectSettings } from '../api/projects.js';
import { useApp } from '../app/app-context.js';
import { settingsOnOllama } from './local-roles.js';

// RF-132: the button of the private-code notice. It reads the project as it is now, so what another
// session changed stays, saves the settings with every role on Ollama, and tells the page the
// project it saved. It asks nothing more: the notices follow the roles the new estimate shows.

export interface SwitchToOllama {
  readonly switching: boolean;
  readonly error: ApiFailure | undefined;
  readonly run: () => void;
}

// RF-132
export function useSwitchToOllama(
  projectId: string,
  onSaved: (project: Project) => void,
): SwitchToOllama {
  const { client } = useApp();
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState<ApiFailure | undefined>();
  const switchAll = async (): Promise<void> => {
    setSwitching(true);
    setError(undefined);
    const read = await getProject(client, projectId, new AbortController().signal);
    const saved = read.ok
      ? await saveProjectSettings(client, read.value, settingsOnOllama(read.value.settings))
      : read;
    setSwitching(false);
    if (saved.ok) onSaved(saved.value);
    else setError(saved.error);
  };
  return { switching, error, run: () => void switchAll() };
}
