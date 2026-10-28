import type { Catalogue } from '../../api/plan-schemas.js';
import { methodLineOf } from './build-method.js';
import { isAnswered, type Draft } from './draft.js';
import { ownText } from './own-answers.js';
import { CONTEXT_FIELDS, STACK_LAYERS } from './steps.js';

// RF-605, design-system.md section 14 (Plan setup): the "What I recorded" summary. One line for
// each part of the brief, in the words of the artboard; a line that still holds its default says so.

export interface RecordedLine {
  readonly key: string;
  readonly value: string;
  /** True when the question was not answered, so the value is the default (DEC-80). */
  readonly isDefault: boolean;
}

/** RF-645: the words of a question answered by typing, or undefined. */
function ownWords(draft: Draft, id: string): string | undefined {
  const text = ownText(draft.chosen, draft.typed, id);
  return text === '' ? undefined : `Your own answer: ${text}`;
}

function titleOf(catalogue: Catalogue, id: string): string {
  return catalogue.entries.find((entry) => entry.id === id)?.title ?? id;
}

function principlesLine(draft: Draft, catalogue: Catalogue): RecordedLine {
  const names = draft.principles.map((id) => titleOf(catalogue, id));
  const value = names.length === 0 ? 'none' : `${String(names.length)} on: ${names.join(', ')}`;
  const own = ownWords(draft, 'principles');
  const shown = own === undefined ? value : `${value}. ${own}`;
  return { key: 'Principles', value: shown, isDefault: !isAnswered(draft, 'principles') };
}

function architectureLine(draft: Draft, catalogue: Catalogue): RecordedLine {
  const chosen = isAnswered(draft, 'architecture');
  const value = chosen
    ? (ownWords(draft, 'architecture') ?? titleOf(catalogue, draft.style))
    : `not chosen yet (the package proposes ${titleOf(catalogue, draft.style)})`;
  return { key: 'Architecture', value, isDefault: false };
}

function migrationLine(draft: Draft, catalogue: Catalogue): RecordedLine {
  const strategy = catalogue.migrations.find((each) => each.id === draft.migration);
  return {
    key: 'Migration',
    value: ownWords(draft, 'migration') ?? strategy?.title ?? draft.migration,
    isDefault: !isAnswered(draft, 'migration'),
  };
}

function stackLine(draft: Draft): RecordedLine {
  const picked = STACK_LAYERS.filter((layer) => draft.stack[layer.id] !== undefined).length;
  const total = String(STACK_LAYERS.length);
  const value =
    picked === 0 ? 'not chosen yet' : `${String(picked)} of ${total} layers: ${stackNames(draft)}`;
  return { key: 'Stack', value, isDefault: false };
}

function stackNames(draft: Draft): string {
  return STACK_LAYERS.flatMap((layer) => draft.stack[layer.id]?.choice ?? []).join(', ');
}

function contextLine(draft: Draft): RecordedLine {
  const given = CONTEXT_FIELDS.filter((field) => draft.context[field].trim() !== '').length;
  const total = String(CONTEXT_FIELDS.length);
  const none = 'no answers; listed as open questions';
  return {
    key: 'Project context',
    value: given === 0 ? none : `${String(given)} of ${total} answered`,
    isDefault: !CONTEXT_FIELDS.some((field) => isAnswered(draft, `context.${field}`)),
  };
}

function methodLine(draft: Draft): RecordedLine {
  if (!isAnswered(draft, 'buildMethod')) {
    const value = 'not answered yet: the package assumes people will build';
    return { key: 'Build method', value, isDefault: true };
  }
  const value = ownWords(draft, 'buildMethod') ?? methodLineOf(draft);
  return { key: 'Build method', value, isDefault: false };
}

/** The six lines of "What I recorded", in step order. */
// RF-605
export function recordedLines(draft: Draft, catalogue: Catalogue): readonly RecordedLine[] {
  return [
    principlesLine(draft, catalogue),
    architectureLine(draft, catalogue),
    migrationLine(draft, catalogue),
    stackLine(draft),
    contextLine(draft),
    methodLine(draft),
  ];
}
