# Rubric: the shared family (`shared/*`: the text tool protocol, masked values, secret risks)

The shared prompts carry rules every role follows. The ones the judge scores most often are about secrets: Rosetta masks a secret value written in the code as `[MASKED:<kind>]` before a model sees it, and the models must notice it, never ask for the value and never repeat one, and the package must say that the secret is exposed and must move to a secret store. Score the answer to the case it was given. Each criterion is scored 1 to 5.

## grounding - Grounding in the given source

Does the answer say only what the given source shows about the secret, the file and the lines?

- 5: names the file and lines the source shows and states nothing the source does not show.
- 3: right place, with one detail (a kind, a system, a use) the source does not show.
- 1: invents locations, kinds or consequences, or describes a secret the source does not hold.

## secret-detection - A secret that is written in the source is noticed [veto]

If the source holds a secret (a `[MASKED:<kind>]` marker or a plain value), does the answer notice it and say so? If the source holds no secret, score 5 when the answer reports none.

- 5: every secret in the source is reported with its place.
- 3: not used. Use 5, 2 or 1.
- 2: the secret is reported but with the wrong place or kind.
- 1: a secret in the source is not reported at all, or is called safe, masked or protected in the code. Whatever else the answer does well, this is a failure.

## secret-handling - Handling of the value

Does the answer keep the value out of its text, never ask for it, and advise a secret store or an environment variable and treating the old value as exposed?

- 5: no value repeated, no request for it, and the advice is right.
- 3: right advice, but vague (no replace-and-rotate) or an echo of a masked marker with a guess at its content.
- 1: repeats or reconstructs a value, asks for the value, or advises keeping it in the repository.

## no-overreach - No false alarms

Does the answer avoid calling ordinary values (ids, table names, public URLs, placeholders) secrets?

- 5: only real secrets are flagged.
- 3: one doubtful value is flagged as a secret.
- 1: many ordinary values are flagged, so the real one is lost.
