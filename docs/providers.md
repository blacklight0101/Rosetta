# Providers

|             |                                                                                                                                                                                                                                  |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**  | Living (outline created by P1-24; each adapter card fills its section)                                                                                                                                                           |
| **Date**    | 2026-10-12                                                                                                                                                                                                                       |
| **Owner**   | BlackLigth (blacklight0101)                                                                                                                                                                                                      |
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
- The `EgressGuard` (`src/infrastructure/guards/egress-guard.ts`) sends code without the run's consent only to a
  provider on this machine (RF-143, `needsCloudConsent` in `src/application/providers/cloud-consent.ts`): `fake`
  always, and `ollama` only when the host it connects to is `localhost`, a loopback address (127.0.0.0/8, `::1`) or
  the Docker host gateway `host.docker.internal` (the documented `ROSETTA_OLLAMA_URL`). An Ollama server on any other
  host needs the run's consent like `openai`, `openai-compatible` (its base URL must be public) and `anthropic`;
  without it the call is refused with `RST-1515`. The guard's `target.endpointHost` and the URL the adapter connects to
  must come from one parsed URL (`new URL(ROSETTA_OLLAMA_URL).hostname`, so `http://localhost@evil.com` gives
  `evil.com`); the provider factory (`provider-endpoint.ts`) builds both from that one parse and tests it. The guard masks every message part, writes `egress.log.jsonl` and
  refuses repository content outside its data blocks (RF-141, RF-142, RF-145, architecture section 7).
- `FakeProvider.requests` keeps every request the fake received, so a test can prove what was (and was not) sent.
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
  Compose container, `http://127.0.0.1:11434` when Rosetta runs on the host. Unset when hosted. A URL with a user
  name or password (`http://user:pass@...`) is refused at start-up with `RST-1000`.
- When Ollama is not running, a call fails at once with `RST-1507` and the message names the fix (`ollama serve`, or
  open the Ollama app, and check `ROSETTA_OLLAMA_URL`). When the model is not pulled, it fails with `RST-1508` and
  the message names `ollama pull <model>`. Neither is retried.
- A run that uses an `ollama` provider checks it before its first agent task (RF-401, P1-72): one tiny call goes
  through the guards to each Ollama provider and model of the run, once each. A stopped server or a missing model
  then ends the run with `RST-1507` or `RST-1508`, and the run log holds the fix as the next step; no agent task
  starts. A stop of the run during the check ends it as interrupted.

### 2.2 What every call sends and reads

- Each call first reads the model's digest from `GET /api/tags` (once per model and provider instance); the digest
  is the response's `modelVersion` (RNF-004). A model name without a tag matches `<name>:latest`.
- Every request to Ollama is sent with `redirect: 'error'`: a redirect answer fails the attempt and its `Location` is
  never called, so an answer cannot send the call, with the prompt and the code in it, to another address (ADR-013).
- `options.num_ctx` is sent on every call: Ollama's own default context of recent models overflows an 8 GB GPU and
  spills the model to the CPU. The adapter option `contextTokens` (project setting `providers.<name>.contextTokens`,
  wired by P1-18) is `auto` (default) or a number of at least 1 024; a smaller number is refused with `RST-1514`.
  The project settings page and the Default models page set it as "Ollama context size": Auto, or 4 096 (the floor
  of the automatic choice) to 131 072 tokens, one value for the provider entry and so for every Ollama role (Q-44).
  The pages cannot ask Ollama for the trained context of a model, so the upper bound is fixed.
  `num_predict` carries `maxOutputTokens` and `temperature` the role's temperature.
