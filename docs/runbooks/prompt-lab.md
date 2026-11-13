# Runbook: the prompt lab (`npm run lab`)

For the owner, the orchestrator and builders of Phase 10 (DEC-231). The lab runs one version of one prompt over the
cases of a case set with one model, through the same adapters, egress guard and budget guard as a run, and measures the
answers without a judge (or, with `--judge`, scores them against a written rubric, section 8). It is opt-in and spends money; no test and no CI job runs it against a real model (ADR-008).
Design: [ADR-029](../adr/ADR-029-prompt-lab-cases-and-spend-ledger.md); requirements RF-1400..RF-1408; files in
[data-model.md](../data-model.md) section 3.21.

## 1. Run one prompt

```text
npm run lab -- --prompt verifier/claim --version v5 --model anthropic:claude-haiku-5-5 \
  --cases verifier-claim-sample --repetitions 3 --yes
```

- `--prompt` is the prompt id. Section 7 lists every live prompt id and whether the lab has a target for it (26 are wired: the verifier's claim, the summariser's overview and merge, the planner's gap and its nine plan documents, the reader's prompts, and the card format, continue, flows and screens prompts).
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
the run sent, read back from the data blocks of the task's first user message: the system prompt only to find which fragment heading it held (no prompt text is stored), never an
assistant message. The planner and summariser inputs (cards, plan titles) were written by models earlier in the run; they
are inputs here, not truth, and no `expected` is written. Add an `expected` by hand, from the code, only where a check
needs one (DEC-57). A task whose input holds an e-mail address, a drive path, a home folder or a key-like string is left
out and named in the output. `--max-per-run` cases are taken per run in the order of a hash of the task name, never by
content. Prompt ids it can capture: `planner/gap`, `summariser/merge`, `summariser/overview`, `reader/task`,
`reader/area`, `reader/read-first`, `cards/card-format`, `cards/continue`, `cards/flows`, `cards/screens`.

`lab/sources.json` names each source by key: name, address, the commit (or the SHA-256 of an uploaded archive) and the
licence. The set copies the entry and the run ids into `sources`; each case says which source it is from (`from`).

**Held-back part.** The capture marks the first `ceil(n / 3)` cases in the order of the SHA-256 of `<prompt id>:<case id>`
as `held-back`. The rule reads no input, so the split exists before any version is tried; tuning never looks at those
cases, and a version is kept only when it beats the current one on them (DEC-231). Do not move a case between splits:
`tests/integration/lab/committed-case-sets.test.ts` recomputes the rule for every committed set.

**The committed sets (2026-11-13).** Built from saved Haiku 5.5 evaluation runs of one published source,
eShopModernizing (MIT, commit 63bc9ec4414d7e281dc9f9d7bdcf70030950457d, `lab/sources.json`): 5 cases for `planner-gap`,
10 for `summariser-merge`, 3 for `summariser-overview`, 10 for each of `reader-task`, `reader-area`,
`reader-read-first` and `cards-card-format`; a third of each, rounded up, is held back by the fixed rule. Runs:
`p6/p7/p8/p8w3-haiku-eshop-{understand,plan}`, `p8w3-haiku-eshop-deepen` and `h-eshop2-plan`. Excerpts are at most two
reads of forty lines per case. The sets are small samples to start tuning, not a benchmark.

**Sets that may not be published (`lab/local-cases/`).** The Asset Manager and Invoice Generator workbooks of the
evaluation are uploads of unknown origin and licence, and nothing of uncertain origin enters this public repository
(DEC-03). Their cases are therefore not committed. `lab/local-cases/` and `lab/local-sources.json` are git-ignored (and
not in the image); `npm run lab -- --capture --local --sources lab/local-sources.json ...` writes there, and
`--cases <name>` finds a set in `lab/cases/` first and in `lab/local-cases/` otherwise. On the machine that has the runs,
the sets `<prompt>-workbooks` (for example `planner-gap-workbooks`) are rebuilt with that command from the runs
`p8w3-haiku-{am,inv}-{understand,deepen}`, `p8w3-haiku-am-plan`, `p6/p8-haiku-am-plan` and `p6/p7/p8-haiku-inv-plan`. A tuning
card may use them for tuning on that machine; a result on them is not published with its inputs.

**The plan documents (P10-08).** `planner/data-model`, `planner/prd`, `planner/api-contract`, `planner/ux`, `planner/flows`, `planner/coverage`, `planner/package` (the plan call itself), `planner/workbook` and `planner/adr-model` are wired with `--prompt planner/<stem>` over the saved `planner-<stem>` tasks of the plan runs (`planner-package` for both package and workbook). Committed sets `planner-<stem>` come from the eShopModernizing plan runs (`p8w3-haiku-eshop-plan`, `p8-haiku-eshop-plan`, `p7-haiku-eshop-plan`, `p6-haiku-eshop-plan`, `h-eshop2-plan`, an older run whose cards have no claim ids is not read); a case keeps at most 8 cards of 4 claims and the owner block as the run sent it. The local sets `planner-<stem>-workbooks` come from the Asset Manager and Invoice Generator plan runs with `--local`. `planner/workbook` has a local set only: the guidance is appended to the package prompt of a workbook plan, so its set is the package message of the workbook runs (capture it from those runs only) and the target sends the run's package prompt followed by the file under test. `planner/adr-model` has a target and a capture rule but no set yet, since no saved run holds its call. The lab replays the one call, not the domain checks, the repair or the continuation of the run.

