// RF-401, G-04: manual live check of the Ollama adapter against the owner's Ollama. Never run by
// tests or CI (ADR-008). Usage, after `npm run build`:
//   node scripts/ollama-live-check.mjs <model> [native|text]
// The Ollama URL is ROSETTA_OLLAMA_URL (default http://127.0.0.1:11434). The prompts are fixed and
// synthetic: no repository content and no secret leaves this script. Ollama is local and free, so
// the budget and egress guards (not built yet) are not involved.
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const [model, toolMode = 'native'] = process.argv.slice(2);
const write = (line) => process.stdout.write(`${line}\n`);

function usageError() {
  if (model === undefined || !['native', 'text'].includes(toolMode)) {
    return 'Usage: node scripts/ollama-live-check.mjs <model> [native|text]';
  }
  if (process.env.ROSETTA_TEST === '1') {
    return 'ROSETTA_TEST=1 is set: the live check calls a real Ollama, so unset it first.';
  }
  return undefined;
}

const load = (path) => import(pathToFileURL(join(root, 'dist', path)).href);
const { OllamaProvider } = await load('infrastructure/providers/ollama/ollama-provider.js');
const { loadTextToolProtocol } = await load(
  'infrastructure/providers/ollama/text-tool-protocol-file.js',
);

async function createProvider() {
  return new OllamaProvider({
    baseUrl: process.env.ROSETTA_OLLAMA_URL ?? 'http://127.0.0.1:11434',
    toolMode,
    timeoutSeconds: 300,
    maxRetries: 3,
    textProtocolPrompt: await loadTextToolProtocol(join(root, 'prompts')),
    testMode: false,
    // DEC-114: the context-size warnings, printed as they come.
    logger: {
      log: (record) => {
        write(`[${record.level}] ${record.message}`);
        return Promise.resolve();
      },
      securityEvent: (code, detail) => {
        write(`[security] ${code} ${detail.message}`);
        return Promise.resolve();
      },
    },
  });
}

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
    maxOutputTokens: 512,
    signal: AbortSignal.timeout(600_000),
  });
  write(`## ${name}`);
  write(JSON.stringify(response, null, 2));
}

async function main() {
  const provider = await createProvider();
  await check(provider, 'text answer', [{ role: 'user', content: 'Say hello in five words.' }], []);
  await check(
    provider,
    `tool call (${toolMode})`,
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
