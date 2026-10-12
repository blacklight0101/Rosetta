import { llmProviderContract } from '../../../../contracts/llm-provider.contract.js';
import { useFakeAnthropic } from '../../../../support/anthropic-harness.js';

// RF-400, RF-404, ADR-008: the Anthropic adapter passes the LlmProvider contract against a fake
// Anthropic server replaying tests/recordings/anthropic/contract-<scenario>.json. Anthropic
// reports cached input tokens, so the full contract applies.

const start = useFakeAnthropic();

llmProviderContract(
  'AnthropicProvider against a fake Anthropic server',
  async (scenario) => (await start(`contract-${scenario}`)).provider,
);
