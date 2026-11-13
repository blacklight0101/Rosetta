# Round log of the shared prompts (P10-10)

Status 2026-11-13: **a measure was fixed and no version was kept.** The masked-value target now
ends on the answer (RF-1406). Both wired prompts went through at least three Haiku 5.5 rounds.
`shared/secret-risk` is `no call` and was left alone.

- `shared/masked-value`: the candidate v2 (section 2b) is **not kept**. It raises the judge mean by
  0.6, but on the pooled held-back calls its output is +23%, latency +26% and cost +19% per call,
  over the 15% of DEC-235 (c). `v1` stays current; v2 stays here as a measured candidate.
- `shared/text-tool-protocol`: no version kept; the best candidate does not beat `v1` on the
  held-back cases (section 3).

The card spent about **$1.5 of its $1.50 slice** (target calls $0.2, Opus judge $1.3) and $0.014 of
the reserve for the pooled re-measure of section 2b. The ledger moves with the other builders, so no
ledger total is stated here.

Run ids are folders of `lab-out/` (git-ignored). Every run is Haiku 5.5 with the split stated. No
`Leaked` outcome appeared in any run, so the missed-secret veto holds for every version tried.

## 1. What counts as an answer (masked-value)

The baseline found that Haiku asked to read more on 4 of 5 cases, which the replay scored unusable
and the judge vetoed. That is the reader's next move, not the note.

**Change (target, not prompt):** the masked-value call is the last turn. The replay ends with the
turns-left message with one turn left and the request carries no tools, so the model has to write
text and the checks apply to it: `Leaked` (value repeated in the answer), the card parser (`Valid`,
`Partial`, `Unusable`) and the judge. A tool call written as text is `Unusable`. Spec: the
masked-value Given of RF-1406; a red test commit, then the code.

| Run                 | What                                  | Cases | Usable | Leaked | Agreement |
| ------------------- | ------------------------------------- | ----- | ------ | ------ | --------- |
| 20261113-211809-lab | `v1`, new target, tune, 3 repetitions | 15    | 15     | 0      | 87%       |

Before the change 4 of 5 were unusable. The two `Partial` answers are cards the card parser found a
problem in, not a failure of the note.

## 2. `shared/masked-value` (Haiku, tune, one judged run of 5 cases each)

The judge's weakest criterion on `v1` was `secret-handling` (3.0 on all 5): the answers never say
that the secret is exposed and must move to a secret store and be replaced. The note can carry that
advice, so the note was changed, one thing a round.

| Round | Draft (in `lab-out/drafts/`) | Change                                                                               | Run                 | Judge | Handling | Grounding |
| ----- | ---------------------------- | ------------------------------------------------------------------------------------ | ------------------- | ----- | -------- | --------- |
| 0     | `v1`                         | none                                                                                 | 20261113-212523-lab | 4.2   | 3.0      | 3.8       |
| 1     | `masked-value.v2r1.md`       | report at the line, never repeat, say it is exposed, move to a secret store, replace | 20261113-212632-lab | 4.8   | 4.8      | 4.2       |
| 2     | `v2r2`                       | the same, shorter wording                                                            | 20261113-212721-lab | 4.6   | 4.8      | 3.4       |
| 3     | `v2r3`                       | `r1` plus "without guessing its value or use"                                        | 20261113-212806-lab | 4.5   | 4.6      | 4.0       |

Decisions: round 1 is the candidate (best judge score and handling). Round 2 is not better
(grounding fell; that is noise on 5 cases). Round 3 is not better and one case fell to 3.8. All four
runs: 5 of 5 usable, no `Leaked`; secret-detection 5.0 (4.4 in round 3 on one case).

**Held-back comparison, `v1` against the candidate** (`--compare 20261113-212849-lab
20261113-212925-lab`, 4 cases, judged):

| Check                  | `v1`    | candidate | Result |
| ---------------------- | ------- | --------- | ------ |
| usable / `Leaked`      | 4 / 0   | 4 / 0     | equal  |
| refusals, RST codes    | 0, none | 0, none   | equal  |
| judge overall          | 4.2     | 4.7       | better |
| secret-handling        | 2.8     | 4.5       | better |
| secret-detection       | 5.0     | 5.0       | equal  |
| input tokens per call  | 5685.5  | 5735.8    | +0.9%  |
| output tokens per call | 717.0   | 813.8     | +13.5% |
| latency per call       | 3332 ms | 3904 ms   | +17%   |
| cost of target calls   | $0.0020 | $0.0022   | +10%   |

**Decision under DEC-231: not kept.** The note is longer and the model writes the advice, so tokens, latency and
cost rise by construction, and DEC-231 allows no regression on any check. The candidate is the
owner's call: it buys +0.5 on the judge (secret-handling 2.8 to 4.5) for about 50 more input tokens
at every masked value and about 100 more output tokens on an answer. Its text, one line:

`[MASKED:{{kind}}] (a secret value is written here in plain text in the code, Rosetta masked it before sending; report it at this line, never ask for or repeat the value, and say that it is exposed: it must move to a secret store and be replaced)`

