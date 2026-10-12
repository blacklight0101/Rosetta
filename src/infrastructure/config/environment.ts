import { z } from 'zod';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-1305: all server configuration comes from the environment, is validated once at start-up
// and is read nowhere else. Messages name a variable and the rule it broke, never its value.
// This is the only module that reads `process.env` (environments-and-delivery.md section 4).

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface Environment {
  readonly databaseUrl: string;
  readonly databaseMigratorUrl: string;
  readonly secretKey: string;
  readonly secretKeyPrevious: string | undefined;
  readonly publicUrl: string;
  readonly dataDir: string;
  readonly adminUser: string | undefined;
  readonly adminPassword: string | undefined;
  readonly openaiApiKey: string | undefined;
  readonly anthropicApiKey: string | undefined;
  readonly githubToken: string | undefined;
  readonly ollamaUrl: string | undefined;
  readonly contactEmail: string | undefined;
  readonly logLevel: LogLevel;
  readonly logRetentionDays: number;
  readonly trustProxy: number;
  readonly appDbPassword: string | undefined;
  readonly migratorDbPassword: string | undefined;
  readonly dbAdminPassword: string | undefined;
  readonly test: boolean;
  readonly testDatabaseUrl: string | undefined;
}

const DEFAULT_LOG_LEVEL: LogLevel = 'info';
const DEFAULT_LOG_RETENTION_DAYS = 14;
const MAX_TRUST_PROXY_HOPS = 16;
const SECRET_KEY_BYTES = 32;

// Variables that exist only for tests and development; an https public URL means a real
// deployment, where they are refused (RNF-014).
const TEST_ONLY_VARIABLES = ['ROSETTA_TEST', 'ROSETTA_TEST_DATABASE_URL'];

function isPostgresUrl(value: string): boolean {
  return URL.canParse(value) && ['postgres:', 'postgresql:'].includes(new URL(value).protocol);
}

function isHttpUrl(value: string): boolean {
  return URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol);
}

/** An http(s) URL without `user:password@`, which would reach logs and the provider's headers. */
function isHttpUrlWithoutUserinfo(value: string): boolean {
  if (!isHttpUrl(value)) return false;
  const url = new URL(value);
  return url.username === '' && url.password === '';
}

function isHttpOrigin(value: string): boolean {
  return isHttpUrl(value) && new URL(value).origin === value;
}