- Context size `auto` (DEC-114, Q-23), resolved once per server and model digest and cached for the process;
  concurrent first calls share one resolution. Start at the smaller of the model's trained context
  (`/api/show` `model_info` `*.context_length`) and the ceiling `CONTEXT_CEILING` = 32 768. Load the model with
  `POST /api/generate` without a prompt at that size, read `/api/ps`, and while `size_vram` is below `size` halve the
  size, down to the floor `CONTEXT_FLOOR` = 4 096. If the floor still spills, use it and log one warning. A model
  whose trained context is below the ceiling never gets more. If a probe fails before any size spilled, the start
  size is sent (the ceiling when `/api/show` itself fails or answers something Rosetta cannot read); if it fails
  after a size spilled, no size is known to fit, so the floor is sent and never the size that spilled. Either way a
  warning is logged and the fallback is reused for a back-off of 30 seconds (`FALLBACK_BACKOFF_MS`), retried attempts
  included, before Ollama is probed again. `/api/show` and `/api/ps` have a probe timeout of 10 seconds
  (`PROBE_TIMEOUT_MS`, never more than the call timeout), so a hanging server costs at most that; a model load keeps
  the call timeout. A caller that stops while a measurement it shares is running ends at once as cancelled
  (`RST-1501`) and the measurement goes on for the other callers. A fixed number is sent unchanged; one warning is logged if `/api/ps` shows
  the model partly on the CPU; that check after the first call ends at once when the caller stops. The call log records `contextTokens` and `contextSource` (`auto-fit`, `auto-floor`,
  `auto-model-limit`, `auto-fallback`, `fixed`; data-model section 3.10). Probe answers are capped at 4 MiB.
- A prompt that does not fit the context fails with `RST-1522` for every role (DEC-155, ollama-prompt-guard.ts). The
  prompt is estimated at about four characters per token (RF-421) from every message sent, the tool calls in them and
  the tool definitions (the text protocol prompt counts in `text` mode). Before the call: when the estimate plus
  `maxOutputTokens` (0 when the call has none) is larger than the `num_ctx` sent, nothing is sent and the call fails;
  the estimate has no margin of its own, because it is rough in both directions. After the call: when the estimate is
  over `num_ctx` and `prompt_eval_count` is below 70 percent of the estimate, Ollama cut the prompt; the answer is
  dropped and the call fails. A prompt whose estimate fits never fails after the call, whatever the count: Ollama
  counts only the tokens it evaluated anew when its KV cache serves a prefix (a multi-turn reader), so a small count
  is no sign of a cut. The check before the call already refuses every estimate over the context, so through the adapter the check after
  it cannot fire today (it is unit-tested on its own); it stays so a cut is never passed on as an answer if the
  check before the call is ever relaxed. Neither failure is retried. The message names the role, the model, the
  estimated input, the output reserve (or the tokens Ollama read), the context size and the remedies (a model with a
  larger context, a cloud model for the role in the project settings, or a larger Ollama context size in the project settings); it never holds
  prompt text. The budget guard frees the reservation of a refused call (no ledger row) and writes a row with the
  reported tokens for a cut one. Splitting a large planner input to fit a small context is not done in release 1.
- `think: false` is sent by default (adapter option `think`): on the owner's machine the tool loop was about ten
  times faster with thinking off and as correct. Models that ignore it (for example gpt-oss, deepseek-r1) still
  think; their `thinking` field and any thinking text in the content never reach the answer. The content is
  stripped in one pass over the tags, so the time grows linearly with its size: `<think>` and `<thinking>` and their
  closing tags in any letter case; an opening tag hides the text up to the next closing tag, or to the end when none
  follows; a closing tag without an opening tag hides all the text before it (the chat template sent the opening
  tag).
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
  `tool_call` blocks in the assistant message and tool results as `tool_result` blocks in a
  user message, because such models drop tool messages. A `tool_result` block is the line `id: <call id>`, the line
  `content:` and the result text as it is, so the lines of its data-block frame (RF-145, DEC-129) reach the model as
  lines, with the opening and closing marker and their tag each alone on a line; the block's fence is longer than any
  run of backticks in the result. The native mode and the OpenAI adapter send the result text unchanged as the
  content of the tool message. A `json` block or a whole answer that holds nothing but
  `name` and `arguments` is read as a call too; any other block, including one that is not valid JSON, stays text.
