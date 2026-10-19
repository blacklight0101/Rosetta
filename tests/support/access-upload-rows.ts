import { active, ownerOnly } from './access-columns.js';
import type { Context, Probe } from './access-probes.js';

// RF-1105, RF-1009, RF-128: the access matrix row of the upload route. The matrix project is a GitHub
// one, so its owner is told 409 (an upload takes a project of kind upload); everyone else is refused
// as for any project route. The upload itself is tried in tests/integration/presentation/web.

const zipBody = (): Buffer => Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const zipHeaders = { 'content-type': 'application/zip' };

export const uploadRows: Readonly<Record<string, readonly Probe[]>> = {
  'PUT /api/projects/:id/source': [
    {
      method: 'PUT',
      url: (context: Context) => `/api/projects/${context.projectId}/source`,
      payload: zipBody,
      headers: zipHeaders,
      expected: ownerOnly(409),
    },
    {
      method: 'PUT',
      url: () => '/api/projects/not-a-uuid/source',
      payload: zipBody,
      headers: zipHeaders,
      expected: active(401, 404),
    },
  ],
};
