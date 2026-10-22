# OpenAI-compatible recordings

Canned answers of an OpenAI-compatible Chat Completions API (`POST <base URL>/chat/completions`, `stream: false`)
for the fake OpenAI server (`tests/support/fake-openai-server.ts`) and the `OpenAiCompatibleProvider` tests
(RF-403, ADR-008). One file per scenario of the contract suite, plus an unknown model, an account without credit and
two attempts that time out (Q-60).
They follow the shape compatible services such as OpenRouter, Groq or DeepSeek send: a vendor-prefixed model id, a
`gen-` answer id, an extra `provider` field the adapter ignores, a numeric error `code`, and a usage that may leave out
`prompt_tokens_details`.

## Provenance (RNF-009)

Every file was written by hand for this repository by the Rosetta contributors, in the documented shape of the API
answer, and is covered by the repository's MIT licence. No real service was called and no real key is held: ids
carry `FAKE`, and the model name is a made-up value. None of the text is copied from a provider's documentation or
from a real conversation. Each file says so in its `description` field.

Nothing here comes from the owner's employer (DEC-03).