- The answer is read in one pass, so the time grows linearly with its size: a block opens at three backticks, a label
  of letters, digits, `_` or `-`, optional spaces and a line break, and closes at the next three backticks; when an
  opening fence has no closing one the rest of the answer is text. Only a `tool_call`, `json` or unlabelled block is
  parsed, and only when its body starts with `{` and ends with `}` (a call is always an object).
- Both modes pass the same validation (`tool-call-shape.ts`): a non-empty tool name and an arguments object (a JSON
  string is parsed); a call that fails it stays visible as text. Calls are numbered `call-1`, `call-2`, ... per
  answer. What the arguments mean is judged by the agent loop with each tool's schema (ADR-013): line numbers sent
  as numeric strings, a non-breaking hyphen in a `start-end` range, an unknown tool name and an invented path all
  reach the loop unchanged, exactly as the same native call would.
- The composition root reads the protocol prompt with `loadTextToolProtocol(<prompts folder>)`, which returns the
  prompt file (`name`, `version`, `sha256` of its bytes, `text`) and passes its `text` to the adapter. An understand
  run whose roles use an `ollama` provider with `toolMode: text` records the file's `version` and `sha256` under
  its name (`shared/text-tool-protocol.v1.md`) in the manifest's `promptVersions`, next to the reader's prompt files
  (RNF-004).

### 2.4 Retries (RF-406)

Each attempt has its own timeout (`timeoutSeconds`). Rate limits (429), timeouts, server errors (5xx, including a
cold load that fails with an out-of-memory 500) and a connection dropped mid-answer are retried up to `maxRetries`
times with exponential back-off from one second, doubled per retry and capped at 30 seconds, with jitter (half to
all of the delay), and never shorter than a `retry-after` hint (seconds or an HTTP date) (capped at five minutes). Other errors and
a cancelled call (`RST-1501`) are not retried.

### 2.5 Tests and the manual live check

- Automated tests never call a real Ollama (ADR-008): under `ROSETTA_TEST=1` the adapter refuses every call with
  `RST-1509` unless its base URL is a loopback address whose port a fake server registered when it started
  (`src/infrastructure/providers/fake-server-ports.ts`, written only through `tests/support/fake-server-registration.ts`); no adapter option can vouch for a URL. The tests run
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

**The spike (P1-47, Q-04).** `eval/spike/score-reader.ts` runs one reader task over one demo area (the `Services` area
of the `webforms-csharp` fixture by default) with each candidate model through Ollama and the guarded provider factory,
with the shipped prompts, tools and limits of an understand run. It scores, per model, the valid cards (cards the final
answer parsed into), the valid citations (claims whose citations all name a file of the code map and a line range inside
it, the verifier's own check), the tool-call errors and the time. The candidates, at most four 7-9B tool-calling models
that fit 8 GB of VRAM, are `gemma4:e4b`, `qwen3:8b`, `llama3.1:8b` and `qwen2.5-coder:7b`; `--models a,b` replaces them.
The script never downloads a model: when Ollama is not running, or a candidate is not pulled, it stops and prints the
command to run (`ollama serve`, `ollama pull <model>`).

Owner's run (gate G-04), on the machine that runs Ollama, with `ROSETTA_TEST` unset:

```text
ollama pull gemma4:e4b
ollama pull qwen3:8b
ollama pull llama3.1:8b
ollama pull qwen2.5-coder:7b
npm run spike:reader
```

It prints the results table below with the date and the recommended model. Paste it here, record the answer to Q-04 as
a DEC row, and set `roles.reader.model` of `templates/project-settings.json` to the chosen model (it is
`gemma4:e4b` until then). The same run checks RNF-011: with the snapshot cached and the network to GitHub and the
cloud providers off, a scan and an understand run must complete with Ollama only.

| Model                                    | Ended | Valid cards | Valid citations | Tool-call errors | Turns | Seconds |
| ---------------------------------------- | ----- | ----------- | --------------- | ---------------- | ----- | ------- |
| Not run yet: waiting for the owner's run |       |             |                 |                  |       |         |

## 3. OpenAI

`OpenAiProvider` (`src/infrastructure/providers/openai/openai-provider.ts`, RF-402) calls the Chat Completions API
(`POST /v1/chat/completions`, `stream: false`) through the `openai` package (baseline in
[environments and delivery](environments-and-delivery.md) section 7). The package is imported only under
`src/infrastructure/providers/openai/`; the dependency-cruiser rule `openai-sdk-only-in-openai-adapter` enforces it (ADR-003).

### 3.1 Key placement

- The adapter never reads the environment. The provider factory (P1-29) chooses the key for each run, the user's own key
  or the server key `OPENAI_API_KEY` when the user may use server keys (DEC-64), and passes it to the adapter as
  `apiKey`. Organisation, project, admin key, webhook secret, base URL and log level are passed explicitly, so the
  package's own environment defaults (`OPENAI_API_KEY`, `OPENAI_ORG_ID`, `OPENAI_BASE_URL`, `OPENAI_LOG` and the
  rest) never apply, and the adapter's fetch sends only the headers Rosetta means to send, so
  `OPENAI_CUSTOM_HEADERS` is dropped too.
