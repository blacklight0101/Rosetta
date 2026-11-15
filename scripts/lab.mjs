// RF-1400, RF-1402, DEC-231, ADR-008, ADR-029: `npm run lab`, the opt-in prompt lab
// (src/presentation/lab/lab-command.ts). It sends the real messages of one prompt over a case set
// to one model with the server keys of .env and costs money within the caps of lab/config.json and
// the shared ledger lab-out/ledger.jsonl; the tests never run it. Results go to the git-ignored
// lab-out/. Usage: npm run lab -- --prompt <id> --version <vN|file> --model <provider:model>
//   --cases <set> [--repetitions n] [--yes]   or   npm run lab -- --compare <runA> <runB>
const { runLabCommand } = await import('../src/presentation/lab/lab-command.ts');

process.exitCode = await runLabCommand(process.argv.slice(2), process.env, (line) => {
  console.log(line);
});
