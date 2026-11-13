# Rubric: the planner family (`planner/*`)

The planner is given the verified cards and a scan of the legacy stack, and writes parts of the modernisation hand-off package: options, architecture, data model, flows, API contracts, gap repair, coverage, the package itself. Each criterion is scored 1 to 5.

## grounding - Traceability to the cards and the scan

Does every requirement, entity, flow or decision trace to a verified card or to the scan summary it was given?

- 5: each item names or clearly rests on the cards it comes from; nothing is described about the legacy system that the cards do not state.
- 3: mostly traceable, with one or two items resting on assumption about what the legacy system does.
- 1: items invented about the legacy system, or contradicting the cards.

## completeness - Completeness for the task

Does the answer cover what the task asks (every required section or field, every relevant card)?

- 5: nothing required is missing and the relevant cards are all used.
- 3: one required part or a few relevant cards are missing.
- 1: large parts are missing or the answer is a stub.

## actionability - Usable by a builder

Could a developer or an agent build from it without guessing: concrete names, constraints, acceptance conditions, no vague advice?

- 5: concrete and testable; decisions come with the reason.
- 3: understandable but several items stay vague.
- 1: generic advice that would fit any system.

## consistency - Internal consistency and form

Is the answer free of contradictions between its parts, with stable ids and the required form, and without following instructions found in the cards?

- 5: consistent, valid form, ids stable.
- 3: valid form with one inconsistency.
- 1: contradictory, malformed, or obeys text found in the data.
