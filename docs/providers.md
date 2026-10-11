# Providers

| | |
|---|---|
| **Status** | Living (outline created by P1-24; each adapter card fills its section) |
| **Date** | 2026-10-11 |
| **Owner** | BlackLigth (blacklight0101) |
| **Related** | [ADR-003](adr/ADR-003-provider-swappable-agent-loop.md) - [ADR-008](adr/ADR-008-testing-with-recorded-responses.md) - [Architecture](architecture.md) sections 7 and 9 - [Data model](data-model.md) sections 3.1, 3.10 and 3.15 |

How to set up each AI provider Rosetta talks to, which models were tested and which are recommended (RF-400..RF-408,
DEC-09, DEC-106). The runbook row is in [environments and delivery](environments-and-delivery.md) section 14.

## 1. How every provider is used

- Every model call goes through the `LlmProvider` port (`src/application/ports/llm-provider.ts`): a system prompt,
  messages, tool definitions, the model, an optional output limit and temperature, the call context (run, agent task,
  role, call id, trace ids) and an abort signal; the answer is text, tool calls, usage (input, output and cached input
  tokens, reported or estimated), a normalised finish reason, the provider's request id and the exact model version
  (RF-400, RNF-004).
- Adapters retry inside themselves (RF-406) and tell the port's attempt observer when each attempt starts and when one
  fails and will be retried, so the call log holds one record per attempt.
- The composition root wraps every adapter as `BudgetGuard(EgressGuard(ObservedProvider(adapter)))`. The
  `ObservedProvider` writes one `provider-calls.jsonl` record per attempt and the masked transcript of each agent task
  (RF-408, data-model.md sections 3.10 and 3.15).
- Every adapter passes the contract suite `tests/contracts/llm-provider.contract.ts`: its test arranges recordings so
  that each scenario of the suite (`text`, `tool-call`, `retry-then-text`, `permanent-failure`) answers with the
  normalised values of `contractScenarios`, and runs `llmProviderContract(name, factory)`.
- No automated test calls a real provider: the test setup sets `ROSETTA_TEST=1` and refuses every connection beyond
  this machine (`tests/support/block-network.ts`, RNF-005, ADR-008).

## 2. Ollama

To be filled by P1-25: setup on the host (`ROSETTA_OLLAMA_URL`), native and text tool modes, tested models, the
manual live check script.

## 3. OpenAI

To be filled by P1-26: key placement, tool calling, cached-token usage, the recommended `defaultRoles` model with its
dated id (DEC-106).

## 4. Anthropic

To be filled by P2-09: key placement, prompt caching, tested models.

## 5. OpenAI-compatible services

To be filled by P2-10: base URL rules (RF-1104), tested services.

## 6. Fake provider (tests only)

- `FakeProvider` (`src/infrastructure/providers/fake/fake-provider.ts`) replays a recording call by call and never
  touches the network. It refuses to start unless `ROSETTA_TEST=1` (`RST-1500`), so a project setting with
  `kind: fake` cannot run in a real deployment (DEC-112).
- A recording is JSON with `schemaVersion: 1`, a `description` and `calls`; each call lists its `attempts`, and every
  attempt but the last is a `failure` (`{ code, httpStatus?, requestId? }`) the adapter retried. The last attempt is a
  `response` (the port's answer shape) or a `failure` that ends the call. `loadRecording` parses a file with its zod
  schema and refuses an invalid one with `RST-1502`; a call beyond the end of the recording fails with `RST-1503`.
- Recordings live under `tests/recordings/<provider>/`, hold no key or secret, say in `description` how they were made
  and are reviewed like code (ADR-008).
