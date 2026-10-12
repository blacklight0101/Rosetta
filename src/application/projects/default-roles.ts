import { z } from 'zod';
import { PROVIDER_KINDS } from './project-settings.js';

// DEC-106, data-model.md section 4 (`server_settings`): the `defaultRoles` server setting, the
// provider and the dated model id the administrator chose for each role of a new project. A role
// left out keeps the template's model. The value is `{}` until the administrator sets it.

const roleChoice = z.strictObject({
  provider: z.enum(PROVIDER_KINDS),
  model: z.string().trim().min(1).max(200),
});

export const defaultRolesSchema = z.strictObject({
  reader: roleChoice.optional(),
  verifier: roleChoice.optional(),
  planner: roleChoice.optional(),
  summariser: roleChoice.optional(),
});

export type DefaultRoles = z.output<typeof defaultRolesSchema>;
