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
- No automated test calls a real provider: tests use the fake provider with recordings and the test setup sets
  `ROSETTA_TEST=1` (RNF-005, ADR-008).

## 2. Ollama

`OllamaProvider` (`src/infrastructure/providers/ollama/ollama-provider.ts`, RF-401) talks to Ollama's chat API
(`POST /api/chat`, `stream: false`) over `fetch`; there is no SDK.

### 2.1 Setup on the host

- Install Ollama on the machine that runs the models and pull the configured models (`ollama pull <model>`). On the
  owner's machine the program is in `E:\Ollama\app` and the models in `G:\Ollama Models` (DEC-53).
- Rosetta reaches Ollama only through `ROSETTA_OLLAMA_URL` (DEC-112): `http://host.docker.internal:11434` from the
  Compose container, `http://127.0.0.1:11434` when Rosetta runs on the host. Unset when hosted.
- When Ollama is not running, a call fails at once with `RST-1507` and the message names the fix (`ollama serve`, or
  open the Ollama app, and check `ROSETTA_OLLAMA_URL`). When the model is not pulled, it fails with `RST-1508` and
  the message names `ollama pull <model>`. Neither is retried.

### 2.2 What every call sends and reads

- Each call first reads the model's digest from `GET /api/tags` (once per model and provider instance); the digest
  is the response's `modelVersion` (RNF-004). A model name without a tag matches `<name>:latest`.
- `options.num_ctx` is sent on every call: Ollama's own default context of recent models overflows an 8 GB GPU and
  spills the model to the CPU. The adapter option `contextTokens` sets it; the default is 32 768 (an open question
  until a project setting names it). `num_predict` carries `maxOutputTokens` and `temperature` the role's temperature.
- `think: false` is sent by default (adapter option `think`): on the owner's machine the tool loop was about ten
  times faster with thinking off and as correct. Models that ignore it (for example gpt-oss, deepseek-r1) still
  think; their `thinking` field and any `<think>...</think>` text in the content never reach the answer.
- Usage: `prompt_eval_count` and `eval_count` are the input and output tokens (`usageSource: reported`); Ollama has
  no cached-input-token count, so it is 0. When Ollama leaves the counts out (it may for a fully cached prompt) they
  are estimated at about four characters per token and marked `estimated` (RF-421).
- The call log record gets Ollama's `load_duration`, `prompt_eval_duration` and `eval_duration` in milliseconds and
  the generation speed in tokens per second (`eval_count` over `eval_duration`) (RF-408). Ollama returns no request
  id.
- Finish reason: `tool_use` when the answer holds tool calls, `length` for `done_reason: length`, otherwise `stop`.

### 2.3 Tool modes (RF-205)

- `toolMode: native` (default): the tools go in the request's `tools` field and Ollama returns `tool_calls`. A model
  without tool support answers 400; the adapter fails with `RST-1510`, whose next step is to set `toolMode: text`.
- `toolMode: text`: no `tools` field is sent. The versioned prompt `prompts/shared/text-tool-protocol.v1.md` is
  appended to the system prompt with the tool definitions in place of `{{tools}}`; the model answers with one
  fenced `tool_call` block per call holding `{"name": ..., "arguments": {...}}`. Earlier tool calls go back as
  `tool_call` blocks in the assistant message and tool results as `tool_result` blocks (`{"id", "content"}`) in a
  user message, because such models drop tool messages. A `json` block or a whole answer that holds nothing but
  `name` and `arguments` is read as a call too; any other block, including one that is not valid JSON, stays text.
- Both modes pass the same validation (`tool-call-shape.ts`): a non-empty tool name and an arguments object (a JSON
  string is parsed); a call that fails it stays visible as text. Calls are numbered `call-1`, `call-2`, ... per
  answer. What the arguments mean is judged by the agent loop with each tool's schema (ADR-013): line numbers sent
  as numeric strings, a non-breaking hyphen in a `start-end` range, an unknown tool name and an invented path all
  reach the loop unchanged, exactly as the same native call would.
- The composition root reads the protocol prompt with `loadTextToolProtocol(<prompts folder>)`.

### 2.4 Retries (RF-406)

Each attempt has its own timeout (`timeoutSeconds`). Rate limits (429), timeouts, server errors (5xx, including a
cold load that fails with an out-of-memory 500) and a connection dropped mid-answer are retried up to `maxRetries`
times with exponential back-off from one second, doubled per retry and capped at 30 seconds, with jitter (half to
all of the delay), and never shorter than a `retry-after` hint in seconds (capped at five minutes). Other errors and
a cancelled call (`RST-1501`) are not retried.

### 2.5 Tests and the manual live check

- Automated tests never call a real Ollama (ADR-008): under `ROSETTA_TEST=1` the adapter refuses every call with
  `RST-1509` unless it was built for a loopback fake server (`fakeServer: true`), which only tests do. The tests run
  the adapter against `tests/support/fake-ollama-server.ts`, which replays the hand-written recordings under
  `tests/recordings/ollama/`, and run the contract suite on it.
- Manual live check (gate G-04), on the machine that runs Ollama, with `ROSETTA_TEST` unset:

  ```text
  npm run live:ollama -- <model> native
  npm run live:ollama -- <model> text
  ```

  It builds Rosetta, then makes two calls with fixed synthetic prompts (a short text answer and one `read_file` tool
  call) and prints both answers, or the error code and its next step. Paste the output into the pull request.

### 2.6 Tested models

To be filled by the reader model spike (P1-47, Q-04). Measured so far on the owner's machine (8 GB GPU):
`gemma4:e4b` was the best reader with `think: false`.

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
