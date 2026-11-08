import { active, ownerOnly } from './access-columns.js';
import type { Context, Probe } from './access-probes.js';

// RF-1105, RF-1009, RF-010, P8-134: the access matrix row of the rename route. Its owner renames the
// matrix project; another user's id answers 404 like an unknown one, as for any project route. The
// rename itself is tried in tests/integration/presentation/web/project-rename.test.ts.

const renamed = (): { readonly name: string } => ({ name: 'Renamed' });

export const renameRows: Readonly<Record<string, readonly Probe[]>> = {
  'PUT /api/projects/:id/name': [
    {
      method: 'PUT',
      url: (context: Context) => `/api/projects/${context.projectId}/name`,
      payload: renamed,
      expected: ownerOnly(200),
    },
    {
      method: 'PUT',
      url: () => '/api/projects/not-a-uuid/name',
      payload: renamed,
      expected: active(401, 404),
    },
  ],
};
