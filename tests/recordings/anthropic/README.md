# Anthropic recordings

Canned answers of Anthropic's Messages API (`POST /v1/messages`, `stream: false`) for the fake Anthropic server
(`tests/support/fake-anthropic-server.ts`) and the adapter tests (ADR-008). One file per scenario: text, tool call,
cache write, refusal, overload then success, retry-after, exhausted credit, unknown model and so on.

## Provenance (RNF-009)

Every file was written by hand for this repository by the Rosetta contributors, in the documented shape of the API
answer, and is covered by the repository's MIT licence. No real model was called and no real key is held: ids carry
`FAKE`, and the model name is a made-up value. None of the text is copied from a provider's documentation or
from a real conversation. Each file says so in its `description` field.

A recording captured from a real call would be a different thing: it would be made in record mode (ADR-008), scrubbed
of keys and reviewed like code, and it would be listed here with its date and the model it came from.

Nothing here comes from the owner's employer (DEC-03).
