import { expect, it } from 'vitest';
import { groupNotCovered, splitUnreadFiles } from '../../../web/src/lib/group-not-covered.js';

// RF-264, P1-173: the groups of "What was not covered" come in a fixed order and never drop a line.

const lines = [
  'Z: the run ended before its reader finished.',
  'Y: no card passed the citation check and the judgement.',
  'Strange sentence nobody planned for',
  'X: its reader could not finish (boom).',
  'W: third-party code; nothing about the application was read from it.',
  'V: not selected for this run.',
];

it('RF-264 puts the groups in the fixed order of the reasons, "Other" last', () => {
  expect(groupNotCovered(lines).map((group) => group.title)).toEqual([
    'Not selected for this run',
    'Third-party code',
    'Its reader could not finish',
    'The run ended before its reader finished',
    'No card passed the citation check and the judgement',
    'Other',
  ]);
});

it('RF-264 never drops a line: an unknown sentence stays whole under "Other"', () => {
  const groups = groupNotCovered(lines);

  expect(groups.flatMap((group) => group.lines)).toHaveLength(lines.length);
  expect(groups.find((group) => group.title === 'Other')?.lines).toEqual([
    'Strange sentence nobody planned for',
  ]);
});

it('RF-264 shows only the area where the reason is the same for the group, the whole sentence otherwise', () => {
  const groups = groupNotCovered(lines);

  expect(groups[0]?.lines).toEqual(['V']);
  expect(groups[2]?.lines).toEqual(['X: its reader could not finish (boom).']);
});

it('RF-264 sets the line about first-party files not read apart from the area groups, whole', () => {
  const unread =
    'First-party files not read: 41 files, 97% of first-party tokens not read. Next step: run a Deepen to read them.';

  const split = splitUnreadFiles([unread, ...lines]);

  expect(split.unread).toBe(unread);
  expect(split.areas).toEqual(lines);
  expect(splitUnreadFiles(lines).unread).toBeUndefined();
});
