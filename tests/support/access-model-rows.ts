import { active } from './access-columns.js';
import type { Probe } from './access-probes.js';

// RF-1105, RF-1009, RF-405: the access matrix rows of the models route (DEC-156): every signed-in
// user reads the models a role can be set to, a visitor gets 401.

export const modelRows: Readonly<Record<string, readonly Probe[]>> = {
  'GET /api/models/:provider': [
    { method: 'GET', url: () => '/api/models/anthropic', expected: active(401, 200) },
  ],
  'HEAD /api/models/:provider': [
    { method: 'HEAD', url: () => '/api/models/anthropic', expected: active(401, 200) },
  ],
};
