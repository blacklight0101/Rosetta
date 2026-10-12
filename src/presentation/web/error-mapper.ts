import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { describeError } from '../../domain/errors/descriptions.js';
import { FieldProblemsError, type FieldProblem } from '../../domain/errors/field-problems.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-007, RNF-008: every error becomes an HTTP status of its cause and a body with the `RST`
// code, the catalogue's plain message and the next step. The error's own message and stack never
// reach the body: they may name internals (conventions section 6).

type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 429 | 500;

interface ErrorBody {
  readonly code: ErrorCode;
  readonly message: string;
  readonly nextStep: string;
  /** RF-002, RF-010: the fields a refusal points at, each with its own code. */
  readonly problems?: readonly ProblemBody[];
}

interface ProblemBody extends ErrorBody {
  readonly field: string;
  readonly reason?: string;
}

export interface ErrorReply {
  readonly status: ErrorStatus;
  readonly body: ErrorBody;
  /** True for a 500: the caller logs the error and its stack. */
  readonly unexpected: boolean;
}

/** The status of each code that has an HTTP cause; any other code answers 500. */
const statusOfCode: Partial<Readonly<Record<ErrorCode, ErrorStatus>>> = {
  [ERROR_CODES.requestInvalid]: 400,
  [ERROR_CODES.githubUrlInvalid]: 400,
  [ERROR_CODES.settingsInvalid]: 400,
  [ERROR_CODES.passwordTooShort]: 400,
  [ERROR_CODES.passwordTooCommon]: 400,
  [ERROR_CODES.passwordContainsUserName]: 400,
  [ERROR_CODES.userNameInvalid]: 400,
  [ERROR_CODES.displayNameInvalid]: 400,
  [ERROR_CODES.currentPasswordIncorrect]: 400,
  [ERROR_CODES.notSignedIn]: 401,
  [ERROR_CODES.notAllowed]: 403,
  [ERROR_CODES.originRefused]: 403,
  [ERROR_CODES.csrfTokenInvalid]: 403,
  [ERROR_CODES.passwordChangeRequired]: 403,
  [ERROR_CODES.invalidCredentials]: 401,
  [ERROR_CODES.notFound]: 404,
  [ERROR_CODES.conflict]: 409,
  [ERROR_CODES.runStageNotAvailable]: 409,
  [ERROR_CODES.userNameTaken]: 409,
  [ERROR_CODES.accountStateInvalid]: 409,
  [ERROR_CODES.ownAccountRefused]: 409,
  [ERROR_CODES.rateLimited]: 429,
};

/** The code for a framework client error by its status; other 4xx statuses are invalid requests. */
const codeOfFrameworkStatus: Readonly<Partial<Record<number, ErrorCode>>> = {
  401: ERROR_CODES.notSignedIn,
  403: ERROR_CODES.notAllowed,
  404: ERROR_CODES.notFound,
  409: ERROR_CODES.conflict,
  429: ERROR_CODES.rateLimited,
};

/** The HTTP status Fastify or a plugin attached to an error it threw, if any. */
function frameworkStatus(error: Error): number | undefined {
  const status: unknown = Reflect.get(error, 'statusCode');
  return typeof status === 'number' ? status : undefined;
}

/** RF-1009: the errors @fastify/csrf-protection sends for a missing secret or a wrong token. */
const CSRF_ERRORS: ReadonlySet<unknown> = new Set([
  'FST_CSRF_MISSING_SECRET',
  'FST_CSRF_INVALID_TOKEN',
]);

function codeOf(error: unknown): ErrorCode {
  if (error instanceof RosettaError) return error.code;
  if (!(error instanceof Error)) return ERROR_CODES.unexpected;
  if (CSRF_ERRORS.has(Reflect.get(error, 'code'))) return ERROR_CODES.csrfTokenInvalid;
  const status = frameworkStatus(error);
  if (status === undefined || status < 400 || status >= 500) return ERROR_CODES.unexpected;
  return codeOfFrameworkStatus[status] ?? ERROR_CODES.requestInvalid;
}

function problemBody(problem: FieldProblem): ProblemBody {
  const { field, code, reason } = problem;
  return { field, code, ...describeError(code), ...(reason === undefined ? {} : { reason }) };
}

// RF-007
export function toErrorReply(error: unknown): ErrorReply {
  const code = codeOf(error);
  const status = statusOfCode[code] ?? 500;
  const problems =
    error instanceof FieldProblemsError ? { problems: error.problems.map(problemBody) } : {};
  return {
    status,
    body: { code, ...describeError(code), ...problems },
    unexpected: status === 500,
  };
}
