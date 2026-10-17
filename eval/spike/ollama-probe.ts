import { z } from 'zod';
import { endpointOf } from '../../src/infrastructure/providers/provider-endpoint.js';

// Q-04, Q-10, RF-401: before the spike calls any model it asks the Ollama server which models are
// pulled (`GET /api/tags`, no model is run and nothing is downloaded). A server that is not
// running, or a candidate that is not pulled, ends the spike with the command the owner must run.
// The spike talks only to a server on this machine (DEC-118), like every Ollama call.

const tagsSchema = z.object({ models: z.array(z.object({ name: z.string() })) });
const probeTimeoutMs = 10_000;

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export type OllamaProbe =
  | { readonly ok: true; readonly baseUrl: string; readonly pulled: readonly string[] }
  | { readonly ok: false; readonly message: string };

const loopback = new Set(['localhost', '127.0.0.1', '[::1]', 'host.docker.internal']);

function isLocal(host: string): boolean {
  return loopback.has(host) || host.startsWith('127.');
}

function failure(message: string): OllamaProbe {
  return { ok: false, message };
}

/** The models Ollama has pulled, or why the spike cannot run. */
export async function probeOllama(url: string, fetchTags: Fetch): Promise<OllamaProbe> {
  const endpoint = endpointOf(url);
  if (!endpoint.ok) return failure(`ROSETTA_OLLAMA_URL is not an http(s) URL: ${url}`);
  const { baseUrl, host } = endpoint.value;
  if (!isLocal(host)) {
    return failure(`The spike calls only an Ollama on this machine, not ${host}.`);
  }
  const unreachable = failure(
    `Ollama is not reachable at ${host}. Start it with: ollama serve (or open the Ollama app), and check ROSETTA_OLLAMA_URL.`,
  );
  try {
    const response = await fetchTags(`${baseUrl}/api/tags`, {
      redirect: 'error',
      signal: AbortSignal.timeout(probeTimeoutMs),
    });
    if (!response.ok) return unreachable;
    const parsed = tagsSchema.safeParse(await response.json());
    if (!parsed.success)
      return failure('Ollama answered /api/tags in a form this spike does not know.');
    return { ok: true, baseUrl, pulled: parsed.data.models.map((model) => model.name) };
  } catch {
    return unreachable;
  }
}

/** The `ollama pull` commands for the candidates the server does not have. */
export function pullCommands(models: readonly string[], pulled: readonly string[]): string[] {
  const has = (model: string): boolean =>
    pulled.some((name) => name === model || name === `${model}:latest`);
  return models.filter((model) => !has(model)).map((model) => `ollama pull ${model}`);
}
