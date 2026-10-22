# Stream recordings

Server-sent-event streams of the OpenAI (Chat Completions with `stream_options.include_usage`) and Anthropic
(Messages with `stream: true`) APIs, replayed by `tests/support/stream-recording.ts` through the `fetch` option of the
adapters (ADR-008, Q-60). A frame is one event; `delayMs` waits before it (on the fake clock of the test), `repeat` sends
it several times and `hang` never ends the stream. An exchange with `hang` and no frames never answers.

## Provenance (RNF-009)

Every file was written by hand for this repository by the Rosetta contributors, in the documented shape of the
streamed events. No real model was called and no real key is held: ids carry `FAKE`, and the model name is a made-up
value. None of the text is copied from a provider's documentation or from a real conversation. Each file says so in its
`description` field. Nothing here comes from the owner's employer (DEC-03).
