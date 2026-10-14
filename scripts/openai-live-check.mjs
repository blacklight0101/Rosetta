// RF-402, G-04: manual live check of the OpenAI adapter with the owner's key. Never run by tests
// or CI (ADR-008). Usage, after `npm run build`:
//   node scripts/openai-live-check.mjs <model>
// The key is read here, by the script, from OPENAI_API_KEY and passed to the adapter, as the
// provider set will (P1-29). The script loads the repository's `.env` itself (RF-402), so
// `npm run live:openai` needs no flags; a key already exported wins over the file. The prompts are
// fixed and synthetic: no repository content leaves this script. The two calls cost a fraction of
// a cent on the cheapest model; the budget and egress guards are not built yet, so no other call
// is made.
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnvFileIfPresent } from './load-env.mjs';

const root = resolve(import.meta.dirname, '..');
await loadEnvFileIfPresent(join(root, '.env'));
const [model] = process.argv.slice(2);
const apiKey = process.env.OPENAI_API_KEY ?? '';
const write = (line) => process.stdout.write(`${line}\n`);

function usageError() {
  if (model === undefined) return 'Usage: node scripts/openai-live-check.mjs <model>';
  if (apiKey === '') return 'Set OPENAI_API_KEY in the environment first.';
  if (process.env.ROSETTA_TEST === '1') {
    return 'ROSETTA_TEST=1 is set: the live check calls the real OpenAI, so unset it first.';
  }
  return undefined;
}

const load = (path) => import(pathToFileURL(join(root, 'dist', path)).href);

const context = {
  runId: 'live-check',
  agentTaskId: 'live-check',
  role: 'reader',
  callId: 'live-check#1',
  traceId: '0'.repeat(32),
  parentSpanId: '0'.repeat(16),
};
const readFile = {
  name: 'read_file',
  description: 'Reads a line range of a file in the repository.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      startLine: { type: 'integer' },
      endLine: { type: 'integer' },
    },
    required: ['path', 'startLine', 'endLine'],
  },
};

async function check(provider, name, messages, tools) {
  const response = await provider.complete({
    context,
    model,
    system: 'You are a careful assistant that reads source code before answering.',
    messages,
    tools,
    maxOutputTokens: 2048,
    signal: AbortSignal.timeout(300_000),
  });
  write(`## ${name}`);
  write(JSON.stringify(response, null, 2));
}

async function main() {
  const { OpenAiProvider } = await load('infrastructure/providers/openai/openai-provider.js');
  const provider = new OpenAiProvider({
    apiKey,
    timeoutSeconds: 120,
    maxRetries: 3,
    testMode: false,
  });
  await check(provider, 'text answer', [{ role: 'user', content: 'Say hello in five words.' }], []);
  await check(
    provider,
    'tool call',
    [{ role: 'user', content: 'Read lines 1 to 40 of src/Catalog.cs with the read_file tool.' }],
    [readFile],
  );
  write('Live check passed: paste this output into the pull request (G-04).');
}

const problem = usageError();
if (problem === undefined) {
  try {
    await main();
  } catch (error) {
    write(`Live check failed: ${error.code ?? ''} ${error.message}`);
    if (error.nextStep !== undefined) write(`Next step: ${error.nextStep}`);
    process.exitCode = 1;
  }
} else {
  write(problem);
  process.exitCode = 2;
}
