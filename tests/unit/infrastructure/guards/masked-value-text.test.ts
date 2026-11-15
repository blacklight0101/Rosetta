import { describe, expect, it } from 'vitest';
import { SecretMasker, SECRET_KINDS } from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  explainedMasker,
  loadMaskedValuePrompt,
  maskedValueReplacement,
} from '../../../../src/infrastructure/prompts/masked-value-prompt.js';
import { loadPromptFile } from '../../../../src/infrastructure/prompts/prompt-files.js';
import { fakePassword, configText } from '../../../support/masked-secret-fixtures.js';

// P5-34, RF-141, RNF-004: the text a masked value is replaced with tells the model that a secret
// value is written there in the code in plain text and that Rosetta masked it. The wording is a
// versioned prompt file; the masker reads it, no code holds it.

const kinds = {
  password: 'Password=Fake-Pw-7731',
  'api-key': 'api_key = "sk-FAKEFAKEFAKEFAKEFAKEFAKE0123456789"',
  'bearer-token': 'Authorization: Bearer FAKEFAKEFAKEFAKE0123456789abcdef',
  'connection-string': 'Server=DB01;Database=School;User Id=sa;Password=Fake-Pw-7731;',
  'private-key':
    '-----BEGIN RSA PRIVATE KEY-----\nFAKEFAKEFAKEFAKEFAKEFAKE\n-----END RSA PRIVATE KEY-----',
} as const;

async function explained(): Promise<SecretMasker> {
  const file = await loadMaskedValuePrompt('prompts');
  return new SecretMasker(undefined, maskedValueReplacement(file));
}

describe('the replacement text of a masked value', () => {
  it('P5-34 comes from a versioned prompt file with the kind as its one placeholder', async () => {
    const file = await loadMaskedValuePrompt('prompts');

    expect(file.name).toBe('shared/masked-value.v2.md');
    expect(file.version).toBe('v2');
    expect(file.text.split('{{kind}}')).toHaveLength(2);
  });

  it('P5-34 says a secret value is written there in plain text and Rosetta masked it', async () => {
    const masked = (await explained()).mask(configText).text;

    expect(masked).toMatch(
      /Password=\[MASKED:connection-string\] \(.*plain text.*Rosetta masked it/u,
    );
    expect(masked).not.toContain(fakePassword);
  });

  it('P5-34 keeps the marker RF-141 names, and the lines where they were', async () => {
    const masked = (await explained()).mask(configText).text;

    expect(masked.split('\n')).toHaveLength(configText.split('\n').length);
    expect(masked).toContain('[MASKED:');
  });

  it('P5-34 the default replacement stays the bare marker of RF-141', () => {
    expect(new SecretMasker().mask('Password=Fake-Pw-7731').text).toBe(
      'Password=[MASKED:password]',
    );
  });

  it.each(SECRET_KINDS)('P5-34 masking the text of %s again changes nothing', async (kind) => {
    const masker = await explained();
    const once = masker.mask(kinds[kind]).text;

    expect(once).toContain(`[MASKED:`);
    expect(masker.mask(once).text).toBe(once);
    expect(masker.mask(once).counts[kind]).toBe(0);
  });

  it('P5-34 the note holds no character a secret rule reads as the end or the start of a value', async () => {
    const file = await loadMaskedValuePrompt('prompts');
    const note = file.text.slice(file.text.indexOf('('));

    expect(note).not.toMatch(/[;"'/<=:`]/u);
  });
});

describe('the note of masked-value v2 (P10-15, DEC-244)', () => {
  it('P10-15 tells the model to report it, never repeat it, and that it must move and be replaced', async () => {
    const masked = (await explained()).mask(configText).text;

    expect(masked).toMatch(/report it at this line/u);
    expect(masked).toMatch(/never ask for or repeat the value/u);
    expect(masked).toMatch(/exposed and must move to a secret store and be replaced/u);
  });

  it('P10-15 keeps v1 in the repository, loadable by its name', async () => {
    const file = await loadPromptFile('prompts', 'shared/masked-value.v1.md');

    expect(file.version).toBe('v1');
    expect(file.text).not.toMatch(/secret store/u);
  });
});

describe('the masker of the composition root', () => {
  it('P5-34 the masker the composition root builds sends the note (catches a bare masker there)', () => {
    const masked = explainedMasker('prompts').mask(configText).text;

    expect(masked).toMatch(/\[MASKED:[a-z-]+\] \(.*written here in plain text.*Rosetta masked it/u);
    expect(masked).not.toContain(fakePassword);
  });
});
