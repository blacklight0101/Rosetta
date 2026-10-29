import type { Catalogue } from '../../api/plan-schemas.js';
import { methodLineOf } from './build-method.js';
import { isAnswered, type Draft } from './draft.js';
import { DEFAULTED_NOTE, OWN_NOTE, ownText } from './own-answers.js';
import { CONTEXT_FIELDS, STACK_LAYERS } from './steps.js';

// RF-605, design-system.md section 14 (Plan setup): the "What I recorded" summary. One line for
// each part of the brief, in the words of the artboard; a line that still holds its default says so.

export interface RecordedLine {
  readonly key: string;
  readonly value: string;
  /** True when the question was not answered, so the value is the default (DEC-80). */
  readonly isDefault: boolean;
}

/**
 * RF-645, DEC-184: the words of a question answered by typing, with a note that follows the saved
 * brief: the planner reads the text, or, while the brief still lists the question as defaulted, the
 * plan uses the default until the brief is saved again.
 */
function ownWords(draft: Draft, id: string): string | undefined {
  const text = ownText(draft.chosen, draft.typed, id);
  const note = draft.typedDefaulted.includes(id) ? DEFAULTED_NOTE : OWN_NOTE;
  return text === '' ? undefined : `Your own answer: ${text} (${note})`;
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
  const own = ownWords(draft, 'architecture');
  if (own !== undefined) return { key: 'Architecture', value: own, isDefault: false };
  const value = isAnswered(draft, 'architecture')
    ? titleOf(catalogue, draft.style)
    : `not chosen yet (the package proposes ${titleOf(catalogue, draft.style)})`;
  return { key: 'Architecture', value, isDefault: false };
}

function migrationLine(draft: Draft, catalogue: Catalogue): RecordedLine {
  const own = ownWords(draft, 'migration');
  if (own !== undefined) return { key: 'Migration', value: own, isDefault: false };
  const strategy = catalogue.migrations.find((each) => each.id === draft.migration);
  return {
    key: 'Migration',
    value: strategy?.title ?? draft.migration,
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

/** P6-26: how "What I recorded" says the hosted answer; not stated says nothing. */
const HOSTING_WORDS: Readonly<Partial<Record<Draft['deployment'], string>>> = {
  hosted: 'the new application will be hosted',
  'not-hosted': 'the new application will not be hosted',
};

function contextLine(draft: Draft): RecordedLine {
  const given = CONTEXT_FIELDS.filter((field) => draft.context[field].trim() !== '').length;
  const total = String(CONTEXT_FIELDS.length);
  const hosting = HOSTING_WORDS[draft.deployment];
  const parts = [
    ...(given === 0 ? [] : [`${String(given)} of ${total} answered`]),
    ...(hosting === undefined ? [] : [hosting]),
  ];
  return {
    key: 'Project context',
    value: parts.length === 0 ? 'no answers; listed as open questions' : parts.join('; '),
    isDefault:
      hosting === undefined &&
      !CONTEXT_FIELDS.some((field) => isAnswered(draft, `context.${field}`)),
  };
}

function methodLine(draft: Draft): RecordedLine {
  const own = ownWords(draft, 'buildMethod');
  if (own !== undefined) return { key: 'Build method', value: own, isDefault: false };
  if (!isAnswered(draft, 'buildMethod')) {
    const value = 'not answered yet: the package assumes people will build';
    return { key: 'Build method', value, isDefault: true };
  }
  return { key: 'Build method', value: methodLineOf(draft), isDefault: false };
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
