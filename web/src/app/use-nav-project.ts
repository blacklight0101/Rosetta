import { useEffect, useState } from 'preact/hooks';
import { getProject } from '../api/projects.js';
import type { ApiClient } from '../api/client.js';
import type { ProjectNav } from './navigation.js';
import { forgetProject, rememberedProject, rememberProject } from './remembered-project.js';

// P1-175: the project the side navigation links to. Inside a project it is the project of the
// address (its links show at once; the name follows). Elsewhere it is the last project opened in
// this browser session, and its links appear only after the server has confirmed the user can open
// it: a project that was deleted, or belongs to another user, answers 404 and is forgotten.

const notFound = 404;

interface Checked {
  readonly id: string;
  readonly name: string;
}

// RF-1105
export function useNavProject(client: ApiClient, routeProjectId: string | undefined): ProjectNav {
  const id = routeProjectId ?? rememberedProject();
  const [checked, setChecked] = useState<Checked | undefined>();
  const [refused, setRefused] = useState<string | undefined>();
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
  }, [client, id]);
  if (id === undefined || refused === id) return { status: 'none' };
  if (checked?.id === id) return { status: 'open', id, name: checked.name };
  return routeProjectId === undefined ? { status: 'pending' } : { status: 'open', id };
}
