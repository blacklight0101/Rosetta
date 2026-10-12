// RF-404, G-04: manual live check of the Anthropic adapter with the owner's key. Never run by tests
// or CI (ADR-008). Usage: `npm run live:anthropic -- <model>`, which builds Rosetta and starts this
// script with `node --env-file=.env`, so ANTHROPIC_API_KEY comes from the owner's .env.
// The key is read here, by the script, and passed to the adapter, as the provider set does
// (P1-29). The prompts are fixed and synthetic: no repository content leaves this script. Four
// small calls: a text answer, a tool call, and the same long-prompt call twice, so the second one
// shows the prompt prefix read from the cache (cachedInputTokens above 0).
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const [model] = process.argv.slice(2);
const apiKey = process.env.ANTHROPIC_API_KEY ?? '';
const write = (line) => process.stdout.write(`${line}\n`);

function usageError() {
  if (model === undefined) return 'Usage: npm run live:anthropic -- <model>';
  if (apiKey === '') return 'Set ANTHROPIC_API_KEY in .env first.';
  if (process.env.ROSETTA_TEST === '1') {
    return 'ROSETTA_TEST=1 is set: the live check calls the real Anthropic API, so unset it first.';
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
const shortSystem = 'You are a careful assistant that reads source code before answering.';
// About 6 000 tokens, above the minimum prefix (512 to 4 096 tokens, by model) that is cached.
const longSystem = [
  shortSystem,
  ...Array.from(
    { length: 200 },
    (_, index) =>
      `Rule ${String(index + 1)}: cite the file and the line range of every statement you make about the code, and say so when the code does not show it.`,
  ),
].join('\n');

async function check(provider, name, { system, messages, tools }) {
  const response = await provider.complete({
    context,
    model,
    system,
    messages,
    tools,
    maxOutputTokens: 1024,
    signal: AbortSignal.timeout(300_000),
  });
  write(`## ${name}`);
  write(JSON.stringify(response, null, 2));
  return response;
}

async function main() {
  const { AnthropicProvider } = await load(
    'infrastructure/providers/anthropic/anthropic-provider.js',
  );
  const provider = new AnthropicProvider({
    apiKey,
    timeoutSeconds: 120,
    maxRetries: 3,
    testMode: false,
  });
  const hello = [{ role: 'user', content: 'Say hello in five words.' }];
  await check(provider, 'text answer', { system: shortSystem, messages: hello, tools: [] });
  const read = [
    { role: 'user', content: 'Read lines 1 to 40 of src/Catalog.cs with the read_file tool.' },
  ];
  await check(provider, 'tool call', { system: shortSystem, messages: read, tools: [readFile] });
  const long = { system: longSystem, messages: hello, tools: [readFile] };
  await check(provider, 'cache write', long);
  const cached = await check(provider, 'cache read', long);
  if (cached.usage.cachedInputTokens === 0) {
    write('Live check failed: the second long-prompt call read nothing from the cache.');
    process.exitCode = 1;
    return;
  }
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
