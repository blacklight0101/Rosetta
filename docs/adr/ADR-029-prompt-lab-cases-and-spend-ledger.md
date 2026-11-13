# ADR-029: Describe a prompt lab case by its inputs and keep one append-only spend ledger

**Date**: 2026-11-13
**Status**: Accepted (2026-11-13, DEC-231)
**Deciders**: Product owner (phase scope, DEC-231); builder P10-01 (design)

## Context

Phase 10 tunes each prompt on its own (DEC-231). Until now a prompt was measured only inside a whole run
(`npm run eval`, RF-305). The lab must send "the prompt's real messages" with different versions of the prompt over the
same inputs, so a case cannot be a recorded request (its prompt text is frozen into it). The phase has one budget of $50
with a stop for the owner at $40, shared by every card and by two builders working at once (DEC-229). Cases will be
written by P10-02 and later cards, so the format is built on by others. RF-1400..RF-1403, ADR-003, ADR-007, ADR-008.

## Options Considered

1. A case is a recorded request whose prompt part is replaced by the version under test.
2. A case holds the arguments of the run's message-building function for one agent task (the claim and its cited
   lines, the cards of an overview); a registry of targets renders them with any prompt file.
3. Keep spend only in each process's memory and in the provider's own account page.
4. Do nothing (measure prompts only end to end).

## Decision

We choose option 2, with a shared ledger file instead of option 3. A case is `{ id, expected?, split, input }`; `input`
is parsed by the zod schema of the target named by the set's `prompt` id. A target (`src/application/lab/targets/`)
supplies that schema, a function that calls the run's own builder with the prompt file under test, and the run's own
parser as the check of an answer. The lab composes the same guarded provider factory as `npm run eval`, and puts one
decorator on top of it that holds, settles and releases the cost of each call in `lab-out/ledger.jsonl`. The ledger is
append-only JSON lines of hold, settle and release; a process decides on the lines up to its own hold, so two processes
never pass a cap together, and a hold older than thirty minutes stops counting. The ledger file is `lab-out/ledger.jsonl`, or the absolute `.jsonl` path in the environment variable `ROSETTA_LAB_LEDGER`, which all Phase 10 builders set to the same file outside every checkout so the phase total does not depend on the worktree that runs the lab. The variable is required for every real provider: the $50 is one maximum for all builders together (DEC-231), so the lab refuses to start a real model without it; only the fake provider of the tests may keep the per-checkout default. `lab/config.json` holds the total
($50), the stop line ($40) and the cap of one invocation.

## Rationale

- Option 1 freezes the prompt text and the message wrapper in the case, so a new version cannot be rendered; the
  builders are already pure functions of a few inputs.
- The builders are the run's own code, so a message the lab measures is the message a run sends (RF-145 data blocks
  included).
- An append-only file needs no server and no lock; deciding on the lines up to one's own hold is order-independent
  across processes, the one property two concurrent builders need. A database ledger is not available to a script run
  from a worktree with Docker down.
- Option 3 cannot stop a second process; option 4 leaves the owner's phase goal unmet.

## Consequences

**Positive**

- A prompt version is tried over fixed inputs; adding a prompt id is one target file and one registry line.
- The phase total is one figure everyone can read and no process can pass.

**Negative**

- A target must be written per prompt id; agent-loop prompts (the reader) need their own targets: P10-01 wired none, P10-02 wired the first turn of three (see the amendment below).
- The ledger holds worst-case amounts while calls are in flight, so two processes can refuse a call the real cost would have allowed; a crashed process leaves a hold for thirty minutes.
- A call that failed after being sent is booked at the larger of the cost the budget guard knows and its held worst case, so the ledger may over-count it; only a call refused before sending is released.
- A hold is not renewed while a call runs: the lab refuses to start when the provider settings could keep one call longer than a hold lasts (30 minutes, counted as the budget guard counts its own reservation), and when a hold, a settle or a release cannot be written the invocation stops, so nothing is sent without a hold.

## Amendment (2026-11-13, P10-02): captured case sets, held-back rule and agent-loop prompts

