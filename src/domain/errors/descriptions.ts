import type { ErrorCode, ErrorDescription } from './codes.js';
import { ANTHROPIC_ERROR_DESCRIPTIONS, type AnthropicErrorCode } from './anthropic-descriptions.js';
import { BUDGET_ERROR_DESCRIPTIONS, type BudgetErrorCode } from './budget-descriptions.js';
import { FILE_ERROR_DESCRIPTIONS, type FileErrorCode } from './file-descriptions.js';
import { PLAN_ERROR_DESCRIPTIONS, type PlanErrorCode } from './plan-descriptions.js';
import { REPORT_ERROR_DESCRIPTIONS, type ReportErrorCode } from './report-descriptions.js';
import { SCAN_ERROR_DESCRIPTIONS, type ScanErrorCode } from './scan-descriptions.js';
import { SERVER_ERROR_DESCRIPTIONS, type ServerErrorCode } from './server-descriptions.js';
import { UPLOAD_ERROR_DESCRIPTIONS, type UploadErrorCode } from './upload-descriptions.js';
import { WORKBOOK_ERROR_DESCRIPTIONS, type WorkbookErrorCode } from './workbook-descriptions.js';

// RF-007: the plain message and the next step of every code in ERROR_CODES, in numeric order. The
// codes themselves live in codes.ts (which imports nothing); a new code adds its entry here in
// the same change, and describeError is the only way to read the table. The codes from RST-2000
// on live in server-descriptions.ts, the file-system codes in file-descriptions.ts, the scan codes
// in scan-descriptions.ts, the budget codes in budget-descriptions.ts, the Anthropic codes in
// anthropic-descriptions.ts, the report and export codes in report-descriptions.ts and the plan
// codes in plan-descriptions.ts the uploaded-zip codes in upload-descriptions.ts and the workbook codes in workbook-descriptions.ts, so no file passes the size limit.

type SplitOff =
  | ServerErrorCode
  | FileErrorCode
  | BudgetErrorCode
  | ScanErrorCode
  | AnthropicErrorCode
  | ReportErrorCode
  | PlanErrorCode
  | UploadErrorCode
  | WorkbookErrorCode;

const PIPELINE_ERROR_DESCRIPTIONS: Readonly<
  Record<Exclude<ErrorCode, SplitOff>, ErrorDescription>
