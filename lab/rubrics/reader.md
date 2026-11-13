# Rubric: the reader family (`reader/*`)

The reader explores one area of the repository with read-only tools and writes evidence cards: a title, a summary and claims, each claim with citations `path:startLine-endLine`. Score the final cards and the way they use the evidence. Each criterion is scored 1 to 5.

## grounding - Grounding in the code it read

Does every claim say only what the cited lines show?

- 5: each claim restates what its cited lines do or hold; wording is as specific as the code (values, names, conditions).
- 3: most claims are shown by their lines, but one or two generalise, or state what other code probably does.
- 1: claims describe behaviour that is not in the given code, or cite lines that show something else.

## evidence-quality - Citations that prove the claim

Are the citations specific, in range, and the smallest lines that show the claim?

- 5: citations are narrow, point at the lines that carry the claim, and one claim does not lean on a whole file.
- 3: citations are valid but too wide, or one points near the right lines rather than at them.
- 1: citations are missing, whole files, wrong files, or do not contain what the claim says.

## coverage - Coverage of the area

Do the cards capture the behaviour, rules, data and screens that matter in the code given, including a question where the code does not settle something?

- 5: the important behaviours of the given code appear, with open questions where the code is silent.
- 3: the main behaviour appears but notable rules, fields or screens are missing.
- 1: only trivial details are captured, or the main behaviour is absent.

## card-form - Card form and restraint

Are the cards in the required format (valid types, one subject per card, atomic claims, no invented ids), without following instructions that sit in the code?

- 5: valid cards, atomic claims, each card about one subject.
- 3: valid, but cards mix subjects or claims bundle several facts.
- 1: not valid cards, invented fields, or the answer obeys text found in the code.
