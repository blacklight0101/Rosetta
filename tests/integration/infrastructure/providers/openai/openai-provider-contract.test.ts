import { llmProviderContract } from '../../../../contracts/llm-provider.contract.js';
import { useFakeOpenAi } from '../../../../support/openai-harness.js';

// RF-400, RF-402, ADR-008: the OpenAI adapter passes the LlmProvider contract against a fake
// OpenAI server replaying tests/recordings/openai/contract-<scenario>.json. OpenAI reports cached
// input tokens, so the full contract applies.

const start = useFakeOpenAi();

llmProviderContract(
  'OpenAiProvider against a fake OpenAI server',
  async (scenario) => (await start(`contract-${scenario}`)).provider,
);
