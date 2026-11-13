# ADR-029: Describe a prompt lab case by its inputs and keep one append-only spend ledger

**Date**: 2026-11-13
**Status**: Proposed
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
never pass a cap together, and a hold older than ten minutes stops counting. `lab/config.json` holds the total
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

- A target must be written per prompt id; agent-loop prompts (the reader) need their own targets and are not wired by P10-01.
- The ledger holds worst-case amounts while calls are in flight, so two processes can refuse a call the real cost would have allowed; a crashed process leaves a hold for ten minutes.
- A call that failed after being sent may have cost money the ledger does not see.

## References

- RF-1400..RF-1403, RNF-015, DEC-231, ADR-003, ADR-007, ADR-008.
