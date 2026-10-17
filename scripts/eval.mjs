// RNF-006, RNF-012, RNF-015, ADR-008: `npm run eval`, the opt-in golden-set evaluation against
// real models (src/presentation/eval/eval-command.ts). It calls the providers named in
// eval/config.json (or on the command line) with the server keys of .env and costs money within
// the caps of that file; the tests never run it. Results go to the git-ignored eval-out/.
// `--calibration` (RF-305) instead judges the hand-labelled claims of eval/calibration/ with the verifier
// model(s) and reports the agreement with the labels.
// Usage: npm run eval -- [--repetitions n] [--reader provider:model] [--verifier provider:model]
//        npm run eval -- --calibration [--verifier provider:model]
const { runEvalCommand } = await import('../src/presentation/eval/eval-command.ts');

process.exitCode = await runEvalCommand(process.argv.slice(2), process.env, (line) => {
  console.log(line);
});
