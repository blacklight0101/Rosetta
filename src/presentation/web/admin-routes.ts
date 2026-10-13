import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AccountSummary } from '../../application/accounts/account-summary.js';
import type { AuditEvent } from '../../application/ports/audit-log.js';
import type { CreateUser } from '../../application/use-cases/create-user.js';
import { AUDIT_PERIOD_DAYS, type ListAudit } from '../../application/use-cases/list-audit.js';
import type { ListedAccount, ListUsers } from '../../application/use-cases/list-users.js';
import type { ResetPassword } from '../../application/use-cases/reset-password.js';
import type { AccountChange, UpdateUser } from '../../application/use-cases/update-user.js';
import { ROLES } from '../../domain/accounts/role.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { FieldProblemsError } from '../../domain/errors/field-problems.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { formatInstant } from '../../infrastructure/system/instant.js';
import { signedInOf } from './request-actor.js';
import { MAX_PASSWORD_LENGTH, PASSWORD_BODY_LIMIT_BYTES } from './password-limits.js';

// RF-1102, RF-1107, RF-1109: the account administration API; every route needs the `admin` role
// (a `user` gets 403, access matrix).
// - GET /api/admin/users lists every account with last sign-in, projects, month-to-date cost and
//   whether it may use the server's keys (RF-1104).
// - POST /api/admin/users creates an account (201); `mustChangePassword` defaults to true.
// - POST /api/admin/users/:id/disable and /enable change the account at once.
// - POST /api/admin/users/:id/password resets the password.
// - GET /api/admin/audit lists the last 30 days, optionally `?userId=<uuid>&action=<name>`,
//   `&outcome=ok|refused|failed` and `&days=1|7|30` for a shorter window (P1-107).
// Bodies with a password are capped at 4 KiB and the password at 1,024 characters (as sign-in).
// Costs travel as decimal strings of micro-units, so no amount is rounded; no answer carries a
// password hash or a lockout counter.

export interface AdminServices {
  readonly createUser: CreateUser;
  readonly updateUser: UpdateUser;
  readonly resetPassword: ResetPassword;
  readonly listUsers: ListUsers;
  readonly listAudit: ListAudit;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const password = z.string().min(1).max(MAX_PASSWORD_LENGTH);

const createBody = z.strictObject({
  userName: z.string().max(200),
  displayName: z.string().max(200),
  role: z.enum(ROLES),
  password,
  mustChangePassword: z.boolean().optional(),
});
const resetBody = z.strictObject({ password });
const auditQuery = z.strictObject({
  userId: z.string().regex(UUID).optional(),
  action: z
    .string()
    .regex(/^[a-z_.]{1,64}$/)
    .optional(),
  outcome: z.enum(['ok', 'refused', 'failed']).optional(),
  days: z
    .enum(AUDIT_PERIOD_DAYS.map(String))
    .transform((days) => AUDIT_PERIOD_DAYS.find((each) => String(each) === days))
    .optional(),
});

/** The form field each refusal points at. */
const FIELDS: Partial<Readonly<Record<ErrorCode, string>>> = {
  [ERROR_CODES.userNameInvalid]: 'userName',
  [ERROR_CODES.userNameTaken]: 'userName',
  [ERROR_CODES.displayNameInvalid]: 'displayName',
  [ERROR_CODES.passwordTooShort]: 'password',
  [ERROR_CODES.passwordTooCommon]: 'password',
  [ERROR_CODES.passwordContainsUserName]: 'password',
};

interface IdParams {
  readonly id: string;
}

function refusal(code: ErrorCode): RosettaError {
  const field = FIELDS[code];
  return field === undefined
    ? new RosettaError(code)
    : new FieldProblemsError(code, [{ field, code }]);
}

function parsed<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new RosettaError(ERROR_CODES.requestInvalid);
  return result.data;
}

function summaryView(account: AccountSummary): Record<string, unknown> {
  return {
    id: account.id,
    userName: account.userName,
    displayName: account.displayName,
    role: account.role,
    state: account.state,
    createdAt: formatInstant(account.createdAt),
    lastSignInAt: account.lastSignInAt === null ? null : formatInstant(account.lastSignInAt),
  };
}

function listedView(account: ListedAccount): Record<string, unknown> {
  return {
    ...summaryView(account),
    projects: account.projects,
    serverKeysAllowed: account.serverKeysAllowed,
    monthToDate: account.monthToDate.map(({ currency, costMicros }) => ({
      currency,
      costMicros: costMicros.toString(),
    })),
  };
}

function auditView(event: AuditEvent): Record<string, unknown> {
  return { ...event, at: event.at.toISOString() };
}

function registerUsers(server: FastifyInstance, services: AdminServices): void {
  server.get('/api/admin/users', { config: { access: 'admin' } }, async (request, reply) => {
    const outcome = await services.listUsers.execute({ actor: signedInOf(request).actor });
    if (!outcome.ok) throw refusal(outcome.error);
    return reply.status(200).send({ users: outcome.value.map(listedView) });
  });

  server.post(
    '/api/admin/users',
    { bodyLimit: PASSWORD_BODY_LIMIT_BYTES, config: { access: 'admin' } },
    async (request, reply) => {
      const body = parsed(createBody, request.body);
      const outcome = await services.createUser.execute({
        actor: signedInOf(request).actor,
        ...body,
        ip: request.ip,
      });
      if (!outcome.ok) throw refusal(outcome.error);
      return reply.status(201).send({ user: summaryView(outcome.value) });
    },
  );
}

function registerChange(server: FastifyInstance, services: AdminServices, change: AccountChange) {
  server.post<{ Params: IdParams }>(
    `/api/admin/users/:id/${change}`,
    { config: { access: 'admin' } },
    async (request, reply) => {
      const outcome = await services.updateUser.execute({
        actor: signedInOf(request).actor,
        userId: request.params.id,
        change,
        ip: request.ip,
      });
      if (!outcome.ok) throw refusal(outcome.error);
      return reply.status(200).send({ user: summaryView(outcome.value) });
    },
  );
}

function registerReset(server: FastifyInstance, services: AdminServices): void {
  server.post<{ Params: IdParams }>(
    '/api/admin/users/:id/password',
    { bodyLimit: PASSWORD_BODY_LIMIT_BYTES, config: { access: 'admin' } },
    async (request, reply) => {
      const body = parsed(resetBody, request.body);
      const outcome = await services.resetPassword.execute({
        actor: signedInOf(request).actor,
        userId: request.params.id,
        password: body.password,
        ip: request.ip,
      });
      if (!outcome.ok) throw refusal(outcome.error);
      return reply.status(200).send({ user: summaryView(outcome.value) });
    },
  );
}

function registerAudit(server: FastifyInstance, services: AdminServices): void {
  server.get('/api/admin/audit', { config: { access: 'admin' } }, async (request, reply) => {
    const query = parsed(auditQuery, request.query);
    const outcome = await services.listAudit.execute({
      actor: signedInOf(request).actor,
      userId: query.userId,
      action: query.action,
      outcome: query.outcome,
      days: query.days,
    });
    if (!outcome.ok) throw refusal(outcome.error);
    const { since, events, truncated } = outcome.value;
    return reply
      .status(200)
      .send({ since: formatInstant(since), truncated, events: events.map(auditView) });
  });
}

// RF-1102, RF-1109
export function registerAdminRoutes(server: FastifyInstance, services: AdminServices): void {
  registerUsers(server, services);
  registerChange(server, services, 'disable');
  registerChange(server, services, 'enable');
  registerReset(server, services);
  registerAudit(server, services);
}
