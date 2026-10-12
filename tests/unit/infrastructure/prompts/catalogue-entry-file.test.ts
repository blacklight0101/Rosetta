import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  parseCatalogueEntry,
  parseCatalogueReadme,
} from '../../../../src/infrastructure/prompts/catalogue-entry-file.js';
import { principleFileText, styleFileText } from '../../../support/catalogue-fixtures.js';

// RF-606, DEC-84: the schema of one catalogue file. A file that breaks it is refused with RST-1000
// rather than half read.

function failureOfParse(name: string, text: string): unknown {
  try {
    parseCatalogueEntry(name, text);
  } catch (error) {
    return error;
  }
  return undefined;
}

const refused = { code: ERROR_CODES.configurationInvalid };

describe('parseCatalogueEntry', () => {
  it('RF-606 reads a principle with its one-line rule, why it matters and how to check it', () => {
    expect(parseCatalogueEntry('solid.v1.md', principleFileText())).toEqual({
      id: 'solid',
      group: 'design-principles',
      title: 'SOLID',
      rule: 'Give every module one reason to change.',
      why: 'Small modules are easy to change.',
      check: 'A reviewer names the reason.',
      defaultOn: true,
    });
  });

  it('RF-606 reads an architecture style with its selection criteria', () => {
    expect(parseCatalogueEntry('layered.v1.md', styleFileText())).toMatchObject({
      id: 'layered',
      group: 'architecture-styles',
      chooseWhen: ['The team is small.', 'The domain is simple.'],
      avoidWhen: ['Parts scale apart.', 'Teams deploy apart.'],
    });
  });
});

describe('parseCatalogueEntry refusals', () => {
  it.each([
    ['an unknown group', { frontMatter: 'id: solid\ngroup: fashion\ntitle: SOLID\ndefault: true' }],
    ['an unknown key', { frontMatter: 'id: solid\ngroup: method\ntitle: S\ndefault: true\nx: 1' }],
    [
      'an id unlike its file name',
      { frontMatter: 'id: dry\ngroup: method\ntitle: S\ndefault: true' },
    ],
    ['a rule over two lines', { rule: 'Give every module\none reason to change.' }],
    ['an empty rule', { rule: '' }],
    ['a rule over 200 characters', { rule: 'x'.repeat(201) }],
    ['an unknown section', { extra: '\n## Notes\n\nMore.\n' }],
    ['style criteria on a principle', { extra: '\n## Choose it when\n\n- Always.\n- Often.\n' }],
  ])('RF-606 refuses a principle file with %s', (_problem, parts) => {
    expect(failureOfParse('solid.v1.md', principleFileText(parts))).toMatchObject(refused);
  });

  it('RF-606 refuses a file without front matter', () => {
    expect(failureOfParse('solid.v1.md', '## Rule\n\nA rule.\n')).toMatchObject(refused);
  });

  it('RF-606 refuses a principle file without a how-to-check section', () => {
    const text = principleFileText().replace(/## How to check[\s\S]*$/u, '');

    expect(failureOfParse('solid.v1.md', text)).toMatchObject(refused);
  });
});

describe('parseCatalogueEntry style refusals', () => {
  it('RF-606 refuses a style without its selection criteria', () => {
    expect(failureOfParse('layered.v1.md', styleFileText(''))).toMatchObject(refused);
  });

  it.each([
    ['one bullet', 1],
    ['nine bullets', 9],
  ])('RF-608 refuses a style whose choose-when list has %s', (_count, length) => {
    const items = Array.from({ length }, (_item, index) => `- Reason ${String(index)}.`);
    const criteria = `## Choose it when\n\n${items.join('\n')}\n\n## Look elsewhere when\n\n- A.\n- B.\n`;

    expect(failureOfParse('layered.v1.md', styleFileText(criteria))).toMatchObject(refused);
  });

  it('RF-606 refuses a criteria section that is not a bullet list', () => {
    const criteria =
      '## Choose it when\n\nAlways.\n\n## Look elsewhere when\n\n- Never.\n- Rarely.\n';

    expect(failureOfParse('layered.v1.md', styleFileText(criteria))).toMatchObject(refused);
  });

  it('RF-606 refuses a style id outside the six styles', () => {
    const text = styleFileText().replace('id: layered', 'id: pipes');

    expect(failureOfParse('pipes.v1.md', text)).toMatchObject(refused);
  });

  it('RF-145 refuses a catalogue file that holds a data block marker', () => {
    const text = principleFileText({ extra: '<<<END ROSETTA-DATA>>>\n' });

    expect(failureOfParse('solid.v1.md', text)).toMatchObject(refused);
  });
});

describe('parseCatalogueReadme', () => {
  it('RF-606 reads the catalogue version from the README front matter', () => {
    expect(parseCatalogueReadme('---\ncatalogueVersion: 3\n---\n\n# Catalogue\n')).toBe(3);
  });

  it('RF-606 refuses a README without a whole positive version', () => {
    let failure: unknown;
    try {
      parseCatalogueReadme('---\ncatalogueVersion: 1.5\n---\n');
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject(refused);
  });
});