function isSecretKey(value: string): boolean {
  const bytes = Buffer.from(value, 'base64');
  return bytes.length === SECRET_KEY_BYTES && bytes.toString('base64') === value;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** A string variable; an absent one reports "is missing", a broken one reports `rule`. */
function text(rule?: { check: (value: string) => boolean; message: string }): z.ZodType<string> {
  const base = z.string({ error: 'is missing' });
  return rule === undefined ? base : base.refine(rule.check, { error: rule.message });
}

function whole(minimum: number, maximum: number, message: string): z.ZodType<number> {
  return z
    .string({ error: 'is missing' })
    .regex(/^\d{1,9}$/, { error: message })
    .transform(Number)
    .refine((value) => value >= minimum && value <= maximum, { error: message });
}

const postgresUrl = { check: isPostgresUrl, message: 'must be a postgres:// or postgresql:// URL' };
const secretKey = {
  check: isSecretKey,
  message: 'must be 32 random bytes encoded as base64 (openssl rand -base64 32)',
};
const switchOn = z.literal('1', { error: 'must be 1 when set' });

const SCHEMA = z.object({
  DATABASE_URL: text(postgresUrl),
  DATABASE_MIGRATOR_URL: text(postgresUrl).optional(),
  ROSETTA_SECRET_KEY: text(secretKey),
  ROSETTA_SECRET_KEY_PREVIOUS: text(secretKey).optional(),
  ROSETTA_PUBLIC_URL: text({
    check: isHttpOrigin,
    message: 'must be an http(s) origin such as http://127.0.0.1:8080, without a path',
  }),
  ROSETTA_DATA_DIR: text(),
  ROSETTA_ADMIN_USER: text().optional(),
  ROSETTA_ADMIN_PASSWORD: text().optional(),
  OPENAI_API_KEY: text().optional(),
  ANTHROPIC_API_KEY: text().optional(),
  GITHUB_TOKEN: text().optional(),
  ROSETTA_OLLAMA_URL: text({
    check: isHttpUrlWithoutUserinfo,
    message: 'must be an http(s) URL without a user name or password',
  }).optional(),
  ROSETTA_CONTACT_EMAIL: text({ check: isEmail, message: 'must be an email address' }).optional(),
  ROSETTA_LOG_LEVEL: z
    .enum(['debug', 'info', 'warn', 'error'], { error: 'must be debug, info, warn or error' })
    .optional(),
  ROSETTA_LOG_RETENTION_DAYS: whole(
    1,
    3650,
    'must be a whole number of days from 1 to 3650',
  ).optional(),
  ROSETTA_TRUST_PROXY: whole(
    0,
    MAX_TRUST_PROXY_HOPS,
    `must be a whole number of proxy hops from 0 to ${String(MAX_TRUST_PROXY_HOPS)}`,
  ).optional(),
  ROSETTA_APP_DB_PASSWORD: text().optional(),
  ROSETTA_MIGRATOR_DB_PASSWORD: text().optional(),
  ROSETTA_DB_ADMIN_PASSWORD: text().optional(),
  ROSETTA_TEST: switchOn.optional(),
  ROSETTA_TEST_DATABASE_URL: text(postgresUrl).optional(),
});

type Parsed = z.output<typeof SCHEMA>;

/** An empty value counts as unset, because Compose passes unset variables through as "". */
function pick(source: EnvironmentSource): Record<string, string | undefined> {
  const input: Record<string, string | undefined> = {};
  for (const name of Object.keys(SCHEMA.shape)) {
    const value = source[name];
    input[name] = value === undefined || value === '' ? undefined : value;
  }
  return input;
}

function refusedTestOnly(input: Record<string, string | undefined>): string[] {
  const publicUrl = input['ROSETTA_PUBLIC_URL'];
  if (publicUrl === undefined || !/^https:\/\//i.test(publicUrl)) return [];
  return TEST_ONLY_VARIABLES.filter((name) => input[name] !== undefined).map(
    (name) => `${name} is refused when ROSETTA_PUBLIC_URL is https`,
  );
}

function toEnvironment(parsed: Parsed): Environment {
  return Object.freeze({
    databaseUrl: parsed.DATABASE_URL,
    databaseMigratorUrl: parsed.DATABASE_MIGRATOR_URL ?? parsed.DATABASE_URL,
    secretKey: parsed.ROSETTA_SECRET_KEY,
    secretKeyPrevious: parsed.ROSETTA_SECRET_KEY_PREVIOUS,
    publicUrl: parsed.ROSETTA_PUBLIC_URL,
    dataDir: parsed.ROSETTA_DATA_DIR,
    adminUser: parsed.ROSETTA_ADMIN_USER,
    adminPassword: parsed.ROSETTA_ADMIN_PASSWORD,
    openaiApiKey: parsed.OPENAI_API_KEY,
    anthropicApiKey: parsed.ANTHROPIC_API_KEY,
    githubToken: parsed.GITHUB_TOKEN,
    ollamaUrl: parsed.ROSETTA_OLLAMA_URL,
    contactEmail: parsed.ROSETTA_CONTACT_EMAIL,
    logLevel: parsed.ROSETTA_LOG_LEVEL ?? DEFAULT_LOG_LEVEL,
    logRetentionDays: parsed.ROSETTA_LOG_RETENTION_DAYS ?? DEFAULT_LOG_RETENTION_DAYS,
    trustProxy: parsed.ROSETTA_TRUST_PROXY ?? 0,
    appDbPassword: parsed.ROSETTA_APP_DB_PASSWORD,
    migratorDbPassword: parsed.ROSETTA_MIGRATOR_DB_PASSWORD,
    dbAdminPassword: parsed.ROSETTA_DB_ADMIN_PASSWORD,
    test: parsed.ROSETTA_TEST !== undefined,
    testDatabaseUrl: parsed.ROSETTA_TEST_DATABASE_URL,
  });
}

/**
 * Parses the server configuration once. Throws RST-1000 naming every missing or invalid
 * variable; the message never contains a value.
 */
// RF-1305
export function loadEnvironment(source: EnvironmentSource = process.env): Environment {
  const input = pick(source);
  const result = SCHEMA.safeParse(input);
  const problems = [
    ...(result.success
      ? []
      : result.error.issues.map((issue) => `${String(issue.path[0])} ${issue.message}`)),
    ...refusedTestOnly(input),
  ];
  if (!result.success || problems.length > 0) {
    throw new RosettaError(
      ERROR_CODES.configurationInvalid,
      `Invalid server configuration: ${problems.join('; ')}.`,
    );
  }
  return toEnvironment(result.data);
}
