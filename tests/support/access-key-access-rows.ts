import { active } from './access-columns.js';
import type { Probe } from './access-probes.js';

// RF-1105, RF-1009, RF-436, DEC-225: the access matrix rows of the key access route: every active
// user reads which providers they can use a key for, a visitor gets 401.

const url = '/api/account/key-access';

export const keyAccessRows: Readonly<Record<string, readonly Probe[]>> = {
  'GET /api/account/key-access': [{ method: 'GET', url, expected: active(401, 200) }],
  'HEAD /api/account/key-access': [{ method: 'HEAD', url, expected: active(401, 200) }],
};