- The key goes only into the `Authorization` header. OpenAI's error text, which can quote part of the key, is never
  copied into an error, its cause, a log or the call log (RNF-003).

### 3.2 What every call sends and reads

- The system prompt is the first message (`role: system`); earlier tool calls go back in the assistant message's
  `tool_calls` with their ids and JSON-string arguments, and each tool result answers its call by `tool_call_id`.
  Tools go in `tools` as functions; no `tools` field when the call has none.
- `maxOutputTokens` is sent as `max_completion_tokens` (the older `max_tokens` is refused by reasoning models);
  `temperature` only when the role sets one. Reasoning models such as the GPT-5 family accept only the default
  temperature, so leave it unset for them; their reasoning tokens count in the output tokens.
- Tool calls keep the ids OpenAI gave them. A call whose arguments are not a JSON object stays visible as text, like
  the Ollama native mode (`tool-call-shape.ts`). A refusal is returned as the answer text.
- Usage (`usageSource: reported`): `inputTokens` is `prompt_tokens`, which **includes** the cached tokens;
  `cachedInputTokens` is `prompt_tokens_details.cached_tokens`, 0 when OpenAI leaves it out; `outputTokens` is
  `completion_tokens`. OpenAI caches prompt prefixes of 1024 tokens or more by itself. An answer without usage is
  estimated at about four characters per token and marked `estimated` (RF-421); so is a usage that leaves out one of the two counts (the missing count is estimated).
- `modelVersion` is the answer's `model`, the dated model id (for example `gpt-5-nano-2025-08-07`, RNF-004);
  `requestId` is the `x-request-id` header, also kept on failed attempts for the call log (RF-408).
- Finish reason: `tool_use` when the answer holds tool calls, `length` for `finish_reason: length`, otherwise `stop`
  (including `content_filter`).
- An answer is read with a size limit (8 MiB, adapter option `maxResponseBytes`); a larger one, or a body that is not
  a chat completion, fails with `RST-1506` and is not retried.
- The adapter's fetch is sent with `redirect: 'error'`: a redirect answer fails the call and its `Location` is never
  called, so an answer cannot send the key and the prompt to another address (ADR-013).

### 3.3 Retries and permanent errors (RF-406)

The package's own retries are off; the adapter uses the retry loop it shares with Ollama
(`src/infrastructure/providers/retrying-call.ts`), so every attempt reaches the attempt observer and the call log.
Each attempt has its own timeout (`timeoutSeconds`) and the caller's abort signal.