Landing it would mean a new `prompts/shared/masked-value.v2.md` wired in
`src/infrastructure/prompts/masked-value-prompt.ts`, the tests that name `v1`, `docs/architecture.md`
and the Given of RF-141 in the spec.

**Splits.** The committed sets hold their masked text as it was captured (the note of `v1` is in the
stored text) and the split rule hashes that stored text, so a new note moves no split until a set is
captured again. A re-capture would move the inputs that hold a note (`cards-*`, `reader-*`); it was
not done, because another builder is tuning sets at the same time.

## 2b. `shared/masked-value` v2 under DEC-235 (Haiku, held-back, pooled)

DEC-235 keeps a version when, on the held-back cases, there is no regression on validity, repairs,
unusable answers, refusals, RST codes, label agreement or any veto, the judge mean overall rises by
at least 0.3, and input tokens, output tokens, latency and cost per call each rise by at most 15%.

**Runs.** Every run is the 4 held-back cases of `shared-masked-value`, Haiku 5.5, repetitions as
stated. The numbers are per call (target calls only, no judge cost). "Pre-fix" is the candidate text
`masked-value.v2r1.md` (sha e7990e56); "landed" is the text with `;` and `:` replaced (the masker test
refuses those characters in the note), which is the text of `prompts/shared/masked-value.v2.md` in
commit 1d591365.

| Run                 | Text    | Calls | Input  | Output | Latency | Cost     | Agreed |
| ------------------- | ------- | ----- | ------ | ------ | ------- | -------- | ------ |
| 20261113-214755-lab | `v1`    | 12    | 5684.6 | 774.2  | 3467 ms | 573.5 µ$ | 12/12  |
| 20261113-214927-lab | `v1`    | 12    | 5684.5 | 642.0  | 3050 ms | 459.8 µ$ | 10/12  |
| 20261113-223811-lab | `v1`    | 12    | 5684.6 | 575.5  | 2792 ms | 426.3 µ$ | 12/12  |
| 20261113-214938-lab | pre-fix | 12    | 5733.6 | 762.3  | 3540 ms | 525.8 µ$ | 12/12  |
| 20261113-215112-lab | pre-fix | 12    | 5734.7 | 760.6  | 3581 ms | 525.2 µ$ | 12/12  |
| 20261113-220243-lab | landed  | 8     | 5733.1 | 809.4  | 3960 ms | 620.9 µ$ | 8/8    |
| 20261113-223731-lab | landed  | 16    | 5733.1 | 821.5  | 3866 ms | 555.5 µ$ | 15/16  |

**How the figures were read.** Run 20261113-214927-lab (a `v1` run, the twin of 214938, started at the
same time) and 20261113-220243-lab wrote a `results.json` that does not parse. The cause is a masker
bug, not the two processes: the bare masker runs on the text of `JSON.stringify`, and a judge
reason that quotes `"ApiKey={secret}"` loses the backslash that escapes its quotes
(`src/infrastructure/lab/lab-files.ts`, line 98 for 214927 and line 422 for 220243). Only the judge
reason text is damaged. The per-call fields (tokens, latency, cost, `agreed`) were read directly
from the files by their field names, without repairing the string, and every number is intact. The bug
is not fixed in this card; it is for the owner of the lab files.

**Pooled figures** (v1: 3 runs, 36 calls; landed v2: 2 runs, 24 calls):

| Per call              | `v1`     | landed v2 | Change   | Rule          |
| --------------------- | -------- | --------- | -------- | ------------- |
| input tokens          | 5684.6   | 5733.1    | +0.9%    | at most +15%  |
| output tokens         | 663.9    | 817.5     | +23.1%   | at most +15%  |
| latency               | 3103 ms  | 3897 ms   | +25.6%   | at most +15%  |
| cost                  | 486.5 µ$ | 577.3 µ$  | +18.7%   | at most +15%  |
| agreement with labels | 34/36    | 23/24     | no worse | no regression |

The first call of each run pays the prompt-cache write (cost 320 to 1009 µ$ against 420 to 565 µ$
warm). Dropping the first call of every run (33 against 22 calls) gives output +23.1%, latency +25.7%
and cost +17.7%, the same result.

Other cuts, to show how far the answer depends on which runs are counted: the concurrent pair
214927 against 214938 is output +18.7%, latency +16.1%, cost +14.4%; all `v1` runs against both
pre-fix runs is output +14.7%, latency +14.7%, cost +8.0% (inside the limit); the earlier 214755
against 214938 pair is output -1.5%, latency +2.1%, cost -8.3%. Latency per call of the same text
ranges from 1.7 to 5.6 s, so a pair of 12-call runs is noisy. The pooled figures above are the larger
sample and the one on the landed text.

**Quality (b).** The judge mean overall is 4.0 for `v1` (214755) against 4.6 (214938), 4.72
(215112) and 4.6 (220243) for the candidate texts, +0.6 to +0.7; secret-handling goes from 2.5 to
4.8. No veto, no `Leaked` in any run. This part is met. One landed call (223731, repetition 4 of
`billing-config-connection`) read `Partial` where `Valid` was expected, so agreement is 23/24 against
34/36 for `v1`; it is not a regression on the pooled counts.