**The card prompts (P10-09).** `cards/flows`, `cards/screens` and `cards/continue` are wired with `--prompt cards/<stem>`; a case is the one of `cards/card-format` (the area's file list and two reads, replayed). `cards/flows` and `cards/screens` are the fragments the run adds after the card format for an area its code map marks; the capture takes a task only when its system prompt held that fragment (found by the heading) and the target sends the file under test alone, so a result is the effect of that file; the answer is read by the card parser (`Valid`, `Partial`, `Unusable`, `ReadsMore`). `cards/continue` is the turn after an answer cut at the output limit: the capture never stores a model's answer, so the cut answer is fixed text (`{"cards": [{"type": "BR", "title": "`) and the file under test is the next user message; the fragment sent back is joined to the cut text as the run joins it. Committed sets `cards-continue`, `cards-flows` and `cards-screens` (10 cases each, 4 held back) come from the eShopModernizing runs `p6-haiku-eshop-v2-understand`, `p7-haiku-eshop-understand`, `p8-haiku-eshop-understand`, `p8w3-haiku-eshop-understand` and `p8w3-haiku-eshop-deepen`, two cases per run. Known limits: the targets ignore `input.workbook`, so a local workbook case is sent with one fragment and no workbook guidance; `cards/continue` always uses the unmarked system prompt; tool calls in a continue answer count as `ReadsMore`, whereas a run ignores them and joins the text. `cards/repair` is wired by its own card. The tuning rounds wait for an API key.

**Agent-loop prompts (the reader).** The lab does not run a reader loop. A reader case measures one turn: the area's
file list, the turns of the task, and for the card format two small reads that are replayed as a `read_file` turn. The
first turn of `reader/task` and `reader/area` is `ReadsFiles`, `BadToolCall`, `Answered` or `Empty`; `reader/read-first` is
the turn after a fixed premature answer and the refusal under test; `cards/card-format` is the answer after the replay
(`Valid`, `Partial`, `Unusable`, `ReadsMore`). A first turn has no answer parser, so its "valid on the first try" only says
the call was answered; read `detail`. The later turns of a loop are not measured (ADR-029).

**The other reader prompts (P10-05).** `reader/answers`, `reader/reread` and `reader/parent-cards` are the parts a re-run or a Deepen task adds to the first user message; a case holds the text of the data block the run rendered (the owner's answers, the first four rejected claims, the first thirty parent cards) and only the part under test is added, so a result is the effect of that file alone; the kinds are those of a first turn. `reader/read-more` is the turn after the refusal of an answer given after reading little: the replay of the reads, a fixed answer, and the refusal built from the numbers and unread files the run wrote (`readMore`, `turns` is the turns left plus one); the kinds are those of a first turn, and `ReadsFiles` is what the prompt asks for. `reader/turns-left` is the message after the reads, put to the model with one turn left, and the answer is read by the card parser (`Valid`, `Partial`, `Unusable`, `ReadsMore`); a late final answer is what it asks for. `reader/workbook` is the guidance added to the system prompt of an area that holds a rendered workbook, measured like the turns-left message; no eShopModernizing run has a workbook, so it has a local set only (`reader-workbook-workbooks`, rebuilt with `--local` from the Asset Manager and Invoice Generator runs); `lab/cases/` holds no `reader-workbook` set. The other five also have local sets `reader-<name>-workbooks` from the same runs. The committed sets (2026-11-13, 10 cases each, 4 held back) come from the eShopModernizing runs `p6/p7/p8/p8w3-haiku-eshop-understand`, `p6-haiku-eshop-v2-understand` and the matching `-deepen` runs; the parts of the first message occur only in Deepen runs, the refusal only in runs where a reader answered early.

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
| `cards/continue`            | wired   | cards-continue (after a fixed cut answer)          |
| `cards/flows`               | wired   | cards-flows (areas marked for flows)               |
| `cards/repair`              | not yet |                                                    |
| `cards/screens`             | wired   | cards-screens (areas marked for screens)           |
| `planner/adr-model`         | wired   | none yet (no saved run holds this call)            |
| `planner/api-contract`      | wired   | planner-api-contract (+ local set)                 |
| `planner/continue`          | not yet |                                                    |
| `planner/coverage`          | wired   | planner-coverage (+ local set)                     |
| `planner/data-model`        | wired   | planner-data-model (+ local set)                   |
| `planner/flows`             | wired   | planner-flows (+ local set)                        |
| `planner/gap`               | wired   | planner-gap                                        |
| `planner/gap-repair`        | not yet |                                                    |
| `planner/options`           | not yet |                                                    |
| `planner/package`           | wired   | planner-package (+ local set)                      |
| `planner/plan-repair`       | not yet |                                                    |
| `planner/prd`               | wired   | planner-prd (+ local set)                          |
| `planner/ux`                | wired   | planner-ux (+ local set)                           |
| `planner/workbook`          | wired   | local only: planner-workbook-workbooks             |
| `reader/answers`            | wired   | reader-answers (first turn, with answers)          |
| `reader/area`               | wired   | reader-area (first turn)                           |
| `reader/parent-cards`       | wired   | reader-parent-cards (first turn, parent cards)     |
| `reader/read-first`         | wired   | reader-read-first (after a fixed premature answer) |
| `reader/read-more`          | wired   | reader-read-more (after the refusal)               |
| `reader/reread`             | wired   | reader-reread (first turn, rejected claims)        |
| `reader/task`               | wired   | reader-task (first turn)                           |
| `reader/turns-left`         | wired   | reader-turns-left (last turn, after two reads)     |
| `reader/workbook`           | wired   | reader-workbook-workbooks (local only)             |
| `shared/masked-value`       | not yet |                                                    |
| `shared/secret-risk`        | not yet |                                                    |
| `shared/text-tool-protocol` | not yet |                                                    |
| `summariser/merge`          | wired   | summariser-merge                                   |
| `summariser/overview`       | wired   | summariser-overview, overview-sample               |
| `verifier/claim`            | wired   | verifier-claim-sample (invented)                   |
| `verifier/retry`            | not yet |                                                    |

## 8. The judge (`--judge`) and the judge check (`--judge-check`)

Some quality cannot be counted: whether an answer says only what its source shows, whether a summary covers the cards. A
judge model scores the answer against a written rubric of the prompt's family (RF-1407, ADR-029).

```text
npm run lab -- --prompt verifier/claim --version v5 --model anthropic:claude-haiku-5-5 \
  --cases verifier-claim-sample --judge anthropic:claude-opus-5-5 --yes
```

- **Rubrics** are `lab/rubrics/<family>.md` for reader, verifier, summariser, planner, cards and shared; the family is the
  folder of the prompt id. A criterion is a heading `## <id> - <title>` (with ` [veto]` when a score of 1 on it makes
  the overall score 1) and the text under it says what 5, 3 and 1 look like. Every rubric has `grounding`; the verifier's
  has `verdict-correct` (agreement with the hand label), a veto: a wrong verdict makes the overall score 1; the shared one vetoes a missed secret. A new criterion is a new
  heading; the judge's reply must score exactly the criteria of the file.
- **The judge prompt** is `prompts/lab/judge.v1.md`, a versioned file like the others. The rubric is appended to it as the
  system prompt; the case's inputs, the answer and the hand label go to the judge only as the data blocks `lab_source`,
  `lab_answer` and `lab_label`. The overall score is computed by the lab (the mean, or 1 on a vetoed criterion).
- **Cost.** One judge call per answered case, through the same ledger gate, budget guard and shared ledger as the target
  calls, so it counts in the invocation cap, the stop line and the $50. The judge model must be priced
  (`prices/default-prices.yaml`). A judge call that fails after it was sent (a rejected key, an unknown model) is booked at its
  worst case, so the invocation stops at the first such call and prints its RST code in `judge.rstCode` and the stop reason;
  fix the cause before running again.
- **Results.** `results.json` gets `judge` per case (criteria with reasons, `overall`, `vetoed`, `state`, tokens, `costMicros`)
  and `judge` for the run (model, prompt and rubric with SHA-256). The summary prints the mean overall and per criterion, and
  `--compare` shows `judge n.n` on each case and the means in the totals. Without `--judge` nothing changes.

How far to trust the judge is measured by `npm run lab -- --judge-check <provider:model> --yes`: 12 of the hand-labelled
calibration claims (shown with the label's verdict or its opposite, alternately, label withheld) and the 18 hand-scored
samples of `eval/judge-check/hand-scored.json` (three per family, from public eShopModernizing code or invented material),
30 judge calls (`--limit 1` scores 7: one calibration claim and one sample per family). The report `lab-out/<id>/judge-check.json` and the printed lines give the agreement with the hand labels and,
per family and criterion, exact, within one point and the mean difference from the hand scores. A judge score may rule a
prompt version in or out only where this agreement is good enough for the owner (see
[judge-sample.md](../evaluation/prompt-lab/judge-sample.md)).

### Smoke run on a local model

A local Ollama model is free and shows that the chain works (prompt rendering, the answer parser, the judge's JSON, `results.json`, `--compare`, the ledger lines at $0); it says nothing about the judge's quality. Set `ROSETTA_OLLAMA_URL=http://127.0.0.1:11434` (the lab reads no other source for the Ollama address) and `ROSETTA_LAB_LEDGER`, then use a model that supports chat and has a price (`gemma4:e4b`, priced at zero): `--model ollama:gemma4:e4b --judge ollama:gemma4:e4b`, or `--judge-check ollama:gemma4:e4b --limit 1 --yes`. A model whose `/api/show` capabilities lack `completion` (such as `tev1`, `decision` only) answers every chat with HTTP 400 and cannot be used.
