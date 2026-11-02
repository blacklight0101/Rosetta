import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { useRouteParams } from '../app/route-params.js';
import { replace } from '../app/router.js';

// RF-1022, DEC-204: the old start-page address (`/projects/:projectId/start`) leads to the project
// page. The old address is replaced in the history, so Back does not return to it.

export function RedirectToProject(): JSX.Element {
  const projectId = useRouteParams()['projectId'] ?? '';
  useEffect(() => {
    replace(`/projects/${encodeURIComponent(projectId)}`);
  }, [projectId]);
  return (
    <p class="rst-loading" role="status">
      Opening the project
    </p>
  );
}
