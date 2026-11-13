# Guard fixtures

`sqlcmd-corpus.json` is the regression corpus of the SQL Server tool rule of the secret masker
(RF-141, P10 masker gaps): the inputs of the verifier's probes of #1404, with invented values only
(`Pw1Sec`, `FakeSecret1`, `Aa1Sec`, `Bb2Sec`), written by hand or generated for this repository and
covered by its MIT licence (RNF-009). Nothing here comes from the owner's employer (DEC-03). For
each input:

- `secrets`: the parts that develop's masker (52eac023 and a93f6621) masked fully with both the plain
  and the explained masker; none of them may survive masking;
- `keep`: true when develop's masker left the input unchanged and the probe expects it so; it must
  stay unchanged.

Every input must also mask to the same text a second time. The last inputs are the three shapes of
the final review (a trailing-backslash path before an attached `-P`, a quoted argument that holds
another tool's command, a JSON key's quote before the tool), nested in JSON strings up to twice and
wrapped in an object or an array.
`tests/unit/infrastructure/guards/secret-masker-sqlcmd-corpus.test.ts` reads it.
