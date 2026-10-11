import { llmProviderContract } from '../../../../contracts/llm-provider.contract.js';
import { useFakeOllama } from '../../../../support/ollama-harness.js';

// RF-400, RF-401, ADR-008: the Ollama adapter passes the LlmProvider contract against a fake
// Ollama server replaying tests/recordings/ollama/contract-<scenario>.json. Ollama has no
// cached-input-token field, so its answers carry 0 there.

const start = useFakeOllama();

llmProviderContract(
  'OllamaProvider against a fake Ollama server',
  async (scenario) => (await start(`contract-${scenario}`)).provider,
  { reportsCachedInputTokens: false },
);
