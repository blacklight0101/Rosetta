import { z } from 'zod';

// The wire shapes the front end reads. The server's error body is built by
// src/presentation/web/error-mapper.ts and the session answer by session-routes.ts; the web
// project may not import from src/ except the contracts folder (DEC-112), so the shapes are
// restated here and every answer is parsed before use.

// Zod's code generation would run `new Function`, which the content security policy of RF-1013
// refuses (and reports to the console); the plain interpreter has the same results.
z.config({ jitless: true });

const errorCode = z.string().regex(/^RST-\d{4}$/u);

const problemSchema = z.object({
  field: z.string(),
  code: errorCode,
  message: z.string(),
  nextStep: z.string(),
  reason: z.string().optional(),
});

/** RF-007, RNF-008: the body of every error answer. */
export const errorBodySchema = z.object({
  code: errorCode,
  message: z.string(),
  nextStep: z.string(),
  problems: z.array(problemSchema).optional(),
});

const roleSchema = z.enum(['admin', 'user']);

/** RF-1100: the signed-in user as `GET /api/session` shows it. */
export const sessionSchema = z.object({
  user: z.object({
    id: z.string(),
    userName: z.string(),
    displayName: z.string(),
    role: roleSchema,
    state: z.enum(['Active', 'MustChangePassword', 'Locked', 'Disabled']),
  }),
  csrfToken: z.string(),
  /** RF-129, DEC-149: the largest zip the server accepts, in MB; absent until the server says. */
  uploadMaxMb: z.number().int().positive().optional(),
});

export type Session = z.output<typeof sessionSchema>;

/** RF-1104: the providers a user stores a key for. */
const keyProviderSchema = z.enum(['openai', 'anthropic', 'openai-compatible']);

export type KeyProvider = z.output<typeof keyProviderSchema>;

/** RF-1104: a stored key as the server shows it; the key itself never comes back. */
const keySummarySchema = z.object({
  provider: keyProviderSchema,
  last4: z.string(),
  updatedAt: z.string(),
});

export type KeySummary = z.output<typeof keySummarySchema>;

/** `GET /api/account/keys`. */
export const keyListSchema = z.object({ keys: z.array(keySummarySchema) });

/** `PUT /api/account/keys/:provider`. */
export const keyAnswerSchema = z.object({ key: keySummarySchema });

/** DEC-107: `GET` and `PUT /api/account/daily-cap`, micro-dollars as a decimal string, or none. */
export const ownDailyCapSchema = z.object({
  ownDailyCapMicros: z.string().regex(/^\d+$/u).nullable(),
});

/** RF-407: one role of the provider test; a failed role carries its error. */
const roleTestSchema = z.object({
  role: z.enum(['reader', 'verifier', 'planner', 'summariser']),
  provider: z.string(),
  model: z.string(),
  status: z.enum(['reachable', 'failed']),
  costMicros: z.string().regex(/^\d+$/u),
  currency: z.string(),
  code: errorCode.optional(),
  message: z.string().optional(),
  nextStep: z.string().optional(),
});

export type RoleTest = z.output<typeof roleTestSchema>;

/** `POST /api/account/providers/test`. */
export const providerTestSchema = z.object({ roles: z.array(roleTestSchema) });