| Failure                                                                                                              | Code       | Retried                                                                            |
| -------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------- |
| 429 rate limit                                                                                                       | `RST-1504` | yes, never sooner than `retry-after-ms`, else `retry-after` (seconds or HTTP date) |
| timeout of an attempt, or 408                                                                                        | `RST-1505` | yes                                                                                |
| 5xx, or a failed connection                                                                                          | `RST-1506` | yes                                                                                |
| 401 rejected key                                                                                                     | `RST-1511` | no; the message names the fix (account settings or `OPENAI_API_KEY`)               |
| key refused before any call (empty, spaces, control characters, a no-break space U+00A0 or a character above U+00FF) | `RST-1511` | no call is made; the message holds no part of the key and names no fix             |
| 404 `model_not_found`                                                                                                | `RST-1512` | no; the message names the model                                                    |
| 429 `insufficient_quota` (no credit)                                                                                 | `RST-1513` | no; the message names the billing settings                                         |
| any other 4xx (for example 400 `context_length_exceeded`, 403)                                                       | `RST-1506` | no                                                                                 |
| cancelled by the caller                                                                                              | `RST-1501` | no                                                                                 |

The back-off is the same as Ollama's (section 2.4): from one second, doubled per retry, capped at 30 seconds, with
jitter, never shorter than the hint (capped at five minutes), up to `maxRetries` retries.

### 3.4 Tests and the manual live check

- Automated tests never call OpenAI (ADR-008): under `ROSETTA_TEST=1` the adapter refuses every call with
  `RST-1509` unless its base URL is a loopback address whose port a fake server registered (section 2.5). The tests
  run it against
  `tests/support/fake-openai-server.ts`, which replays the hand-written recordings under `tests/recordings/openai/`
  with a FAKE key, and run the contract suite on it.
- Manual live check (gate G-04), with `ROSETTA_TEST` unset and the owner's key in `OPENAI_API_KEY` (exported, or in the repository `.env`, which the script loads itself; an exported key wins):

  ```text
  npm run live:openai -- gpt-5-nano
  ```

  The model argument is required: without it the script exits with status 2 and prints the usage line.

  It builds Rosetta, then makes two calls with fixed synthetic prompts (a short text answer and one `read_file` tool
  call) and prints both answers, with the dated model id, the request id and the usage, or the error code and its
  next step. Paste the output into the pull request.

### 3.5 Recommended model (DEC-106)

The cheapest current OpenAI model with tool calling, checked on OpenAI's pricing and model pages on 2026-10-11, is
**`gpt-5-nano`**, dated id **`gpt-5-nano-2025-08-07`**: USD 0.05 per million input tokens, 0.005 cached input, 0.40
output (standard tier). It supports function calling on Chat Completions. It is the recommended `defaultRoles` value
for every role of the hosted deployment until the reader model spike (P1-47) shows a role needs a stronger model;
OpenAI recommends `gpt-5.6-luna` (0.20 / 0.02 / 1.20) as the next step up. Prices change: the price table
`prices/default-prices.yaml` (data-model.md section 3.18) is the source for cost figures, not this section.

## 4. Anthropic

`AnthropicProvider` (`src/infrastructure/providers/anthropic/anthropic-provider.ts`, RF-404) calls the Messages API
(`POST /v1/messages`, `stream: false`) through the `@anthropic-ai/sdk` package (baseline in
[environments and delivery](environments-and-delivery.md) section 7). The package is imported only under
`src/infrastructure/providers/anthropic/`; the dependency-cruiser rule `anthropic-sdk-only-in-anthropic-adapter`
enforces it (ADR-003). The adapter builder builds it for kind `anthropic` only when the provider factory chose a key,
so every call passes `BudgetGuard(EgressGuard(ObservedProvider(adapter)))` and needs the run's cloud consent.

### 4.1 Key placement