> = {
  'RST-1000': {
    message: 'The server configuration is missing or invalid.',
    nextStep:
      'Set the variables named in the message in the environment or .env, then start again.',
  },
  'RST-1001': {
    message: 'The provider is not one Rosetta knows, or the project does not define it.',
    nextStep:
      'Use ollama, openai, openai-compatible, anthropic or fake, and name only providers listed under providers.',
  },
  'RST-1002': {
    message: 'A role has no model.',
    nextStep:
      'Give the reader, verifier, planner and summariser roles each a provider and a model.',
  },
  'RST-1003': {
    message: 'A cap or price is below zero.',
    nextStep: 'Use zero or a positive whole number.',
  },
  'RST-1004': {
    message: 'A base URL cannot be set in the project settings.',
    nextStep:
      'Save an OpenAI-compatible base URL with your key in your account settings; Ollama uses the server address.',
  },
  'RST-1005': {
    message: 'The project settings are not valid, so nothing was saved.',
    nextStep: 'Correct the fields listed with this error and save again.',
  },
  'RST-1006': {
    message: 'This setting has a value that is not allowed, or is not a setting.',
    nextStep: 'Check the name and the value against the settings page and try again.',
  },
  'RST-1007': {
    message: 'The settings were changed somewhere else after this page read them.',
    nextStep: 'Reload the page to see the current settings, make your change again and save.',
  },
  'RST-1008': {
    message:
      'ROSETTA_SECRET_KEY is a known or repeated value, such as the all-zero placeholder of .env.example, so the server did not start.',
    nextStep: 'Generate a new key with openssl rand -base64 32, set it in .env and start again.',
  },
  'RST-1300': {
    message:
      'The agent did not return cards in the required format, even after one repair attempt.',
    nextStep:
      'Open the saved raw output of the task, then run the area again or choose a more capable model for the reader role.',
  },
  'RST-1301': {
    message:
      'The agent called a tool with arguments that are not valid; it was told what to change.',
    nextStep:
      'No action needed; the agent corrects the call. Choose a more capable model if it happens often.',
  },
  'RST-1302': {
    message:
      'The agent called a tool that does not exist; it was told the names of the valid tools.',
    nextStep:
      'No action needed when it happens once; a task that keeps doing it ends, so choose a more capable model.',
  },
  'RST-1303': {
    message: 'The agent task ended because the model kept repeating the same tool call.',
    nextStep: 'Run the area again, or choose a more capable model for the reader role.',
  },
  'RST-1304': {
    message: 'The agent task used all its turns before it gave its final answer.',
    nextStep:
      'Raise maxTurns for the reader role, or split the area into smaller ones, then run the area again.',
  },
  'RST-1305': {
    message:
      "The agent task ended because its conversation reached the configured share of the model's context.",
    nextStep:
      'Split the area into smaller ones or choose a model with a larger context, then run the area again.',
  },
  'RST-1306': {
    message: 'The file was skipped by the scan (binary or too large), so the agent cannot read it.',
    nextStep: 'No action needed; raise scan.maxFileBytes and scan again if the file must be read.',
  },
  'RST-1307': {
    message: 'An area named in the request is not in the code map of the latest scan.',
    nextStep:
      'Choose areas from the list the run log names, or start the run without areas to read every area.',
  },
  'RST-1308': {
    message:
      'The code map of the latest scan is not the one this run read, so it cannot be resumed.',
    nextStep:
      'Start a new understand run on the latest scan; the cards of this run stay as they are.',
  },
  'RST-1309': {
    message: 'The results of the finished agent tasks of this run could not be read.',
    nextStep:
      'Start a new understand run; the cards already written in the run folder stay as they are.',
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
  'RST-1515': {
    message: 'Code was not sent to a cloud provider because the run has no consent for it.',
    nextStep:
      'Start the run again and tick the consent box that names the cloud providers, or use a local Ollama model.',
  },
  'RST-1516': {
    message:
      'A model call was blocked because repository content was outside its labelled data block.',
    nextStep: 'Report this as a bug: tool results must reach the model only as data blocks.',
  },
  'RST-1517': {
    message: 'This provider is not available on this server.',
    nextStep:
      'Choose another provider for the role, or ask the operator to set it up (Ollama needs ROSETTA_OLLAMA_URL).',
  },
  'RST-1521': {
    message:
      'Code from an uploaded project was not sent to a cloud provider because the run lacks the second confirmation for private code.',
    nextStep:
      'Start the run again and tick the private code confirmation, or switch every role to a local Ollama model.',
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
};

const ERROR_DESCRIPTIONS: Readonly<Record<ErrorCode, ErrorDescription>> = {
  ...PIPELINE_ERROR_DESCRIPTIONS,
  ...ANTHROPIC_ERROR_DESCRIPTIONS,
  ...FILE_ERROR_DESCRIPTIONS,
  ...SCAN_ERROR_DESCRIPTIONS,
  ...BUDGET_ERROR_DESCRIPTIONS,
  ...REPORT_ERROR_DESCRIPTIONS,
  ...PLAN_ERROR_DESCRIPTIONS,
  ...SERVER_ERROR_DESCRIPTIONS,
  ...UPLOAD_ERROR_DESCRIPTIONS,
  ...WORKBOOK_ERROR_DESCRIPTIONS,
};

export function describeError(code: ErrorCode): ErrorDescription {
  return ERROR_DESCRIPTIONS[code];
}
