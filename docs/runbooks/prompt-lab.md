# Runbook: the prompt lab (`npm run lab`)

For the owner, the orchestrator and builders of Phase 10 (DEC-231). The lab runs one version of one prompt over the
cases of a case set with one model, through the same adapters, egress guard and budget guard as a run, and measures the
answers without a judge (or, with `--judge`, scores them against a written rubric, section 7). It is opt-in and spends money; no test and no CI job runs it against a real model (ADR-008).
Design: [ADR-029](../adr/ADR-029-prompt-lab-cases-and-spend-ledger.md); requirements RF-1400..RF-1405; files in
[data-model.md](../data-model.md) section 3.21.

## 1. Run one prompt

```text
npm run lab -- --prompt verifier/claim --version v5 --model anthropic:claude-haiku-5-5 \
  --cases verifier-claim-sample --repetitions 3 --yes
```

- `--prompt` is the prompt id. Wired now: `verifier/claim` (the verifier's judgement of one claim) and
  `summariser/overview` (the overview of the cards).
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
minutes. A call that failed after it was sent may have been billed, so it is booked at the larger of the cost the budget guard knows and the worst case held; only a call refused before sending releases its hold. If the ledger cannot be written, the invocation stops. The lab also refuses to start when the provider settings (the timeouts, the waits between attempts and a margin, as the budget guard counts the lifetime of its own reservation) could keep one call longer than the hold of 30 minutes. If a hold cannot be written, nothing is sent and the invocation stops.

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

## 5. Wire another prompt id

1. Write `src/application/lab/targets/<name>-target.ts`: a `LabTarget` with the prompt id (`<folder>/<stem>`, the files
   are `<folder>/<stem>.vN.md`), the role, a `parseInput` that parses the case input with a zod schema and returns the
   case ready to run, and `readsAnswer`, which is the run's own parser of one answer. The case's `run(env, prompt)` must call the
   run's own message builder with the prompt file it is given (never a copy of the prompt text), send through
   `env.role.provider`, and return `{ usable, detail }`; the lab counts the calls, tokens, latency and cost itself.
2. Add the target to `findLabTarget` in `src/presentation/lab/lab-targets.ts`.
3. Test it with the fake provider like `tests/unit/application/lab/lab-targets.test.ts`, add one case set, and name the prompt
   in this runbook. A prompt that is an agent loop (the reader) needs a target that drives its loop; that is not wired yet.

## 6. What the numbers mean

- _Valid on the first try_: the first answer of the case is accepted by the run's own parser.
- _Repaired_: the first answer was not, a later call of the same case was, and the final answer is usable.
- _Refused_: a guard or the ledger refused a call (RST-1600, RST-1601, RST-1515, RST-1516); _RST code_: the code of the
  first call that failed.
- _Agreed_: the target's result equals the case's `expected`.
- Tokens, latency and cost are per case and summed over its calls; the summary divides tokens and latency by the calls.

## 7. The judge (`--judge`) and the judge check (`--judge-check`)

Some quality cannot be counted: whether an answer says only what its source shows, whether a summary covers the cards. A
judge model scores the answer against a written rubric of the prompt's family (RF-1404, ADR-029).

```text
npm run lab -- --prompt verifier/claim --version v5 --model anthropic:claude-haiku-5-5 \
  --cases verifier-claim-sample --judge anthropic:claude-opus-5-5 --yes
```

- **Rubrics** are `lab/rubrics/<family>.md` for reader, verifier, summariser, planner, cards and shared; the family is the
  folder of the prompt id. A criterion is a heading `## <id> - <title>` (with ` [veto]` when a score of 1 on it makes
  the overall score 1) and the text under it says what 5, 3 and 1 look like. Every rubric has `grounding`; the verifier's
  has `verdict-correct` (agreement with the hand label); the shared one vetoes a missed secret. A new criterion is a new
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
30 judge calls. The report `lab-out/<id>/judge-check.json` and the printed lines give the agreement with the hand labels and,
per family and criterion, exact, within one point and the mean difference from the hand scores. A judge score may rule a
prompt version in or out only where this agreement is good enough for the owner (see
[judge-sample.md](../evaluation/prompt-lab/judge-sample.md)).
