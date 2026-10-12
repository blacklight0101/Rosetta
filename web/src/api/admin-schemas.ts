import { z } from 'zod';
import { projectSchema } from './project-schemas.js';
import { sessionSchema } from './schemas.js';

// RF-1102, RF-1105, RF-1106, RF-1109, DEC-106: the wire shapes of the administration API. Amounts
// are decimal strings of micro-units, so none is rounded on the way (data-model.md section 1).

const { role, state } = sessionSchema.shape.user.shape;
const micros = z.string().regex(/^\d+$/u);

const money = z.object({ currency: z.string(), costMicros: micros });

export type Money = z.output<typeof money>;

/** An account as every change answers it: never a hash or a lockout counter. */
export const accountSchema = z.object({
  id: z.string(),
  userName: z.string(),
  displayName: z.string(),
  role,
  state,
  createdAt: z.string(),
  lastSignInAt: z.string().nullable(),
});

export type Account = z.output<typeof accountSchema>;

/** An account of `GET /api/admin/users`, with its projects and its month-to-date cost. */
const listedAccountSchema = accountSchema.extend({
  projects: z.number().int(),
  monthToDate: z.array(money),
});

export type ListedAccount = z.output<typeof listedAccountSchema>;

export const userListSchema = z.object({ users: z.array(listedAccountSchema) });

export const userAnswerSchema = z.object({ user: accountSchema });

const capsSchema = z.object({
  runMicros: micros,
  userDayMicros: micros,
  serverMonthMicros: micros,
});

export type Caps = z.output<typeof capsSchema>;

export const capsAnswerSchema = z.object({ caps: capsSchema });

const auditEventSchema = z.object({
  id: z.string(),
  at: z.string(),
  actorUserId: z.string().nullable(),
  action: z.string(),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  ip: z.string(),
  outcome: z.enum(['ok', 'refused', 'failed']),
});

export type AuditEvent = z.output<typeof auditEventSchema>;

export const auditSchema = z.object({
  since: z.string(),
  truncated: z.boolean(),
  events: z.array(auditEventSchema),
});

export type AuditPage = z.output<typeof auditSchema>;

/** `GET /api/admin/users/:id/projects`: another account's projects, read only. */
export const workspaceSchema = z.object({
  owner: z.object({ id: z.string(), userName: z.string(), displayName: z.string() }),
  projects: z.array(projectSchema),
});

export type Workspace = z.output<typeof workspaceSchema>;

/** The roles of a project that a new project can start with another model for (DEC-106). */
export const defaultRoleNames = ['reader', 'verifier', 'planner', 'summariser'] as const;

export type DefaultRoleName = (typeof defaultRoleNames)[number];

const roleChoice = z.object({ provider: z.string(), model: z.string() });

const defaultRolesSchema = z.object({
  reader: roleChoice.optional(),
  verifier: roleChoice.optional(),
  planner: roleChoice.optional(),
  summariser: roleChoice.optional(),
});

export type DefaultRoles = z.output<typeof defaultRolesSchema>;

export const defaultRolesAnswerSchema = z.object({ roles: defaultRolesSchema });
