# OpenAI recordings

Canned answers of OpenAI's Chat Completions API (`POST /v1/chat/completions`, `stream: false`) for the fake OpenAI
server (`tests/support/fake-openai-server.ts`) and the adapter tests (ADR-008). One file per scenario: text, tool
call, invalid arguments, length cut-off, refusal, quota exhausted, retry-after, server errors and so on.

## Provenance (RNF-009)

Every file was written by hand for this repository by the Rosetta contributors, in the documented shape of the API
answer, and is covered by the repository's MIT licence. No real model was called and no real key is held: ids carry
`FAKE`, and the model name is a made-up value. None of the text is copied from a provider's documentation or
from a real conversation. Each file says so in its `description` field.

A recording captured from a real call would be a different thing: it would be made in record mode (ADR-008), scrubbed
of keys and reviewed like code, and it would be listed here with its date and the model it came from.

Nothing here comes from the owner's employer (DEC-03).
