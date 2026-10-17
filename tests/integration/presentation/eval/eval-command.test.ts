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
