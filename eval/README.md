# Evaluation inputs

The inputs of `npm run eval` (RNF-006, RNF-012, RNF-015; data-model.md section 3.19): `config.json` names the models
and the caps, and `golden/` holds the hand-checked golden sets. The command shows the models, caps and source first
and starts the paid runs only with `--yes` (RF-143). Results go to the git-ignored `eval-out/`.

## Provenance (RNF-009)

`golden/eshop-webforms.json` describes the eShopLegacyWebForms application of
[dotnet-architecture/eShopModernizing](https://github.com/dotnet-architecture/eShopModernizing) (MIT licence, copyright
.NET Foundation and Contributors) at commit `63bc9ec4414d7e281dc9f9d7bdcf70030950457d`, subpath
`eShopLegacyWebFormsSolution/src/eShopLegacyWebForms`. Its findings and "not in the code" cases were written for this
repository by reading the code at that commit; each finding cites the lines that show it. The statements are our own
words: no text of the application is copied. The file is covered by this repository's MIT licence.

`config.json` and this file were written for this repository. Nothing here comes from the owner's employer (DEC-03).