- The adapter never reads the environment. The provider factory (P1-29) chooses the key for each run, the user's own
  key or the server key `ANTHROPIC_API_KEY` when the user may use server keys (DEC-64), and passes it to the adapter
  as `apiKey`. The auth token, webhook key, base URL and log level are passed explicitly, so the package's own
  environment defaults (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_LOG`, profiles
  and the rest) never apply, and the adapter's fetch sends only the headers Rosetta means to send, so
  `ANTHROPIC_CUSTOM_HEADERS` is dropped too.
- The key goes only into the `x-api-key` header. A key that is empty or holds a space or control character is refused
  when the adapter is built (`RST-1518`). Anthropic's error text is never copied into an error, its cause, a log or
  the call log (RNF-003).

### 4.2 What every call sends and reads

- The system prompt goes in `system` as one text block; tools go in `tools` with their JSON Schema as `input_schema`;
  no `tools` field when the call has none. Earlier tool calls go back as `tool_use` blocks of the assistant turn with
  their ids and object input; the tool results answer them as `tool_result` blocks of the next user turn. Consecutive
  tool results, and a user message after them, share one user turn; an assistant turn of tool calls only has no empty
  text block.
- `maxOutputTokens` is sent as `max_tokens`, which Anthropic requires; a call without it is refused with `RST-1603`
  before anything is sent (every role sets it, RF-422). `temperature` only when the role sets one. Thinking and
  effort are not sent, so each model runs with its own default.
- **Prompt caching (RF-404).** The stable prompt prefix is marked with two of the four cache breakpoints Anthropic
  allows, both `{ "type": "ephemeral" }` (five minutes): the system prompt block, which caches the tools rendered
  before it, and the last block of the last message, because an agent task's conversation is append-only and that
  prefix repeats unchanged in the task's next call. A prefix shorter than the model's minimum (512 to 4 096 tokens,
  by model) is not cached and costs nothing extra.
- Usage (`usageSource: reported`): Anthropic's `input_tokens` counts only the tokens after the last breakpoint, so
  the port's `inputTokens` is `input_tokens + cache_read_input_tokens + cache_creation_input_tokens` and **includes**
  the cached tokens, as for OpenAI; `cachedInputTokens` is `cache_read_input_tokens`; `cacheWriteInputTokens` is
  `cache_creation_input_tokens` (left out when zero); `outputTokens` is `output_tokens`. Anthropic bills a cache
  write at 1.25 times the input price, so the budget guard prices the written tokens at the model's
  `cacheWriteInputPerMillionMicros` and reserves every prompt token at the highest of the input, cached input and
  cache-write prices; an Anthropic model without a cache-write price is handled as a model missing from the price
  table (RST-1601, or an unknown cost with `allowUnpriced` on the user's own key; RF-427); the ledger keeps the
  written tokens and their cost (data-model.md sections 3.18 and 4, P2-16). An answer without usage is estimated and
  marked `estimated` (RF-421).
- Tool calls keep the `tool_use` ids Anthropic gave them. A call whose input is not a JSON object stays visible as
  text (`tool-call-shape.ts`). The text blocks are joined with a newline; thinking blocks are not read. A refusal
  (`stop_reason: refusal`) is returned as the answer text with finish reason `stop`.
- `modelVersion` is the answer's `model`; `requestId` is the `request-id` header, also kept on failed attempts for
  the call log (RF-408).
- Finish reason: `tool_use` when the answer holds tool calls, `length` for `stop_reason: max_tokens`, otherwise
  `stop`.
- An answer is read with a size limit (8 MiB, adapter option `maxResponseBytes`); a larger one, or a body that is not
  a message, fails with `RST-1506` and is not retried.

### 4.3 Retries and permanent errors (RF-406)

The package's own retries are off; the adapter uses the shared retry loop (`retrying-call.ts`), so every attempt
reaches the attempt observer and the call log. Each attempt has its own timeout (`timeoutSeconds`) and the caller's
abort signal.

| Failure                                                   | Code       | Retried                                                                 |
| --------------------------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| 429 rate limit                                            | `RST-1504` | yes, never sooner than `retry-after` (seconds or HTTP date)             |
| timeout of an attempt, or 408                             | `RST-1505` | yes                                                                     |
| 5xx, 529 overloaded, or a failed connection               | `RST-1506` | yes                                                                     |
| 401 rejected key                                          | `RST-1518` | no; the message names the fix (account settings or `ANTHROPIC_API_KEY`) |
| 402 billing error (no credit)                             | `RST-1520` | no; the message names the Console billing settings                      |
| 404 unknown model                                         | `RST-1519` | no; the message names the model                                         |
| any other 4xx (for example 400 prompt too long, 403, 413) | `RST-1506` | no                                                                      |
| cancelled by the caller                                   | `RST-1501` | no                                                                      |

The back-off is the same as Ollama's (section 2.4).

### 4.4 Tests and the manual live check

- Automated tests never call Anthropic (ADR-008): under `ROSETTA_TEST=1` the adapter refuses every call with
  `RST-1509` unless its base URL is a loopback address whose port a fake server registered (section 2.5). The tests run it against
  `tests/support/fake-anthropic-server.ts`, which replays the hand-written recordings under
  `tests/recordings/anthropic/` with a FAKE key, and run the contract suite on it.
- Manual live check (gate G-04), with `ROSETTA_TEST` unset and the owner's key as `ANTHROPIC_API_KEY` in `.env`:

  ```text
  npm run live:anthropic -- <model>
  ```

  The script loads `.env` itself (`node --env-file=.env`, so the file must exist), builds Rosetta, then makes four
  calls with fixed synthetic prompts: a short text answer, one `read_file` tool call, and the same call with a long
  system prompt twice. It prints each answer with the model version, the request id and the usage, and fails when
  the second long-prompt call read nothing from the cache. Paste the output into the pull request.

### 4.5 Tested models

None yet: the owner's live check fills this section. The price table `prices/default-prices.yaml` holds no Anthropic
model yet, so a role on Anthropic is refused with `RST-1601` unless the project settings add a price for its model,
cache-write price included, or turn on `allowUnpriced` for the user's own key (RF-427).

## 5. OpenAI-compatible services

`OpenAiCompatibleProvider` (`src/infrastructure/providers/openai/openai-compatible-provider.ts`, RF-403) talks to any
service that speaks OpenAI's Chat Completions API at a base URL of the user's choice: OpenRouter, Groq, DeepSeek,
Gemini's compatible endpoint and similar. It sends and reads the same wire shapes as the OpenAI adapter (section 3.2)
through the same `openai` package, which is why it lives in `src/infrastructure/providers/openai/` (the
dependency-cruiser rule `openai-sdk-only-in-openai-adapter`). The adapter builder builds it for kind
`openai-compatible` only when the provider factory chose a key, so every call passes
`BudgetGuard(EgressGuard(ObservedProvider(adapter)))` and needs the run's cloud consent.

### 5.1 Key and base URL (RF-1104, DEC-112)

- There is no server key for this kind: a role on `openai-compatible` uses the user's own key, stored in the account
  settings with its base URL. That key row is the only place a base URL is set; project settings never set one.
- The base URL is the service's API root, to which the adapter appends `/chat/completions`, for example
  `https://openrouter.ai/api/v1`, `https://api.groq.com/openai/v1` or `https://api.deepseek.com/v1`.
- When the key is saved the URL must use `https`, have no user name, password, query or fragment (an Azure URL with
  `?api-version=` is refused), be at most 2 048 characters, and its host must resolve within 5 seconds to public
  addresses only; otherwise it is refused with `RST-2304`. The key must have 16 to 512 visible characters (`RST-2301`).
- The adapter refuses again, before any call, a base URL with a user name, password, query or fragment (`RST-2304`),
  and a key outside 16 to 512 visible characters up to U+00FF (`RST-1511`); neither message holds any part of the key.
- The key goes only into the `Authorization` header. The package's environment defaults (`OPENAI_API_KEY`,
  `OPENAI_BASE_URL`, `OPENAI_ORG_ID`, `OPENAI_CUSTOM_HEADERS` and the rest) never apply, as for OpenAI (section 3.1).
  The service's error text is never copied into an error, its cause, a log or the call log: it may quote the key
  (RNF-003).

