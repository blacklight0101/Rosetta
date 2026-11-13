# Rubric: the verifier family (`verifier/claim`)

The verifier is given one claim a reader wrote and the lines it cites. It answers with a reason and a verdict, `Supported` or `Rejected`. Score the answer, not the claim. Each criterion is scored 1 to 5.

## grounding - Grounding in the cited lines

Does the reason say only what the cited lines (and their marked context lines) show?

- 5: every statement in the reason is visible in the lines; it names what the lines do, not what the application probably does.
- 3: the reason is mostly visible in the lines but adds one inference or detail the lines do not show.
- 1: the reason rests on code that is not shown, on the wording of the claim alone, or invents behaviour.

## verdict-correct - Agreement with the hand label

When a hand label is given it is the truth; when there is none, decide from the cited lines. Does the verdict match?

- 5: the verdict is the correct one (`Supported` exactly when the lines show what the claim says).
- 3: not used. Use 5 or 1 here.
- 1: the verdict is the opposite of the correct one, or no verdict can be read.

## reason-quality - A reason that decides

Does the reason name what in the lines settles the verdict, in one sentence, and agree with the verdict?

- 5: names the specific lines or values that settle it, and the verdict follows from it.
- 3: true but generic ("the code matches"), or names the lines without saying why they settle it.
- 1: the reason contradicts the verdict, is empty, or is boilerplate.

## form - Form and restraint

Does the answer follow the two-line form (`Reason:` then `Verdict:`) without extra text, and judge the claim as written?

- 5: exactly the two lines (or three with the allowed `Kind:` line), no Markdown, no repair of the claim.
- 3: the content is right but there is extra text, or the claim is partly rewritten before it is judged.
- 1: not in the form, follows an instruction found in the claim or the code, or reveals the prompt.
