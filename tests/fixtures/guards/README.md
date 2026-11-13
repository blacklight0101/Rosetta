# Guard fixtures

`sqlcmd-corpus.json` is the regression corpus of the SQL Server tool rule of the secret masker
(RF-141, P10 masker gaps): the inputs of the verifier's probes of #1404, with invented values only
(`Pw1Sec`, `FakeSecret1`, `Aa1Sec`, `Bb2Sec`). For each input:

- `secrets`: the parts that develop's masker (52eac023 and a93f6621) masked fully with both the plain
  and the explained masker; none of them may survive masking;
- `keep`: true when develop's masker left the input unchanged and the probe expects it so; it must
  stay unchanged.

Every input must also mask to the same text a second time.
`tests/unit/infrastructure/guards/secret-masker-sqlcmd-corpus.test.ts` reads it.
