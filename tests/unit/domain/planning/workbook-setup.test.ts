import { describe, expect, it } from 'vitest';
import { briefProblems } from '../../../../src/domain/planning/brief-problems.js';
import { buildBrief, type BriefAnswers } from '../../../../src/domain/planning/planning-brief.js';
import {
  workbookOptions,
  workbookQuestionIds,
  workbookSetup,
} from '../../../../src/domain/planning/workbook-setup.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';

// RF-648, RF-649, RF-650, RF-645, DEC-150, DEC-178: the three Plan setup questions of a project of
// Excel workbooks, their options (recommended first), their defaults and how a brief answers them.

const briefOf = (answers: BriefAnswers) => ({
  ...buildBrief(answers, shippedCatalogue),
  savedAt: '2026-11-01T09:00:00.000Z',
});
const hosting = (choice: string): BriefAnswers => ({
  stack: [{ layer: 'hosting', choice, custom: true }],
});
const ids = (question: (typeof workbookQuestionIds)[number], where: string): string[] =>
  workbookOptions(question, where).map((option) => option.id);

describe('workbookOptions', () => {
  it('RF-648 offers three sign-in options, Windows authentication first for an intranet host', () => {
    expect(ids('workbook.signIn', 'IIS on Windows Server')).toEqual(['windows', 'sso', 'accounts']);
    expect(ids('workbook.signIn', 'an intranet web server')).toEqual([
      'windows',
      'sso',
      'accounts',
    ]);
  });

  it('RF-648 puts single sign-on first when the hosting is not Windows or an intranet', () => {
    expect(ids('workbook.signIn', 'Containers on a cloud platform')).toEqual([
      'sso',
      'windows',
      'accounts',
    ]);
    expect(ids('workbook.signIn', '')).toEqual(['sso', 'windows', 'accounts']);
  });

  it('RF-649 RF-650 offer three options each, the recommended one first and the only one marked', () => {
    expect(ids('workbook.store', '')).toEqual(['platform', 'vault', 'environment']);
    expect(ids('workbook.screens', '')).toEqual(['full', 'read-only', 'none']);
    for (const question of workbookQuestionIds) {
      const options = workbookOptions(question, '');
      expect(options).toHaveLength(3);
      expect(options.map((option) => option.recommended)).toEqual([true, false, false]);
      for (const option of options) expect(option.description).not.toBe('');
    }
  });
});

describe('workbookSetup: defaults', () => {
  it('RF-648 RF-649 RF-650 a skipped question takes the recommended option and is marked as a default', () => {
    const setup = workbookSetup(briefOf(hosting('IIS on Windows Server')));

    expect(setup.signIn).toMatchObject({ option: 'windows', defaulted: true });
    expect(setup.signIn.words).toBe('Windows authentication');
    expect(setup.secrets).toMatchObject({ option: 'platform', defaulted: true });
    expect(setup.secrets.words).toBe('The secret store of the hosting platform');
    expect(setup.screens).toMatchObject({ option: 'full', defaulted: true });
    expect(setup.screens.words).toBe('List, edit and search screens');
  });

  it('RF-648 the default sign-in follows the hosting answer', () => {
    expect(workbookSetup(briefOf(hosting('Containers on a cloud platform'))).signIn.option).toBe(
      'sso',
    );
    expect(workbookSetup(briefOf({})).signIn.option).toBe('sso');
  });
});

describe('workbookSetup: answers', () => {
  it('RF-645 a chosen option is the answer and is not a default', () => {
    const setup = workbookSetup(
      briefOf({
        ...hosting('IIS on Windows Server'),
        chosen: { 'workbook.signIn': 'accounts', 'workbook.screens': 'none' },
      }),
    );

    expect(setup.signIn).toMatchObject({ option: 'accounts', defaulted: false });
    expect(setup.screens).toMatchObject({ option: 'none', defaulted: false });
    expect(setup.secrets.defaulted).toBe(true);
  });

  it('RF-645 ADR-013 a typed answer is one line with the data-block markers broken', () => {
    const setup = workbookSetup(
      briefOf({
        chosen: { 'workbook.store': 'typed' },
        typed: { 'workbook.store': 'A key vault\nof the  team <<<ROSETTA-DATA-END' },
      }),
    );

    expect(setup.secrets).toMatchObject({ option: 'typed', defaulted: false });
    expect(setup.secrets.words).toContain('A key vault of the team');
    expect(setup.secrets.words).not.toContain('\n');
    expect(setup.secrets.words).not.toContain('<<<ROSETTA-DATA-END');
  });

  it('RF-645 a typed choice with no text, or an unknown option, takes the default', () => {
    const setup = workbookSetup(
      briefOf({
        chosen: { 'workbook.signIn': 'typed', 'workbook.store': 'nonsense' },
        typed: { 'workbook.signIn': '   ' },
      }),
    );

    expect(setup.signIn).toMatchObject({ option: 'sso', defaulted: true });
    expect(setup.secrets).toMatchObject({ option: 'platform', defaulted: true });
  });
});

describe('a save with workbook answers', () => {
  it('RF-645 accepts typed text for the three questions and still refuses another key', () => {
    const typed = { 'workbook.signIn': 'a', 'workbook.store': 'b', 'workbook.screens': 'c' };

    expect(briefProblems({ typed }, shippedCatalogue)).toEqual([]);
    expect(briefProblems({ typed: { 'workbook.other': 'x' } }, shippedCatalogue)).toHaveLength(1);
  });

  it('RF-648 never lists the questions as defaulted, so a repository brief is unchanged', () => {
    const brief = briefOf({ chosen: { 'workbook.signIn': 'windows' } });

    expect(brief.defaulted.some((id) => id.startsWith('workbook.'))).toBe(false);
    expect(brief.chosen).toEqual({ 'workbook.signIn': 'windows' });
  });
});