### 5.2 Every connection is checked again (threat model TB5)

Every request goes through `publicAddressFetch` (`src/infrastructure/providers/openai/agent-fetch.ts`), a fetch over
`node:https` on a `PublicAddressAgent` (`src/infrastructure/security/public-address-agent.ts`) that the adapter
builder creates for each adapter:

- each connect resolves the host again through `publicOnlyLookup` and hands the socket only addresses that are all
  public, so a name that was public when the key was saved and resolves inside later (DNS rebinding) never gets a
  socket; a name that does not resolve within 5 seconds is refused too;
- an IP literal is checked without a lookup, in every spelling the URL parser accepts (`127.0.0.1`, `127.1`,
  `0x7f000001`, `2130706433`, `0177.0.0.1`, `[::1]`, `[::ffff:127.0.0.1]`); the refused ranges are those of
  `public-address.ts` (private, loopback, link-local with the metadata address `169.254.169.254`, CGNAT, unique-local
  `fc00::/7`, IPv4-mapped and the rest of the special-purpose registries);
- only `https` is sent; a URL of another scheme is refused before anything happens;
- a redirect is never followed: a 3xx answer fails the attempt with `RST-1506` (not retried) and its `Location` is
  never called;
- only the headers Rosetta means to send are sent, and the answer is read with a size limit of 8 MiB.

