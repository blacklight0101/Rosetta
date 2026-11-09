import { useEffect, useState } from 'preact/hooks';
import { getProject } from '../api/projects.js';
import type { ApiClient } from '../api/client.js';
import type { ProjectNav } from './navigation.js';
import { forgetProject, rememberedProject, rememberProject } from './remembered-project.js';

// P1-175: the project the side navigation links to. Inside a project it is the project of the
// address (its links show at once; the name follows). Elsewhere it is the last project opened in
// this browser session, and its links appear only after the server has confirmed the user can open
// it: a project that was deleted, or belongs to another user, answers 404 and is forgotten.
// P8-134: inside a project the project is read again on every page, so a name changed on the
// projects list shows once the project is opened. Pages outside a project read the kept project once.

const notFound = 404;

interface Checked {
  readonly id: string;
  readonly name: string;
}

// RF-1105
function useNavProject(
  client: ApiClient,
  routeProjectId: string | undefined,
  path: string,
): ProjectNav {
  const id = routeProjectId ?? rememberedProject();
  const [checked, setChecked] = useState<Checked | undefined>();
  const [refused, setRefused] = useState<string | undefined>();
  const page = routeProjectId === undefined ? undefined : path;
  useEffect(() => {
    if (id === undefined) return undefined;
    const abort = new AbortController();
    void getProject(client, id, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      if (result.ok) {
        rememberProject(id);
        setChecked({ id, name: result.value.name });
        setRefused(undefined);
        return;
      }
      if (result.error.status === notFound) forgetProject();
      setRefused(id);
    });
    return () => {
      abort.abort();
    };
  }, [client, id, page]);
  if (id === undefined || refused === id) return { status: 'none' };
  if (checked?.id === id) return { status: 'open', id, name: checked.name };
  return routeProjectId === undefined ? { status: 'pending' } : { status: 'open', id };
}

/**
 * P8-27: the project of the side navigation for a page of the shell: the project of the address, or
 * the one a run page announces (a run's address names no project), and the function to announce it.
 */
export function useShellProject(
  client: ApiClient,
  routeProjectId: string | undefined,
  path: string,
): { readonly project: ProjectNav; readonly announce: (id: string | undefined) => void } {
  const [announced, announce] = useState<string | undefined>();
  return { project: useNavProject(client, routeProjectId ?? announced, path), announce };
}
