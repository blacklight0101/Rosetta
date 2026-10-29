import { active, ownerOnly } from './access-columns.js';
import type { Context, Probe } from './access-probes.js';

// RF-1105, RF-1009, RF-128: the access matrix row of the upload route. The matrix project is a GitHub
// one, so its owner is told 409 (an upload takes a project of kind upload); everyone else is refused
// as for any project route. The upload itself is tried in tests/integration/presentation/web.

const zipBody = (): Buffer => Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const zipHeaders = { 'content-type': 'application/zip' };

export const uploadRows: Readonly<Record<string, readonly Probe[]>> = {
  'GET /api/projects/:id/source/progress': [
    {
      method: 'GET',
      url: (context: Context) => `/api/projects/${context.projectId}/source/progress`,
      expected: ownerOnly(404),
    },
  ],
  'HEAD /api/projects/:id/source/progress': [
    {
      method: 'HEAD',
      url: (context: Context) => `/api/projects/${context.projectId}/source/progress`,
      expected: ownerOnly(404),
    },
  ],
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

const batches = (context: Context): string => `/api/projects/${context.projectId}/source/batches`;
const aBatch = (context: Context): string =>
  `${batches(context)}/00000000-0000-4000-b000-000000000001`;
const octetHeaders = { 'content-type': 'application/octet-stream', 'x-file-name': 'Pricing.xlsx' };

/**
 * RF-1105, RF-1009, RF-150: the batch routes of an Excel workbooks project. The matrix project is a
 * GitHub one, so its owner is told 409 when opening a batch and 404 for a batch that does not exist;
 * everyone else is refused as for any project route. The batches themselves are tried in
 * tests/integration/presentation/web.
 */
export const workbookRows: Readonly<Record<string, readonly Probe[]>> = {
  'POST /api/projects/:id/source/batches': [
    { method: 'POST', url: batches, expected: ownerOnly(409) },
    {
      method: 'POST',
      url: () => '/api/projects/not-a-uuid/source/batches',
      expected: active(401, 404),
    },
  ],
  'PUT /api/projects/:id/source/batches/:batchId/files': [
    {
      method: 'PUT',
      url: (context: Context) => `${aBatch(context)}/files`,
      payload: zipBody,
      headers: octetHeaders,
      expected: ownerOnly(404),
    },
  ],
  'POST /api/projects/:id/source/batches/:batchId/finish': [
    {
      method: 'POST',
      url: (context: Context) => `${aBatch(context)}/finish`,
      expected: ownerOnly(404),
    },
  ],
  'GET /api/projects/:id/source/batches/current': [
    {
      method: 'GET',
      url: (context: Context) => `${batches(context)}/current`,
      expected: ownerOnly(404),
    },
  ],
  'HEAD /api/projects/:id/source/batches/current': [
    {
      method: 'HEAD',
      url: (context: Context) => `${batches(context)}/current`,
      expected: ownerOnly(404),
    },
  ],
  'HEAD /api/projects/:id/source/batches/:batchId': [
    { method: 'HEAD', url: aBatch, expected: ownerOnly(404) },
  ],
  'GET /api/projects/:id/source/batches/:batchId': [
    { method: 'GET', url: aBatch, expected: ownerOnly(404) },
  ],
  'DELETE /api/projects/:id/source/batches/:batchId': [
    { method: 'DELETE', url: aBatch, expected: ownerOnly(404) },
  ],
};
