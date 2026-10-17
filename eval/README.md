# Evaluation inputs

The inputs of `npm run eval` (RNF-006, RNF-012, RNF-015; data-model.md section 3.19): `config.json` names the models
and the caps, `golden/` holds the hand-checked golden sets and `calibration/` the hand-labelled claims with which
`npm run eval -- --calibration` measures how far each model agrees with a person as a verifier (RF-305). The command shows the models, caps and source first
and starts the paid runs only with `--yes` (RF-143). Results go to the git-ignored `eval-out/`.

The golden set also holds the steps of the expected flows (`kind` `step`), the fields and actions of the expected
screens (`field`, `action`) and the relations of the entities (`relation`), each with `of` naming its flow, screen or
entity (RF-260..RF-263, P2-23). `npm run eval` prints the step recall, the screen field recall and the relation
precision beside the existing measures; they have no target yet.

## Provenance (RNF-009)

`golden/eshop-webforms.json` describes the eShopLegacyWebForms application of
[dotnet-architecture/eShopModernizing](https://github.com/dotnet-architecture/eShopModernizing) (MIT licence, copyright
.NET Foundation and Contributors) at commit `63bc9ec4414d7e281dc9f9d7bdcf70030950457d`, subpath
`eShopLegacyWebFormsSolution/src/eShopLegacyWebForms`. Its findings and "not in the code" cases were written for this
repository by reading the code at that commit; each finding cites the lines that show it. The statements are our own
words: no text of the application is copied. The file is covered by this repository's MIT licence.

`calibration/webforms-shop.json` holds thirty claims, fifteen supported and fifteen not, about the synthetic
`webforms-shop` fixture of this repository (`tests/fixtures/repos/webforms-shop`, written for this repository, MIT
licence, no text of eShopModernizing). Each claim cites lines of that fixture and carries a hand label (whether the cited
lines, with the three lines of margin the verifier sees, show what the claim says) and a note that says why. The claims
and notes are our own words. The command reads the lines from the fixture, so the set needs no download.

`config.json` and this file were written for this repository. Nothing here comes from the owner's employer (DEC-03).
