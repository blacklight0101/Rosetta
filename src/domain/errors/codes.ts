// RF-007: stable RST-xxxx codes. One code per line, so two parallel changes that take the same
// number conflict visibly (DEC-112). A new code takes the next free number in its range
// (conventions section 6) and gets a plain message and a next step in ERROR_DESCRIPTIONS.

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
  providerRateLimited: 'RST-1504',
  providerTimeout: 'RST-1505',
  githubSourceUnavailable: 'RST-1903',
  invalidCredentials: 'RST-2201',
  baseUrlRejected: 'RST-2304',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ErrorDescription {
  readonly message: string;
  readonly nextStep: string;
}

const ERROR_DESCRIPTIONS: Readonly<Record<ErrorCode, ErrorDescription>> = {
  'RST-1000': {
    message: 'The server configuration is missing or invalid.',
    nextStep:
      'Set the variables named in the message in the environment or .env, then start again.',
  },
  'RST-1504': {
    message: 'The AI provider is limiting requests right now.',
    nextStep: 'Rosetta retries by itself; if it keeps failing, wait a minute and resume the run.',
  },
  'RST-1505': {
    message: 'The AI provider did not answer in time.',
    nextStep: 'Resume the run to check the unverified claims again.',
  },
  'RST-1903': {
    message:
      'This repository is private or does not exist. Only public GitHub repositories can be analysed.',
    nextStep: 'Check the address, or choose a public repository.',
  },
  'RST-2201': {
    message: 'User name or password is incorrect.',
    nextStep: 'Check both and try again.',
  },
  'RST-2304': {
    message: 'The URL must use https and a public address.',
    nextStep: 'Enter an https address that is reachable from the internet.',
  },
};

export function describeError(code: ErrorCode): ErrorDescription {
  return ERROR_DESCRIPTIONS[code];
}