A refused address fails the call with `RST-2304` at once, without a retry; the message names the host, never the key.

### 5.3 What every call sends and reads

As for OpenAI (section 3.2): the same request body (`max_completion_tokens`, tools as functions, earlier tool calls by
id) and the same reading of the answer. `modelVersion` is the answer's `model` as the service reports it (often a
vendor-prefixed id); `requestId` is the `x-request-id` header when the service sends one. A usage without
`prompt_tokens_details` counts no cached tokens; an answer without usage is estimated (RF-421). Services differ in
what they accept (some refuse `max_completion_tokens` or tools for some models); such a refusal is a 4xx and fails
with `RST-1506`.

### 5.4 Retries and permanent errors (RF-406)

The same retry loop and back-off as OpenAI (section 3.3). The codes are those of the OpenAI table, with messages that
name the OpenAI-compatible service and the account settings instead of OpenAI and `OPENAI_API_KEY`:

| Failure                                                                                       | Code       | Retried                                                            |
| --------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| 429 rate limit                                                                                | `RST-1504` | yes                                                                |
| timeout of an attempt, or 408                                                                 | `RST-1505` | yes                                                                |
| 5xx, or a failed connection                                                                   | `RST-1506` | yes                                                                |
| 401 rejected key                                                                              | `RST-1511` | no; the message names the key and base URL in the account settings |
| 404 `model_not_found`                                                                         | `RST-1512` | no; the message names the model                                    |
| 429 `insufficient_quota`                                                                      | `RST-1513` | no                                                                 |
| a redirect, any other 4xx, an answer past the size limit or one that is not a chat completion | `RST-1506` | no                                                                 |
| an address the public-address agent refused, or a scheme other than `https`                   | `RST-2304` | no                                                                 |
| cancelled by the caller                                                                       | `RST-1501` | no                                                                 |

### 5.5 Prices

The shipped price table holds no OpenAI-compatible service, so a role on one is refused with `RST-1601` unless the
project settings add a price for its model or turn on `allowUnpriced` for the user's own key (RF-427).

### 5.6 Tests and tested services

- Automated tests never call a real service (ADR-008). The contract suite runs on the adapter against
  `tests/support/fake-openai-server.ts` replaying the hand-written recordings under
  `tests/recordings/openai-compatible/`, with a FAKE key, through the adapter's own transport code over plain HTTP on
  a plain agent (`tests/support/openai-compatible-harness.ts`), because the public-address agent refuses loopback by
  design. The guard has its own tests
  (`tests/integration/infrastructure/providers/openai/openai-compatible-guard.test.ts`): the adapter on
  `publicAddressFetch`, and adapters made by the adapter builder, refuse every internal literal above, names a fake
  resolver answers with internal addresses, and a name that rebinds after the save check, while a loopback listener
  confirms that no connection was opened. Under `ROSETTA_TEST=1` the adapter also refuses every URL but a registered
  loopback fake server with `RST-1509` (section 2.5).
- Tested services: none yet. There is no live check script for this kind.

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
