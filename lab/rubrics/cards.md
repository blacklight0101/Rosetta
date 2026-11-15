# Rubric: the cards family (`cards/*`: card format, repair, continue, flows, screens)

These prompts shape or fix the cards a reader writes: the card format, the repair of an invalid card list, the continuation of a cut answer, the flow and screen fragments. Score the cards in the answer against the given code or earlier answer. Each criterion is scored 1 to 5.

## grounding - Grounding in the given source

Does every claim say only what the given lines (or the earlier answer being repaired) show?

- 5: each claim is shown by its cited lines; a repair changes only what was wrong and adds nothing new.
- 3: mostly grounded, with one claim that goes beyond its lines, or a repair that adds a detail.
- 1: claims or repairs that invent behaviour, change meaning, or cite lines that do not show them.

## format-validity - Valid output in the required shape

Is the answer the required JSON object with valid card types, required fields for each type and well-formed citations?

- 5: valid and complete; every card has the fields its type needs and every citation is `path:start-end`.
- 3: valid overall, with one missing optional field or a loose citation.
- 1: cannot be parsed, has missing required fields, unknown types or malformed citations.

## claim-precision - Atomic, checkable claims

Is each claim one fact that a verifier could check against the lines?

- 5: claims are single, concrete and checkable (names, values, conditions).
- 3: some claims bundle several facts or are vague.
- 1: claims are opinions, summaries of the whole file, or cannot be checked.

## fidelity - Fidelity to the task

Does the answer do the task (write, repair or continue) without dropping cards it was asked to keep, repeating cards, or following instructions found in the code or cards?

- 5: exactly the task; nothing dropped or duplicated.
- 3: right task, with one dropped or duplicated item.
- 1: a different task, a large loss of cards, or obeys text in the data.
