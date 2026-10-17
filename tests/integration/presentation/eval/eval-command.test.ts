import { describe, expect, it } from 'vitest';
import { runEvalCommand } from '../../../../src/presentation/eval/eval-command.js';

// RF-143, RNF-006, ADR-007: `npm run eval` sends source code to the chosen providers and spends
// money, so running it is not consent on its own. Without --yes it shows the providers, models,
// caps and source it would use, then stops before the scan and before any model call.

describe('npm run eval without --yes', () => {
  it('RF-143 shows the providers, models, caps and source, then stops before anything is sent', async () => {
    const lines: string[] = [];
    const code = await runEvalCommand([], {}, (line) => lines.push(line));
    const text = lines.join('\n');

    expect(code).toBe(1);
    expect(text).toContain('reader: openai gpt-5-nano');
    expect(text).toContain('$0.50');
    expect(text).toContain('$1.50');
    expect(text).toContain('github.com/dotnet-architecture/eShopModernizing');
    expect(text).toContain('Nothing was sent. Run again with --yes');
    expect(text).not.toContain('Evaluation written');
  });
});

describe('npm run eval -- --calibration without --yes', () => {
  it('RF-143 RF-305 shows the claims, the models and the cap, then stops before anything is sent', async () => {
    const lines: string[] = [];
    const code = await runEvalCommand(['--calibration'], {}, (line) => lines.push(line));
    const text = lines.join('\n');

    expect(code).toBe(1);
    expect(text).toContain('judges 30 hand-labelled claims');
    expect(text).toContain('tests/fixtures/repos/webforms-shop');
    expect(text).toContain('verifier: openai gpt-5.6-luna');
    expect(text).toContain('verifier: openai gpt-5-nano');
    expect(text).toContain('$0.20');
    expect(text).toContain('Nothing was sent. Run again with --yes');
    expect(text).not.toContain('Calibration written');
  });

  it('RF-305 uses the model given for the verifier instead of those of the settings', async () => {
    const lines: string[] = [];
    await runEvalCommand(['--calibration', '--verifier', 'openai:gpt-5-nano'], {}, (line) =>
      lines.push(line),
    );
    const text = lines.join('\n');

    expect(text).toContain('verifier: openai gpt-5-nano');
    expect(text).not.toContain('gpt-5.6-luna');
  });

  it('RF-305 stops with a message when the settings name no calibration set', async () => {
    const lines: string[] = [];
    const code = await runEvalCommand(['--calibration', '--config', 'no-such.json'], {}, (line) =>
      lines.push(line),
    );

    expect(code).toBe(1);
    expect(lines.join('\n')).toContain('no-such.json');
  });
});
