import type { ErrorCode, ErrorDescription } from './codes.js';

// RF-007: the plain message and the next step of every code in ERROR_CODES, in numeric order. The
// codes themselves live in codes.ts (which imports nothing); a new code adds its entry here in
// the same change, and describeError is the only way to read the table.

const ERROR_DESCRIPTIONS: Readonly<Record<ErrorCode, ErrorDescription>> = {
  'RST-1000': {
    message: 'The server configuration is missing or invalid.',
    nextStep:
      'Set the variables named in the message in the environment or .env, then start again.',
  },
  'RST-1100': {
    message: 'The path points outside the analysed repository folder, so it was not read.',
    nextStep: 'Use a path relative to the repository root, inside the analysed folder.',
  },
  'RST-1101': {
    message: 'The path is not a valid repository path, so it was not read.',
    nextStep: 'Use forward slashes and plain file names, without device names or stream suffixes.',
  },
  'RST-1102': {
    message: 'The path matches the ignore rules, so it is never read or sent.',
    nextStep: 'Change the ignore rules in the project settings if this file must be analysed.',
  },
  'RST-1103': {
    message:
      'The path matches the built-in deny list of secret files, so it is never read or sent.',
    nextStep: 'Add the pattern to scan.allowDenied in the project settings only if you are sure.',
  },
  'RST-1104': {
    message: 'The file does not exist in the analysed snapshot.',
    nextStep: 'Check the path against the list of files in the code map.',
  },
  'RST-1105': {
    message: 'The line range is not valid for this file.',
    nextStep: 'Ask for 1-based lines with the start not after the end and inside the file.',
  },
  'RST-1106': {
    message: 'The search pattern is longer than 200 characters, so it was not run.',
    nextStep: 'Use a shorter pattern.',
  },
  'RST-1107': {
    message: 'The search pattern is not a valid regular expression.',
    nextStep: 'Correct the pattern and search again.',
  },
  'RST-1108': {
    message: 'The search took longer than its time limit and was stopped.',
    nextStep: 'Use a simpler pattern or limit the files searched.',
  },
  'RST-1109': {
    message: 'The file would be written outside the user workspace, so the write was refused.',
    nextStep: 'Nothing was written; check the application log for the refused path.',
  },
  'RST-1110': {
    message: 'The snapshot cache is read-only, so the write was refused.',
    nextStep: 'Nothing was written; output belongs in the user workspace.',
  },
  'RST-1111': {
    message: 'A workspace id is not in the expected format, so no path was built from it.',
    nextStep: 'Check the user, project or run id that was passed.',
  },
  'RST-1112': {
    message: 'The search could not run because its worker failed.',
    nextStep: 'Search again; if it keeps failing, check the application log.',
  },
  'RST-1113': {
    message: 'The file size limit is not a whole number of bytes of zero or more.',
    nextStep: 'Correct the maximum file size in the project settings.',
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
  'RST-1511': {
    message: 'OpenAI rejected the API key.',
    nextStep:
      'Check the OpenAI key in your account settings (or OPENAI_API_KEY on the server), then start the run again.',
  },
  'RST-1512': {
    message: 'The configured model does not exist at OpenAI or this key cannot use it.',
    nextStep:
      'Choose a model the key can use (see docs/providers.md) in the project settings, then start the run again.',
  },
  'RST-1513': {
    message: 'The OpenAI account has no credit left.',
    nextStep:
      'Add credit or raise the limit in the OpenAI billing settings, then start the run again.',
  },
  'RST-1514': {
    message: 'The Ollama context size must be auto or a whole number of at least 1024 tokens.',
    nextStep:
      'Set contextTokens for this provider in the project settings to auto, or to 1024 or more.',
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
  'RST-2000': {
    message: 'The request is not valid.',
    nextStep: 'Check the values you sent and try again.',
  },
  'RST-2001': {
    message: 'You are not signed in.',
    nextStep: 'Sign in and try again.',
  },
  'RST-2002': {
    message: 'You are not allowed to do this.',
    nextStep: 'Ask an administrator if you need access.',
  },
  'RST-2003': {
    message: 'The page or item was not found.',
    nextStep: 'Check the address, or go back to your projects.',
  },
  'RST-2004': {
    message: 'The request conflicts with the current state.',
    nextStep: 'Reload the page to see the latest state, then try again.',
  },
  'RST-2005': {
    message: 'Too many requests.',
    nextStep: 'Wait a minute and try again.',
  },
  'RST-2006': {
    message: 'Something unexpected went wrong.',
    nextStep: 'Try again; if it keeps failing, ask the operator to check the application log.',
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
  'RST-2500': {
    message: 'The Rosetta version could not be read from package.json.',
    nextStep: 'Rebuild or reinstall Rosetta so that package.json ships next to the server.',
  },
};

export function describeError(code: ErrorCode): ErrorDescription {
  return ERROR_DESCRIPTIONS[code];
}
