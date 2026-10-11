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
  invalidCredentials: 'RST-2201',
  secretMaskingFailed: 'RST-2101',
  logFileFailed: 'RST-2102',
  providerCallLogFailed: 'RST-2103',
  baseUrlRejected: 'RST-2304',
  migrationFileInvalid: 'RST-2400',
  migrationChanged: 'RST-2401',
  migrationUnknown: 'RST-2402',
  migrationFailed: 'RST-2403',
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
  'RST-1500': {
    message: 'The fake provider runs only in automated tests.',
    nextStep:
      'Choose a real provider kind in the project settings, or set ROSETTA_TEST=1 in tests.',
  },
  'RST-1501': {
    message: 'The call to the AI provider was cancelled.',
    nextStep: 'The run was stopped or reached a cap; resume it when you are ready.',
  },
  'RST-1502': {
    message: 'A recorded provider response is missing or invalid.',
    nextStep: 'Fix the recording file named in the message, or record it again.',
  },
  'RST-1503': {
    message: 'The fake provider has no recorded response left for this call.',
    nextStep: 'Add the missing response to the recording, or check the calls the test makes.',
  },
  'RST-1504': {
    message: 'The AI provider is limiting requests right now.',
    nextStep: 'Rosetta retries by itself; if it keeps failing, wait a minute and resume the run.',
  },
  'RST-1505': {
    message: 'The AI provider did not answer in time.',
    nextStep: 'Resume the run to check the unverified claims again.',
  },
  'RST-1506': {
    message: 'The call to the AI provider failed.',
    nextStep: 'Read the cause in the API calls panel or the log, then try again.',
  },
  'RST-1507': {
    message: 'Ollama is not running or cannot be reached.',
    nextStep:
      'Start Ollama on its host (ollama serve, or open the Ollama app), check ROSETTA_OLLAMA_URL, then start the run again.',
  },
  'RST-1508': {
    message: 'The configured model is not pulled in Ollama.',
    nextStep: 'Run ollama pull with the model name on the Ollama host, then start the run again.',
  },
  'RST-1509': {
    message: 'Calls to a real AI provider are blocked while ROSETTA_TEST=1.',
    nextStep:
      'Use the fake provider with recordings in tests, or unset ROSETTA_TEST outside tests.',
  },
  'RST-1510': {
    message: 'This model does not support native tool calling in Ollama.',
    nextStep:
      'Set toolMode to text for this provider in the project settings, or choose a model with tool support.',
  },
  'RST-1900': {
    message: 'The address is not a public GitHub repository URL.',
    nextStep:
      'Use https://github.com/<owner>/<repo>, with an optional /tree/<branch or tag>/<folder>.',
  },
  'RST-1901': {
    message: 'The branch, tag or commit was not found in this repository.',
    nextStep: 'Check the ref in the address, or leave it out to use the default branch.',
  },
  'RST-1902': {
    message: 'GitHub is limiting requests from this server right now.',
    nextStep:
      'Wait until the reset time in the message, or set a read-only GITHUB_TOKEN to raise the limit.',
  },
  'RST-1903': {
    message:
      'This repository is private or does not exist. Only public GitHub repositories can be analysed.',
    nextStep: 'Check the address, or choose a public repository.',
  },
  'RST-1904': {
    message: 'The download was refused because it would leave GitHub or drop to http.',
    nextStep: 'Nothing was downloaded; check the address and try again.',
  },
  'RST-1905': {
    message: 'The repository archive is larger than the configured limit.',
    nextStep: 'Choose a smaller repository or raise the snapshot limits on the server.',
  },
  'RST-1906': {
    message: 'The repository archive contains an entry that is not allowed, so it was discarded.',
    nextStep: 'Nothing was kept; check the repository or report the archive as a security issue.',
  },
  'RST-1907': {
    message: 'GitHub could not be reached or answered with an error.',
    nextStep: 'Check the network and the GitHub status page, then try again.',
  },
  'RST-1908': {
    message: 'The snapshot could not be written to the data folder.',
    nextStep: 'Check that the data folder exists, has free space and is writable by Rosetta.',
  },
  'RST-2101': {
    message: 'Secret masking failed, so the content was withheld.',
    nextStep: 'Nothing was sent or logged unmasked; check the application log and try again.',
  },
  'RST-2102': {
    message: 'The application log folder could not be written.',
    nextStep: 'Check that the data folder exists, has free space and is writable by Rosetta.',
  },
  'RST-2103': {
    message: 'The provider call log or a transcript could not be written.',
    nextStep: 'Check that the data folder exists, has free space and is writable by Rosetta.',
  },
  'RST-2201': {
    message: 'User name or password is incorrect.',
    nextStep: 'Check both and try again.',
  },
  'RST-2304': {
    message: 'The URL must use https and a public address.',
    nextStep: 'Enter an https address that is reachable from the internet.',
  },
  'RST-2400': {
    message: 'A database migration file has an invalid name or a duplicate number.',
    nextStep: 'Name each file NNNN_snake_name.sql with a number used once, then start again.',
  },
  'RST-2401': {
    message: 'A database migration that was already applied has been changed.',
    nextStep: 'Restore the original file and put the change in a new numbered migration.',
  },
  'RST-2402': {
    message: 'The database has a migration that this version of Rosetta does not know.',
    nextStep: 'Run the Rosetta version that applied it, or restore the database from a backup.',
  },
  'RST-2403': {
    message: 'A database migration failed; the previous schema was kept.',
    nextStep: 'Read the cause in the log, fix the migration and start again.',
  },
};

export function describeError(code: ErrorCode): ErrorDescription {
  return ERROR_DESCRIPTIONS[code];
}