- **Capture.** `npm run lab -- --capture` reads the `transcripts/` of a saved run folder and writes a case set with the inputs of the prompt's agent tasks, read back from the data blocks of their first messages. It stores no system prompt and no assistant text, writes no `expected`, makes no call, and leaves out a case that holds an e-mail address, a drive path, a home folder or a key-like string. The inputs of the planner and the summariser were themselves written by models earlier in the run (cards, plan titles); they are inputs here, never truth.
- **Format.** A set may hold `sources` (key, name, address, source commit or the hash of the upload, licence, run ids) and a case may name its source in `from`. The change is additive; `schemaVersion` stays 1.
- **Held-back rule.** At capture, the first `ceil(n / 3)` cases in the order of the SHA-256 of `<prompt id>:<case id>` are `held-back`. The rule reads no input, so it exists before any version is tried and cannot be tuned to a result; the tests recompute it for every committed set. (Replaced by the amendment of the P10 lab fixes below: the side is now decided by the input.)
- **Agent-loop prompts.** The lab does not run a reader loop. A reader case measures one turn: the conversation up to that turn is built from the case with the run's own prompt builders, and the single answer is classified (`reader/task`, `reader/area`, `reader/read-first`: whether it reads files with valid tool calls; `cards/card-format`: whether the answer after a replay of the reads the case holds is a valid card list). The case holds the area's file list and, for the card format, small excerpts of the files the run read. Options not taken: a short loop over files embedded in the case (needs a code map and an area per case, and a turn cap that changes what is measured); a recorded conversation (freezes the prompt text). The cost of this choice is that it does not measure the later turns of a loop; a tuning card that needs them adds a loop target.
- **Unpublished inputs.** Inputs of unknown origin or licence are never committed (DEC-03): `--capture --local` writes them to the git-ignored `lab/local-cases/`, and `--cases` reads a committed set first and a local one otherwise.
- **Not wired yet.** Every prompt family without a target is listed in the runbook (section 7); a tuning card wires its remaining family members first.

## Amendment (2026-11-13, P10-03)

The lab gets a judge (RF-1407, RF-1408). The decision above is unchanged; the judge adds, without changing the structure:
a judge call is one more provider call made through a second `LabCallGate` over the same guarded provider factory and the
same ledger object as the target's, so it is held, settled and capped like every lab call; its cost is kept in the case's
`judge` and not in the target's `costMicros`. The judge's inputs and the answer are untrusted, so three data block sources
(`lab_source`, `lab_answer`, `lab_label`) were added to the egress guard's list. A judge call that fails after it was sent
stops the invocation, because a failed call is booked at its worst case (a rejected key would otherwise be booked on every case).
The judge check is a mode of the same command, not a second entry point, so every real call still goes through `npm run lab`.

## Amendment (2026-11-13, P10 lab fixes): the split by input and first-try validity of a first turn

Two flaws were found before the P10-04 baseline, and the decision above is kept with these changes:

- **Held-back rule by input.** The earlier rule ranked the SHA-256 of `<prompt id>:<case id>`. The capture can take the same input (the same area, files and reads, or the same plan input) from two runs of one source, and the copies get different case ids, so one twin could be tuned on while the other was held back; the hand-built repair sets, ranked under their own prompt id, also split differently from the sets they were built on, so a held-back input could be tuned on through its repair. Both now hold: (a) the capture drops a case whose input equals an earlier case's input (the canonical JSON of the input: keys sorted at every level, no case id), before the split, and names it; and (b) the side is decided by the input: the distinct inputs of a set are ordered by the SHA-256 of their canonical JSON and the first third, rounded up, are held back, and a case built by hand on another (a repair case) takes the side of its base case. (a) alone leaves the cross-set leak of the repairs and any twin of a hand-written set; (b) alone keeps twins, which are measured twice, weigh twice in every rate and cost twice, and add nothing. The rule still reads no answer and no version of a prompt, so it exists before any version is tried; it no longer includes the prompt id, so the sets of different prompts over the same inputs (`reader/task`, `reader/area` and `reader/read-first`; `cards/card-format` and `cards/continue`; `planner/prd` and `planner/package`) hold back the same inputs, which keeps a tuned family of prompts from having seen any held-back input. The cost: the split of a set changes when an input changes (re-masking a secret moves its hash), and a set no longer has a fixed number of cases per run. The committed sets were rebuilt by these rules; the local sets (`lab/local-cases/`) are rebuilt by the owner's captures.
- **First-try validity of a first turn.** A first turn of the reader has no answer parser of the run and its answer may be tool calls, which the answer text does not show, so its first-try validity was always `true`, even for an empty answer. It is now `null` (not applicable) in `results.json`, the summary counts it only where it applies and prints `n/a` otherwise; `detail` and `usable` are the measure of a first turn. Not taken: judging the first turn from the text as `firstTurn` does, which would need the tool calls in the meter and would only repeat `usable`.
- **Masking at capture.** The capture masks every text of an input again with the run's secret masker, so a secret shape the masker learnt after a run was saved (the password after `sqlcmd -P`, RF-141) is masked in a case too.

## References

- RF-1400..RF-1403, RNF-015, DEC-231, ADR-003, ADR-007, ADR-008.
