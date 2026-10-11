import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { describeError } from '../../domain/errors/descriptions.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-007, RNF-008: every error becomes an HTTP status of its cause and a body with the `RST`
// code, the catalogue's plain message and the next step. The error's own message and stack never
// reach the body: they may name internals (conventions section 6).

type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 429 | 500;

interface ErrorBody {
  readonly code: ErrorCode;
  readonly message: string;
  readonly nextStep: string;
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
  [ERROR_CODES.notSignedIn]: 401,
  [ERROR_CODES.notAllowed]: 403,
  [ERROR_CODES.notFound]: 404,
  [ERROR_CODES.conflict]: 409,
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

function codeOf(error: unknown): ErrorCode {
  if (error instanceof RosettaError) return error.code;
  if (!(error instanceof Error)) return ERROR_CODES.unexpected;
  const status = frameworkStatus(error);
  if (status === undefined || status < 400 || status >= 500) return ERROR_CODES.unexpected;
  return codeOfFrameworkStatus[status] ?? ERROR_CODES.requestInvalid;
}

// RF-007
export function toErrorReply(error: unknown): ErrorReply {
  const code = codeOf(error);
  const status = statusOfCode[code] ?? 500;
  return { status, body: { code, ...describeError(code) }, unexpected: status === 500 };
}
