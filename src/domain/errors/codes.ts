// RF-007: stable RST-xxxx codes. One code per line, so two parallel changes that take the same
// number conflict visibly (DEC-112). A new code takes the next free number in its range
// (conventions section 6) and gets a plain message and a next step in descriptions.ts.

import { ERROR_DESCRIPTIONS } from './descriptions.js';

/** The ranges of conventions section 6, in order; each holds one hundred codes. */
export const ERROR_RANGES = {
  configuration: { first: 1000, last: 1099 },
  fileSystem: { first: 1100, last: 1199 },
  scan: { first: 1200, last: 1299 },
  agentLoop: { first: 1300, last: 1399 },
  verifier: { first: 1400, last: 1499 },
  providers: { first: 1500, last: 1599 },
  budget: { first: 1600, last: 1699 },
  reportAndExport: { first: 1700, last: 1799 },
  plan: { first: 1800, last: 1899 },
  githubSources: { first: 1900, last: 1999 },
  webAndHttp: { first: 2000, last: 2099 },
  observability: { first: 2100, last: 2199 },
  accounts: { first: 2200, last: 2299 },
  keysCapsAndQueue: { first: 2300, last: 2399 },
  database: { first: 2400, last: 2499 },
  deployment: { first: 2500, last: 2599 },
} as const;

/** Codes in use, reserved first for the ones the design board already shows. */
export const ERROR_CODES = {
  configurationInvalid: 'RST-1000',
  pathOutsideRoot: 'RST-1100',
  pathInvalid: 'RST-1101',
  pathIgnored: 'RST-1102',
  pathDenied: 'RST-1103',
  fileNotFound: 'RST-1104',
  lineRangeInvalid: 'RST-1105',
  grepPatternTooLong: 'RST-1106',
  grepPatternInvalid: 'RST-1107',
  grepTimedOut: 'RST-1108',
  writeOutsideWorkspace: 'RST-1109',
  snapshotWriteRefused: 'RST-1110',
  workspaceIdInvalid: 'RST-1111',
  grepFailed: 'RST-1112',
  fakeProviderRefused: 'RST-1500',
  providerCallCancelled: 'RST-1501',
  recordingInvalid: 'RST-1502',
  recordingExhausted: 'RST-1503',
  providerRateLimited: 'RST-1504',
  providerTimeout: 'RST-1505',
  providerCallFailed: 'RST-1506',
  ollamaUnreachable: 'RST-1507',
  ollamaModelMissing: 'RST-1508',
  realProviderRefusedInTests: 'RST-1509',
  ollamaToolsUnsupported: 'RST-1510',
  githubUrlInvalid: 'RST-1900',
  githubRefNotFound: 'RST-1901',
  githubRateLimited: 'RST-1902',
  githubSourceUnavailable: 'RST-1903',
  githubHostRefused: 'RST-1904',
  snapshotTooLarge: 'RST-1905',
  snapshotEntryRefused: 'RST-1906',
  githubRequestFailed: 'RST-1907',
  snapshotWriteFailed: 'RST-1908',
  requestInvalid: 'RST-2000',
  notSignedIn: 'RST-2001',
  notAllowed: 'RST-2002',
  notFound: 'RST-2003',
  conflict: 'RST-2004',
  rateLimited: 'RST-2005',
  unexpected: 'RST-2006',
  secretMaskingFailed: 'RST-2101',
  logFileFailed: 'RST-2102',
  providerCallLogFailed: 'RST-2103',
  invalidCredentials: 'RST-2201',
  baseUrlRejected: 'RST-2304',
  migrationFileInvalid: 'RST-2400',
  migrationChanged: 'RST-2401',
  migrationUnknown: 'RST-2402',
  migrationFailed: 'RST-2403',
  versionUnreadable: 'RST-2500',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ErrorDescription {
  readonly message: string;
  readonly nextStep: string;
}

export function describeError(code: ErrorCode): ErrorDescription {
  return ERROR_DESCRIPTIONS[code];
}
