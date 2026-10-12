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
});

export type Session = z.output<typeof sessionSchema>;
