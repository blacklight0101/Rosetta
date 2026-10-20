# Ollama recordings

Canned answers of Ollama's local API (`/api/chat`, `/api/tags`, `/api/show`, `/api/ps`, `stream: false`) for the fake
Ollama server (`tests/support/fake-ollama-server.ts`) and the adapter tests (ADR-008). One file per scenario: the
contract scenarios, a missing model, a cold load that runs out of memory, the prompt-size cases (`prompt-cut*`, an answer
whose prompt count is far below the prompt sent; `prompt-counted-full*`, one that agrees; DEC-155), and the context-window cases (fit, spill,
fallback, a `show` or `ps` call that fails or hangs).

## Provenance (RNF-009)

Every file was written by hand for this repository by the Rosetta contributors, in the documented shape of the API
answer, and is covered by the repository's MIT licence. No real model was called: model names and digests are
made-up values. None of the text is copied from Ollama's documentation or from a real conversation. Each file says so
in its `description` field.

A recording captured from a real call would be a different thing: it would be made in record mode (ADR-008), scrubbed
of keys and reviewed like code, and it would be listed here with its date and the model it came from.

Nothing here comes from the owner's employer (DEC-03).
