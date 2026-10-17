import type { ProviderKind } from '../ports/llm-provider.js';

// RF-143, ADR-006, DEC-16: whether sending code to a provider needs the run's consent, because the
// code would leave this machine. The fake never leaves the process. Ollama is local only when the
// host it connects to is this machine: a loopback name or address (`localhost`, 127.0.0.0/8, ::1)
// or the Docker host gateway `host.docker.internal` (the documented ROSETTA_OLLAMA_URL of the
// Compose setup); an Ollama server anywhere else is treated like a cloud provider. OpenAI,
// Anthropic and an OpenAI-compatible service (whose base URL must be public, RF-1104) always need
// consent. The host is the one the adapter connects to, never text from a request.

interface ConsentTarget {
  readonly kind: ProviderKind;
  /** The host the provider connects to (no scheme, path or port). */
  readonly endpointHost: string;
}

const thisMachineNames: readonly string[] = ['localhost', 'host.docker.internal', '::1', '[::1]'];
const loopbackIpv4 =
  /^127\.(?:25[0-5]|2[0-4]\d|1?\d?\d)\.(?:25[0-5]|2[0-4]\d|1?\d?\d)\.(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

// RF-143
export function isThisMachine(host: string): boolean {
  const name = host.toLowerCase();
  return thisMachineNames.includes(name) || loopbackIpv4.test(name);
}

// RF-143
export function needsCloudConsent(target: ConsentTarget): boolean {
  switch (target.kind) {
    case 'fake':
      return false;
    case 'ollama':
      return !isThisMachine(target.endpointHost);
    case 'openai':
    case 'openai-compatible':
    case 'anthropic':
      return true;
  }
}
