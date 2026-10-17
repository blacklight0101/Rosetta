// RF-301, DEC-57 (judge hygiene): a model tends to agree with text written by a model of its own
// family (self-preference), so a run whose `verifier` uses the `reader`'s family is warned. The
// family of a model id is read from the id alone, whichever provider serves it: its last path part
// (`meta-llama/Llama-3.1-8B` -> `Llama-3.1-8B`), in lower case, without a fine-tune prefix
// (`ft:gpt-4o-mini:org::x`) or a Bedrock-style vendor prefix (`us.anthropic.claude-...`,
// `meta.llama3-...`), up to its first character that is not a letter (`gemma4:e4b` -> `gemma`,
// `gpt-4o-mini` -> `gpt`, `claude-sonnet-4-5` -> `claude`). OpenAI's other names (`o1`, `o3`,
// `o4-mini`, `chatgpt-4o-latest`, `davinci-002`, `babbage-002`) are the `gpt` family. An id that does
// not start with a letter is its own family.

const openAiReasoning = /^o\d/u;
const leadingLetters = /^[a-z]+/u;
const fineTuned = /^ft:/u;
const vendorPrefix =
  /^(?:[a-z]{2,4}\.)?(?:anthropic|meta|amazon|cohere|mistral|ai21|deepseek|qwen|writer|openai)\./u;
const openAiNames: ReadonlySet<string> = new Set(['chatgpt', 'davinci', 'babbage']);

/** The family name of a model id, for the self-preference check. */
// RF-301
export function modelFamilyOf(model: string): string {
  const last = (model.trim().split('/').at(-1) ?? '').toLowerCase();
  const name = last.replace(fineTuned, '').replace(vendorPrefix, '');
  if (openAiReasoning.test(name)) return 'gpt';
  const family = leadingLetters.exec(name)?.[0] ?? name;
  return openAiNames.has(family) ? 'gpt' : family;
}

/** Whether two model ids belong to one family (RF-301: the reader and the verifier). */
// RF-301
export function sameModelFamily(first: string, second: string): boolean {
  return modelFamilyOf(first) === modelFamilyOf(second);
}
