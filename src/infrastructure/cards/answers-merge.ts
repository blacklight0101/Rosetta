import type { MergeEdit } from '../../application/ports/answers-file.js';
import {
  fieldLine,
  historyLineOf,
  joinText,
  ofRun,
  runsLineOf,
  sectionsOf,
  splitText,
  type Section,
} from './answers-section-parse.js';

// RF-646, DEC-179, data-model.md section 3.16: the lines a merge of duplicates keeps in the section
// that survives: `- Runs:` names the runs whose cards raised the question, and one `- History:` line
// holds each older answer that lost to a newer one. Nothing else changes and no section is deleted.

const same = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((each, index) => each === right[index]);

/** The lines to add after the section, and the new `- Runs:` line when the section's differs. */
function linesFor(section: Section, edit: MergeEdit, lines: string[]): string[] {
  const added: string[] = [];
  if (edit.runs.length > 1 && !same(section.runs ?? [], edit.runs)) {
    const line = fieldLine('Runs', runsLineOf(edit.runs));
    if (section.runsLine === undefined) added.push(line);
    else lines[section.runsLine] = line;
  }
  for (const record of edit.history) {
    const kept = section.history.some(
      (each) => each.runKey === record.runKey && each.answer === record.answer,
    );
    if (!kept && record.answer !== '') added.push(fieldLine('History', historyLineOf(record)));
  }
  return added;
}

/** The text with the edits applied; the same text when there is nothing to add. */
export function withMerges(text: string, edits: readonly MergeEdit[]): string {
  const split = splitText(text);
  const inserts = new Map<number, string[]>();
  for (const edit of edits) {
    const section = ofRun(sectionsOf(split.lines), edit.runKey).find(
      (each) => each.cardId === edit.cardId,
    );
    if (section === undefined) continue;
    const added = linesFor(section, edit, split.lines);
    if (added.length > 0)
      inserts.set(section.lastLine, [...(inserts.get(section.lastLine) ?? []), ...added]);
  }
  return joinText(split, inserts);
}
