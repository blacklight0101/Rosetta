import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  loadPlannerSecretRiskPrompt,
  loadReaderPrompts,
} from '../../../../src/infrastructure/prompts/prompt-files.js';
import { loadVerifierPrompts } from '../../../../src/infrastructure/prompts/verifier-prompt-files.js';

// P5-34, RNF-004, RF-145: the reader's rule for a masked value, the verifier's rule and the wording
// of the plan risk are versioned prompt files, and a run records their names and hashes.

describe('the prompt files for a masked value', () => {
  it('P5-34 the reader prompt asks for a claim that a plain-text secret is written where one is masked', async () => {
    const { system } = await loadReaderPrompts('prompts');
    const text = system.text.replaceAll(/\s+/gu, ' ');

    expect(system).toMatchObject({ name: 'reader/area.v12.md', version: 'v12' });
    expect(text).toContain('## Masked values');
    expect(text).toMatch(/\[MASKED:<kind>\]/u);
    expect(text).toContain('a plain-text password is written in');
    expect(text).toMatch(/never write the value/iu);
    expect(text).toMatch(/is masked in the source/u);
    expect(text).toMatch(/only Rosetta masked it/u);
  });

  it('P5-34 the verifier prompt never supports a claim that a masked value is masked in the source', async () => {
    const { system } = await loadVerifierPrompts('prompts');
    const text = system.text.replaceAll(/\s+/gu, ' ');

    expect(system).toMatchObject({ name: 'verifier/claim.v5.md', version: 'v5' });
    expect(text).toMatch(
      /Answer `Rejected` when the claim says a value is masked, hidden or protected/u,
    );
    expect(text).toMatch(/Answer `Supported` .* plain-text .* `?\[MASKED:/u);
  });

  it('P5-34 the plan risk wording is a prompt file with the path and the lines as placeholders', async () => {
    const file = await loadPlannerSecretRiskPrompt('prompts');

    expect(file.name).toBe('shared/secret-risk.v1.md');
    expect(file.text.split('{{path}}')).toHaveLength(2);
    expect(file.text.split('{{lines}}')).toHaveLength(2);
    expect(file.text).toContain('plain-text');
  });

  it('P5-34 the earlier versions stay as they were (ADR-005 style: files are never rewritten)', async () => {
    const old = await readFile('prompts/reader/area.v8.md', 'utf8');

    expect(old).not.toContain('## Masked values');
  });
});
