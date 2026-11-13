# Round log of the shared prompts (P10-10)

Status 2026-11-13: **a measure was fixed and one version was kept.** The masked-value target now
ends on the answer (RF-1406). Both wired prompts went through at least three Haiku 5.5 rounds.
`shared/secret-risk` is `no call` and was left alone.

- `shared/masked-value` **v2 is kept** under the relaxed rule DEC-235 (section 2b): the judge rises
  0.6 on the held-back cases and every cost figure stays inside 15 percent over three repetitions.
  Under the first rule (DEC-231, no regression on any check) it was not kept (section 2).
- `shared/text-tool-protocol`: no version kept; the best candidate does not beat `v1` on the
  held-back cases (section 3).

The card spent about **$1.5 of its $1.50 slice**: target calls $0.2, Opus judge $1.3 (five judged
held-back runs of the candidate comparison, two of them repeated by mistake, one of which wrote a
broken `results.json`), a few cents for two runs a shell time-out cut. The ledger moves with the
other builders, so no ledger total is stated here.

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

## 2b. `shared/masked-value` v2 under DEC-235 (Haiku, held-back, 3 repetitions)

DEC-235 keeps a version when, on the held-back cases, there is no regression on validity, repairs,
unusable answers, refusals, RST codes, label agreement or any veto, the judge mean overall rises by
at least 0.3, and input tokens, output tokens, latency and cost per call each rise by at most 15%.
The 4-case, 1-run comparison above had latency +17% on too few calls, so it was repeated with
`--repetitions 3` (12 calls a version, judged by Opus 5.5): `--compare 20261113-214755-lab
20261113-214938-lab`.

| Check                   | `v1`    | candidate | Change | Rule          |
| ----------------------- | ------- | --------- | ------ | ------------- |
| usable / `Leaked`       | 12 / 0  | 12 / 0    | equal  | no regression |
| agreement with labels   | 100%    | 100%      | equal  | no regression |
| refusals, RST codes     | 0, none | 0, none   | equal  | no regression |
| judge overall           | 4.0     | 4.6       | +0.6   | at least +0.3 |
| secret-handling         | 2.5     | 4.8       | +2.3   | gain          |
| secret-detection (veto) | 5.0     | 5.0       | equal  | no veto       |
| input tokens per call   | 5684.6  | 5733.6    | +0.9%  | at most +15%  |
| output tokens per call  | 774.2   | 762.3     | -1.5%  | at most +15%  |
| latency per call        | 3467 ms | 3540 ms   | +2.1%  | at most +15%  |
| cost of target calls    | $0.0069 | $0.0063   | -9%    | at most +15%  |

A second candidate run (20261113-215112-lab, same 12 calls) gave judge 4.72, 5735 input, 761 output
tokens and 3581 ms per call, the same picture. Its `v1` twin (20261113-214927-lab) wrote a broken
`results.json` (two lab processes ran at once by mistake) and is not used. The earlier latency
(+17%) and output (+13.5%) figures were noise on 4 calls.

**The landed text differs by two characters from the measured one.** A test of the masker (a note
must hold none of `; " ' / < = : \``, which a secret rule reads as the end or start of a value)
refused the candidate's `;`and`:`. The landed note replaces `;`with`,`and`: it`with`and it`, and
was measured once more (`--repetitions 2`, held-back, judged, 8 calls: 20261113-220243-lab) against the
`v1`run above: judge 4.6 (+0.6), secret-handling 4.8, secret-detection 4.6 (one case scored lower, no
veto), usable 8 of 8, no`Leaked`, agreement 100%, input 5733.1 (+0.9%), output 809.4 (+4.6%), latency
3960 ms (+14.2%, close to the limit and on 8 calls), cost $0.00063 against $0.00058 a call (+9%).

**Decision: kept** as `prompts/shared/masked-value.v2.md`, the note of the candidate with that change. Landed as the
gap.v6 pattern: the loader name in `masked-value-prompt.ts`, the tests that name `v1`
(`masked-value-text`, `compose-plan-handoff`, `understand-run-records`, the manifest list), the RF-141
Given, `docs/architecture.md` and this log; `masked-value.v1.md` stays in `prompts/` so `--version v1`
still works. No recorded fixture embeds the note: the committed lab sets store the text as it was
captured, with the `v1` note inside, and no test replays the note.

**Splits do not move.** The split rule hashes the stored text of an input, and the committed sets
(`cards-*`, `reader-*`) keep the `v1` note in it, so nothing moves until a set is captured again.
A re-capture would hash the `v2` note and could move inputs between the splits; it was not done, and
the sets keep the note they were captured with.

**Sonnet 5.5 and Opus 5.5** (held-back, `--sample 2`, no judge to stay in budget; `v1` then `v2`):

| Model  | Runs                                     | Usable | Leaked | Agreement | Input / output per call            | Latency           | Cost             |
| ------ | ---------------------------------------- | ------ | ------ | --------- | ---------------------------------- | ----------------- | ---------------- |
| Sonnet | 20261113-215532-lab, 20261113-215540-lab | 2, 2   | 0, 0   | 100%      | 5687.5 / 275.5 then 5724.5 / 317.5 | 2801 then 2925 ms | $0.0220, $0.0111 |
| Opus   | 20261113-215550-lab, 20261113-215600-lab | 2, 2   | 0, 0   | 100%      | 5689.0 / 297.0 then 5725.5 / 331.5 | 3052 then 3460 ms | $0.0449, $0.0227 |

No `Leaked` and no regression on either model. Opus latency is +13% and its output +12% on two calls
(inside 15%, indicative only); the cost figures differ with the calls and are not a trend.

## 3. `shared/text-tool-protocol` (Haiku)

The baseline breaks were single runs. With repetitions on `v1`, the bare-JSON break (`{"name":
"read_file", ...}` lines with no `tool_call` fence, outcome `Answered`) is **real**: on the four
tune first-turn cases 2 of 12 (20261113-211913-lab) and 5 of 20 (20261113-212151-lab).

The three `after-reads` cases answer `ReadsMore` on almost every call of every version (9 of 9 in
20261113-211913-lab, 14 of 15 with one `Unusable` in 20261113-212151-lab, 15 of 15 in the other runs
below, 10 of 10 on the held-back cases of 20261113-213207-lab): the model uses the protocol correctly and reads more, so their `Valid` label
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
