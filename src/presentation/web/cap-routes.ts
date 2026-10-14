import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { GetCaps } from '../../application/use-cases/get-caps.js';
import type {
  Amounts,
  GetSpendLimits,
  SpendLimits,
} from '../../application/use-cases/get-spend-limits.js';
import type { GetOwnDailyCap } from '../../application/use-cases/get-own-daily-cap.js';
import type { SetCaps } from '../../application/use-cases/set-caps.js';
import type { SetOwnDailyCap } from '../../application/use-cases/set-own-daily-cap.js';
import type { ServerCaps } from '../../domain/budget/budget.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { FieldProblemsError, type FieldProblem } from '../../domain/errors/field-problems.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';

// RF-1106, DEC-107, RF-1109: the usage caps. Amounts travel as decimal strings of micro-dollars, so
// none is rounded; an amount is a whole number up to the largest safe integer (about 9 billion
// dollars); a negative one is refused on its field with RST-1003, anything else that is not an
// amount with RST-2000.
// - GET /api/admin/caps and PUT /api/admin/caps (administrators): the run, user-day and
//   server-month caps on the server keys; the GET also answers `serverMonthToDate`, the spend of
//   this UTC month on the server's keys only (per currency, micro-dollar strings).
// - GET /api/account/daily-cap and PUT /api/account/daily-cap (every signed-in user): the optional
//   daily cap on the user's own keys; null means none.
// - GET /api/account/limits (every signed-in user): what is left of the user's day and of the
//   server's month on the server's keys, and of their own daily cap on their own keys, for the
//   start page's estimate warning (DEC-108); spend on own keys is outside the server's month.

export interface CapServices {
  readonly getCaps: GetCaps;
  readonly setCaps: SetCaps;
  readonly getOwnDailyCap: GetOwnDailyCap;
  readonly getSpendLimits: GetSpendLimits;
  readonly setOwnDailyCap: SetOwnDailyCap;
}

const CAP_BODY_LIMIT_BYTES = 1024;
const largest = BigInt(Number.MAX_SAFE_INTEGER);
const amount = z.string().regex(/^-?\d{1,16}$/u);

const capsBody = z.strictObject({
  runMicros: amount,
  userDayMicros: amount,
  serverMonthMicros: amount,
});
const ownCapBody = z.strictObject({ ownDailyCapMicros: amount.nullable() });

function parsed<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new RosettaError(ERROR_CODES.requestInvalid);
  return result.data;
}

/** A whole number of micro-dollars; a negative one is kept for the use case to refuse. */
function microsOf(text: string): bigint {
  const value = BigInt(text);
  if (value > largest) throw new RosettaError(ERROR_CODES.requestInvalid);
  return value;
}

function refusedFields(problems: readonly FieldProblem[]): FieldProblemsError {
  return new FieldProblemsError(ERROR_CODES.settingsInvalid, problems);
}

function capsView(caps: ServerCaps): Record<string, string> {
  return {
    runMicros: caps.runMicros.toString(),
    userDayMicros: caps.userDayMicros.toString(),
    serverMonthMicros: caps.serverMonthMicros.toString(),
  };
}

const ownCapView = (micros: bigint | null): { ownDailyCapMicros: string | null } => ({
  ownDailyCapMicros: micros?.toString() ?? null,
});

async function readView(services: CapServices): Promise<Record<string, unknown>> {
  const { caps, serverMonthToDate } = await services.getCaps.execute();
  return {
    caps: capsView(caps),
    serverMonthToDate: serverMonthToDate.map(({ currency, costMicros }) => ({
      currency,
      costMicros: costMicros.toString(),
    })),
  };
}

function registerServerCaps(server: FastifyInstance, services: CapServices): void {
  server.get('/api/admin/caps', { config: { access: 'admin' } }, async (_request, reply) =>
    reply.status(200).send(await readView(services)),
  );

  server.put(
    '/api/admin/caps',
    { bodyLimit: CAP_BODY_LIMIT_BYTES, config: { access: 'admin' } },
    async (request, reply) => {
      const body = parsed(capsBody, request.body);
      const caps: ServerCaps = {
        runMicros: microsOf(body.runMicros),
        userDayMicros: microsOf(body.userDayMicros),
        serverMonthMicros: microsOf(body.serverMonthMicros),
      };
      const outcome = await services.setCaps.execute({
        actor: signedInOf(request).actor,
        caps,
        ip: request.ip,
      });
      if (!outcome.ok) throw refusedFields(outcome.error);
      return reply.status(200).send({ caps: capsView(outcome.value) });
    },
  );
}

function registerOwnCap(server: FastifyInstance, services: CapServices): void {
  server.get('/api/account/daily-cap', { config: { access: 'user' } }, async (request, reply) => {
    const actor = signedInOf(request).actor;
    return reply.status(200).send(ownCapView(await services.getOwnDailyCap.execute({ actor })));
  });

  server.put(
    '/api/account/daily-cap',
    { bodyLimit: CAP_BODY_LIMIT_BYTES, config: { access: 'user' } },
    async (request, reply) => {
      const { ownDailyCapMicros } = parsed(ownCapBody, request.body);
      const outcome = await services.setOwnDailyCap.execute({
        actor: signedInOf(request).actor,
        capMicros: ownDailyCapMicros === null ? null : microsOf(ownDailyCapMicros),
        ip: request.ip,
      });
      if (outcome.ok) return reply.status(200).send(ownCapView(outcome.value));
      if (outcome.error !== ERROR_CODES.settingsCapNegative) throw new RosettaError(outcome.error);
      throw refusedFields([{ field: 'ownDailyCapMicros', code: outcome.error }]);
    },
  );
}

const amountsView = (amounts: Amounts): Record<string, string> => ({
  capMicros: amounts.capMicros.toString(),
  spentMicros: amounts.spentMicros.toString(),
  remainingMicros: amounts.remainingMicros.toString(),
});

function limitsView({ serverKeys, ownKeys }: SpendLimits): Record<string, unknown> {
  return {
    serverKeys: {
      userDay: amountsView(serverKeys.userDay),
      serverMonth: { remainingMicros: serverKeys.serverMonth.remainingMicros.toString() },
    },
    ownKeys: { day: ownKeys.day === null ? null : amountsView(ownKeys.day) },
  };
}

function registerLimits(server: FastifyInstance, services: CapServices): void {
  server.get('/api/account/limits', { config: { access: 'user' } }, async (request, reply) => {
    const actor = signedInOf(request).actor;
    return reply.status(200).send(limitsView(await services.getSpendLimits.execute({ actor })));
  });
}

// RF-1106
export function registerCapRoutes(server: FastifyInstance, services: CapServices): void {
  registerServerCaps(server, services);
  registerOwnCap(server, services);
  registerLimits(server, services);
}
