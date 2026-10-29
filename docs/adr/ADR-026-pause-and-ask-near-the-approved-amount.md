# ADR-026: Pause a run near its approved amount and ask, instead of a hard stop

**Date**: 2026-10-29
**Status**: Proposed
**Deciders**: BlackLigth (blacklight0101)

## Context

Today a run stops at its cap (ADR-007, RF-422): it ends `CapReached`, keeps its work and can be resumed by hand
after the owner raises the cap (RF-006). In the evaluation of 2026-10-29 the eShop Deepen on a local model needed
twice its 8M token cap; it stopped, waited 20 minutes in the queue after the owner raised the cap, and was resumed
by hand (EV-62). The estimate did not include the Deepen rounds, so the owner approved a figure that was never
realistic. After the evaluation the owner asked: "is there a way we can estimate the cap before starting the run
and give the option to the user to approve the run or not and not have a hard cap so we dont lose the run"
(DEC-196). Runs share one queue (RF-1108): a run that holds a running slot blocks other users' runs. Local models
cost $0, so a token cap there protects time, not money (DEC-197).

## Options Considered

1. Pause and ask: the user approves an estimated amount at the start (RF-430); near it the run writes its work,
   moves to a new queue state `AwaitingApproval` ("Waiting for your approval"), releases its running slot and asks
   "Continue (+N)" or "Stop here". Continue raises the approved amount by N and queues the run again; Stop ends it
   `CapReached` with the same saved result as today.
2. The same pause, but the paused run keeps its running slot.
3. Raise the cap automatically by a fixed share when a run reaches it.
4. Do nothing: keep the hard stop and the manual resume.

## Decision

We choose option 1. A run pauses when its spend plus the room of its next call would pass the approved amount;
`AwaitingApproval` is a queue state, not an end state, so the run is not ended and keeps its record, its round and
its cost so far. The paused run releases its slot. The day, month and server caps stay hard limits and are never
passed (DEC-112); a run that reaches one of those ends `CapReached` as before. A run whose every role is local may
have no token cap when the project setting of DEC-197 is on.

## Rationale

- The owner's request is to approve an amount and not lose a run (DEC-196); option 1 keeps the work and asks.
- Releasing the slot keeps the shared queue moving while nobody answers (RF-1108); option 2 lets one unanswered
  run block every other user.
- Option 3 spends money nobody approved, which ADR-007 forbids.
- Option 4 is what failed in the evaluation (EV-62).
- Resume already restores a stopped run from its files (RF-006), so Continue reuses that path.

## Consequences

**Positive**

- No run is lost at the approved amount; the user decides with the figures in front of them.
- The estimate becomes the amount the user approves, so its accuracy is visible.

**Negative**

- A new queue state needs a migration, run index and queue changes, events and a badge (card P7-05).
- A paused run waits for the user without a time limit; the run list must make it easy to find.
- The budget guard gets a second outcome besides refusing a call; it needs tests at the boundary.

## References

- DEC-196, DEC-197; RF-006, RF-422, RF-430, RF-431, RF-432, RF-433, RF-1108.
- ADR-007 (cost control): extended by this ADR when it is accepted.
- Cards P7-04, P7-05, P7-06; evaluation of 2026-10-29, EV-44, EV-62.