**Decision: not kept.** Condition (c) of DEC-235 fails on the pooled figures: output +23.1%,
latency +25.6% and cost +18.7% per call, each over 15%. A version that fails the rule is not kept,
however close it comes. `v1` stays current. The landing commit is reverted by a new commit; the
candidate stays as a measured candidate, in this log only:

```
[MASKED:{{kind}}] (a secret value is written here in plain text in the code, Rosetta masked it before sending, report it at this line, never ask for or repeat the value, and say that it is exposed and must move to a secret store and be replaced)
```

If it is tried again, a shorter wording that keeps the "report it, never repeat it, exposed and must
move to a secret store" advice but adds fewer output tokens is the way to pass (c): the output
tokens carry the latency and the cost.

**Sonnet 5.5 and Opus 5.5** (held-back, `--sample 2`, no judge; `v1` then the pre-fix candidate, sha
e7990e56, not the landed text; not re-run on the landed text because it is not kept):

| Model  | Runs                                     | Usable | Leaked | Agreement | Input / output per call            | Latency           |
| ------ | ---------------------------------------- | ------ | ------ | --------- | ---------------------------------- | ----------------- |
| Sonnet | 20261113-215532-lab, 20261113-215540-lab | 2, 2   | 0, 0   | 100%      | 5687.5 / 275.5 then 5724.5 / 317.5 | 2801 then 2925 ms |
| Opus   | 20261113-215550-lab, 20261113-215600-lab | 2, 2   | 0, 0   | 100%      | 5689.0 / 297.0 then 5725.5 / 331.5 | 3052 then 3460 ms |

No `Leaked`. On two calls each, Sonnet output rose 15.2% and Opus output 11.6% and latency 13.4%,
indicative only. These two models do not change the decision.

## 3. `shared/text-tool-protocol` (Haiku)

The baseline breaks were single runs. With repetitions on `v1`, the bare-JSON break (`{"name":
"read_file", ...}` lines with no `tool_call` fence, outcome `Answered`) is **real**: on the four
tune first-turn cases 2 of 12 (20261113-211913-lab) and 5 of 20 (20261113-212151-lab).

The three `after-reads` cases answer `ReadsMore` on almost every call of every version (9 of 9 in
20261113-211913-lab and in 20261113-212000-lab, 14 of 15 with one `Unusable` in 20261113-212151-lab,
15 of 15 in 20261113-212252-lab, 20261113-212345-lab and 20261113-212437-lab, 10 of 10 on the
held-back cases of 20261113-213207-lab): the model uses the protocol correctly and reads more, so their `Valid` label
has the same measurement problem as masked-value had. They are constant between versions and do not
discriminate. This target was not changed (the card's change was the masked-value target).

Figures are bare-JSON breaks among the first-turn calls of the tune split (4 cases).

| Round | Draft                        | Change                                                                            | Run                                      | Breaks           |
| ----- | ---------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------- | ---------------- |
| 0     | `v1`                         | none                                                                              | 20261113-212151-lab                      | 5 of 20          |
| 1     | `text-tool-protocol.v2r1.md` | each call in its own fence; bare JSON is not a call                               | 20261113-212000-lab, 20261113-212252-lab | 0 of 12, 4 of 20 |
| 2     | `v2r1` again                 | repeat with 5 repetitions: the 0 of 12 was luck                                   | 20261113-212252-lab                      | 4 of 20          |
| 3     | `v2r3`                       | `r1` plus an example of two calls, each in its own fence                          | 20261113-212345-lab                      | 2 of 20          |
| 4     | `v2r4`                       | `r3` with a harder sentence (a bare line is ignored; no fence means final answer) | 20261113-212437-lab                      | 3 of 20          |

**Held-back comparison, `v1` against `v2r3`** (`--compare 20261113-213207-lab 20261113-213231-lab`,
3 cases, 5 repetitions): the one first-turn case (`school-first-turn`) was `ReadsFiles` 5 of 5 on
`v1` and 3 of 5 on `v2r3` (two `Answered`). Input tokens per call 6468.1 against 6660.4 (+3.0%),
output 167.8 against 200.5, latency 1223 ms against 1319 ms, cost $0.0031 against $0.0034.

**Decision: not kept.** It regresses on the held-back case and on tokens, and over all 25 first-turn
calls of tune and held-back the two versions are inside the noise (5 of 25 against 4 of 25 breaks).
The break rate of about 20 percent on Haiku is a real finding that no wording tried here moved
reliably. A sure fix is a code one (accept a bare JSON line as a call in `parseTextAnswer`, shared
with the Ollama adapter), which is outside this card. Sonnet and Opus were not run, since nothing
was kept.

## 4. What follows

- Give the text-tool-protocol `after-reads` cases the same last-turn treatment as masked-value if
  the protocol is tuned again.
