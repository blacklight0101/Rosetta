# Runbook: the prompt lab (`npm run lab`)

For the owner, the orchestrator and builders of Phase 10 (DEC-231). The lab runs one version of one prompt over the
cases of a case set with one model, through the same adapters, egress guard and budget guard as a run, and measures the
answers without a judge. It is opt-in and spends money; no test and no CI job runs it against a real model (ADR-008).
Design: [ADR-029](../adr/ADR-029-prompt-lab-cases-and-spend-ledger.md); requirements RF-1400..RF-1403; files in
[data-model.md](../data-model.md) section 3.21.

## 1. Run one prompt

```text
npm run lab -- --prompt verifier/claim --version v5 --model anthropic:claude-haiku-5-5 \
  --cases verifier-claim-sample --repetitions 3 --yes
```

- `--prompt` is the prompt id. Section 7 lists every live prompt id and whether the lab has a target for it (8 are wired: the verifier's claim, the summariser's overview and merge, the planner's gap, the reader's task, area and read-first prompts, and the card format).
- `--version v5` is the file `prompts/verifier/claim.v5.md`; any other value is the path of a draft file, so a new
  wording is tried before it is added to `prompts/` (its name, version `file` and SHA-256 go to the results).
- `--model provider:model` is any model the provider factory serves; the server key comes from the environment
  (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`). Nobody reads `.env` but the process that runs the lab. A model without a
  price in `prices/default-prices.yaml` is refused with RST-1601.
- `--cases` is a file of `lab/cases/` without `.json`; its `prompt` must be the one on the command line.
- Without `--yes` the command shows the prompt, the model, the number of calls and the caps, and sends nothing.

The command prints the rates of first-try validity, repairs and unusable answers, the refusals and RST codes, the
agreement with the cases' `expected` labels, tokens and latency per call and the cost, and writes
`lab-out/<id>/results.json` (git-ignored). Exit code 0 means every case ran; 1 means it did not start, or a cap stopped it.

## 2. The caps and the owner's stop line

`lab/config.json` holds `totalCapMicros` (50 000 000 = $50), `stopMicros` (40 000 000 = $40, the owner's stop line)
and `invocationCapMicros` (the most one command may spend). All are in micro-dollars.

Every call first holds its worst case (its prompt estimated, plus the output limit, priced) in the shared ledger
`lab-out/ledger.jsonl`, and is sent only when the invocation, the total and the stop line stay within their caps. The
cost the budget guard priced then replaces the hold. A refused call fails with RST-1600 and the reason, the cases left
are skipped and the results say `Refused`. The ledger is append-only and each command decides on the lines up to its own
hold, so two commands at once never pass a cap together; a hold from a command that crashed stops counting after thirty
minutes. A call that failed after it was sent may have been billed, so it is booked at the larger of the cost the budget guard knows and the worst case held; only a call refused before sending releases its hold. If the ledger cannot be written (a hold, a settle or a release line), the invocation stops. The provider timeouts bound a call that is answered in one piece; for a streamed answer the timeout counts idle time, so the check at start is a guard against a configuration that cannot fit, not a proof that no call lasts longer than a hold. The lab also refuses to start when the provider settings (the timeouts, the waits between attempts and a margin, as the budget guard counts the lifetime of its own reservation) could keep one call longer than the hold of 30 minutes. If a hold cannot be written, nothing is sent and the invocation stops.

At the stop line every call is refused with the words "stop line". Only the owner lifts it, by raising `stopMicros`
in `lab/config.json` (never above `totalCapMicros`) and committing that change. Spend a card has not used returns to
the reserve; a builder that reaches its slice stops and reports (Phase 10 intro).

The $50 is one maximum for all builders together, so `ROSETTA_LAB_LEDGER` is required for every real run: without it the
lab refuses to start a real model (RST-1000, "set ROSETTA_LAB_LEDGER to the shared Phase 10 ledger"), with or without
`--yes`. Only tests with the fake provider use `lab-out/ledger.jsonl` of the checkout. Every real lab run in Phase 10 sets
`ROSETTA_LAB_LEDGER` to the same file, e.g. `<shared folder outside every checkout>/ledger.jsonl`, so two
builders in two worktrees share one phase total (put it in `.env`, or set it in the shell). The value must be an absolute
path ending in `.jsonl`; anything else stops the command with RST-1000 before a call is sent. Its folder is created if
missing.

## 3. Compare two versions

```text
npm run lab -- --compare 20261113-101500-lab 20261113-102200-lab
```

Both ids are folders of `lab-out/`. The report gives the totals of each version and each case side by side. It refuses
two runs of different case sets (compared by the SHA-256 of the file) and makes no call. A version is kept only when it
beats the current one on the held-back cases without a regression on any check (DEC-231).

## 4. Add a case set

Write `lab/cases/<set>.json` (format in data-model.md section 3.21). A case holds the inputs of the prompt, never its
text, so every version is rendered over the same inputs. `expected` is the label the target's result is compared with
(for the verifier `Supported` or `Rejected`); `split: "held-back"` marks the cases kept out of tuning. Use only
public or invented material (DEC-03). `verifier-claim-sample.json` and `overview-sample.json` show the two formats.
A case set that does not parse, or a case its target cannot read, stops the command before any call.

### Capture a set from a saved run (P10-02)

```text
npm run lab -- --capture --prompt planner/gap --name planner-gap --sources lab/sources.json   --run eshop=<run folder> --run asset-manager=<run folder> [--max-per-run 3]
```

The capture reads `manifest.json` and `transcripts/` of each run folder (the run folder, or the folder that holds exactly
one) and writes `lab/cases/<name>.json`. It sends nothing and writes nothing into the run folder. It keeps the **inputs**
the run sent, read back from the data blocks of the task's first user message: never the system prompt, never an
assistant message. The planner and summariser inputs (cards, plan titles) were written by models earlier in the run; they
are inputs here, not truth, and no `expected` is written. Add an `expected` by hand, from the code, only where a check
needs one (DEC-57). A task whose input holds an e-mail address, a drive path, a home folder or a key-like string is left
out and named in the output. `--max-per-run` cases are taken per run in the order of a hash of the task name, never by
content. Prompt ids it can capture: `planner/gap`, `summariser/merge`, `summariser/overview`, `reader/task`,
`reader/area`, `reader/read-first`, `cards/card-format`.

`lab/sources.json` names each source by key: name, address, the commit (or the SHA-256 of an uploaded archive) and the
licence. The set copies the entry and the run ids into `sources`; each case says which source it is from (`from`).

**Held-back part.** The capture marks the first `ceil(n / 3)` cases in the order of the SHA-256 of `<prompt id>:<case id>`
as `held-back`. The rule reads no input, so the split exists before any version is tried; tuning never looks at those
cases, and a version is kept only when it beats the current one on them (DEC-231). Do not move a case between splits:
`tests/integration/lab/committed-case-sets.test.ts` recomputes the rule for every committed set.

**The committed sets (2026-11-13).** Built from saved Haiku 5.5 evaluation runs of three public sources: eShopModernizing
(MIT, commit 63bc9ec4414d7e281dc9f9d7bdcf70030950457d), and the Asset Manager and Invoice Generator workbooks (uploads of
`asset-manager.zip` and `invoice-generator.zip`, identified by the SHA-256 of the snapshot; their licence is not recorded
in the runs and the set says so: the owner confirms it). Runs: `p8w3-haiku-{am,inv,eshop}-{understand,deepen}` for the
reader, merge and overview sets; `p6/p7/p8/p8w3-haiku-{am,inv,eshop}-plan` and `h-eshop2-plan` for `planner-gap`. Excerpts are at most two reads of
forty lines per case. The sets are small samples to start tuning, not a benchmark.

**Agent-loop prompts (the reader).** The lab does not run a reader loop. A reader case measures one turn: the area's
file list, the turns of the task, and for the card format two small reads that are replayed as a `read_file` turn. The
first turn of `reader/task` and `reader/area` is `ReadsFiles`, `BadToolCall`, `Answered` or `Empty`; `reader/read-first` is
the turn after a fixed premature answer and the refusal under test; `cards/card-format` is the answer after the replay
(`Valid`, `Partial`, `Unusable`, `ReadsMore`). A first turn has no answer parser, so its "valid on the first try" only says
the call was answered; read `detail`. The later turns of a loop are not measured (ADR-029).

## 5. Wire another prompt id

1. Write `src/application/lab/targets/<name>-target.ts`: a `LabTarget` with the prompt id (`<folder>/<stem>`, the files
   are `<folder>/<stem>.vN.md`), the role, a `parseInput` that parses the case input with a zod schema and returns the
   case ready to run, and `readsAnswer`, which is the run's own parser of one answer. The case's `run(env, prompt)` must call the
   run's own message builder with the prompt file it is given (never a copy of the prompt text), send through
   `env.role.provider`, and return `{ usable, detail }`; the lab counts the calls, tokens, latency and cost itself.
2. Add the target to `findLabTarget` in `src/presentation/lab/lab-targets.ts`.
3. Test it with the fake provider like `tests/unit/application/lab/lab-targets.test.ts`, add one case set, and name the prompt
   in this runbook. A prompt that is an agent loop (the reader) gets a target for one turn of its loop (section 4, last paragraph of the capture part). Change the prompt's row in section 7.

## 6. What the numbers mean

- _Valid on the first try_: the first answer of the case is accepted by the run's own parser.
- _Repaired_: the first answer was not, a later call of the same case was, and the final answer is usable.
- _Refused_: a guard or the ledger refused a call (RST-1600, RST-1601, RST-1515, RST-1516); _RST code_: the code of the
  first call that failed.
- _Agreed_: the target's result equals the case's `expected`.
- Tokens, latency and cost are per case and summed over its calls; the summary divides tokens and latency by the calls.

## 7. Every live prompt id and its target

A prompt id is live when the newest version of its family in `prompts/` is the one the run loads. A tuning card
(P10-05..P10-10) wires the remaining members of its own family first, with the steps of section 5, and changes the row
to `wired`. `tests/integration/lab/runbook-prompt-list.test.ts` keeps this table equal to the live families and to the
targets the lab has, so a row cannot be forgotten. Data files of `prompts/catalogue/` are not prompts.

| Prompt id                   | State   | Case set                                           |
| --------------------------- | ------- | -------------------------------------------------- |
| `cards/card-format`         | wired   | cards-card-format (after a replay of two reads)    |
| `cards/continue`            | not yet |                                                    |
| `cards/flows`               | not yet |                                                    |
| `cards/repair`              | not yet |                                                    |
| `cards/screens`             | not yet |                                                    |
| `planner/adr-model`         | not yet |                                                    |
| `planner/api-contract`      | not yet |                                                    |
| `planner/continue`          | not yet |                                                    |
| `planner/coverage`          | not yet |                                                    |
| `planner/data-model`        | not yet |                                                    |
| `planner/flows`             | not yet |                                                    |
| `planner/gap`               | wired   | planner-gap                                        |
| `planner/gap-repair`        | not yet |                                                    |
| `planner/options`           | not yet |                                                    |
| `planner/package`           | not yet |                                                    |
| `planner/plan-repair`       | not yet |                                                    |
| `planner/prd`               | not yet |                                                    |
| `planner/ux`                | not yet |                                                    |
| `planner/workbook`          | not yet |                                                    |
| `reader/answers`            | not yet |                                                    |
| `reader/area`               | wired   | reader-area (first turn)                           |
| `reader/parent-cards`       | not yet |                                                    |
| `reader/read-first`         | wired   | reader-read-first (after a fixed premature answer) |
| `reader/read-more`          | not yet |                                                    |
| `reader/reread`             | not yet |                                                    |
| `reader/task`               | wired   | reader-task (first turn)                           |
| `reader/turns-left`         | not yet |                                                    |
| `reader/workbook`           | not yet |                                                    |
| `shared/masked-value`       | not yet |                                                    |
| `shared/secret-risk`        | not yet |                                                    |
| `shared/text-tool-protocol` | not yet |                                                    |
| `summariser/merge`          | wired   | summariser-merge                                   |
| `summariser/overview`       | wired   | summariser-overview, overview-sample               |
| `verifier/claim`            | wired   | verifier-claim-sample (invented)                   |
| `verifier/retry`            | not yet |                                                    |
