import type {
  MarkupElement,
  MarkupLines,
  PageMarkup,
} from '../../../../domain/cards/page-markup.js';
import { lineAt, lineStartsOf, tagsOf, withoutServerComments, type Tag } from './webforms-tags.js';

// P5-31, RF-626, RF-111, DEC-11: the elements of a WebForms page (`.aspx`, `.ascx`, `.master`) that
// a screen card states: its fields, buttons and links, each with the lines that show it, and the
// lines of the page directive. A language pack's job is to know this markup, so the cards never do.

type Kind = 'field' | 'button' | 'link';

const fixedKinds = new Map<string, Kind>([
  ...[
    'asp:textbox',
    'asp:dropdownlist',
    'asp:listbox',
    'asp:checkbox',
    'asp:checkboxlist',
    'asp:radiobutton',
    'asp:radiobuttonlist',
    'asp:calendar',
    'asp:fileupload',
    'textarea',
    'select',
  ].map((name): [string, Kind] => [name, 'field']),
  ...['asp:button', 'asp:imagebutton', 'asp:linkbutton', 'button'].map((name): [string, Kind] => [
    name,
    'button',
  ]),
]);
const buttonInputs = new Set(['submit', 'button', 'image']);
const fieldInputs = new Set([
  '',
  'text',
  'password',
  'email',
  'number',
  'date',
  'datetime-local',
  'time',
  'tel',
  'url',
  'search',
  'checkbox',
  'radio',
  'file',
]);

function inputKind(tag: Tag): Kind | undefined {
  const type = (tag.attributes.get('type') ?? '').toLowerCase();
  if (buttonInputs.has(type)) return 'button';
  return fieldInputs.has(type) ? 'field' : undefined;
}

function linkKind(tag: Tag): Kind | undefined {
  const { name, attributes } = tag;
  if (name === 'a') return attributes.has('href') ? 'link' : undefined;
  if (name === 'asp:hyperlink') return attributes.has('navigateurl') ? 'link' : undefined;
  return undefined;
}

function kindOf(tag: Tag): Kind | undefined {
  const fixed = fixedKinds.get(tag.name);
  if (fixed !== undefined) return fixed;
  return tag.name === 'input' ? inputKind(tag) : linkKind(tag);
}

function textOf(tag: Tag): string {
  const own = tag.attributes.get('text') ?? tag.attributes.get('value') ?? '';
  return (own === '' ? tag.text : own).trim();
}

function targetOf(tag: Tag, kind: Kind): string | undefined {
  const { attributes } = tag;
  const value =
    kind === 'link'
      ? (attributes.get('href') ?? attributes.get('navigateurl'))
      : attributes.get('onclick');
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

interface Labelled extends MarkupLines {
  readonly names: readonly string[];
}

interface Context {
  readonly labels: ReadonlyMap<string, Labelled>;
  readonly validators: ReadonlyMap<string, MarkupLines>;
}

function lowerAttribute(tag: Tag, ...keys: readonly string[]): string {
  const key = keys.find((each) => tag.attributes.has(each));
  return (key === undefined ? '' : (tag.attributes.get(key) ?? '')).toLowerCase();
}

function contextOf(tags: readonly Tag[], lines: (tag: Tag) => MarkupLines): Context {
  const labels = new Map<string, Labelled>();
  const validators = new Map<string, MarkupLines>();
  for (const tag of tags) {
    const isLabel = tag.name === 'label' || tag.name === 'asp:label';
    const labelFor = lowerAttribute(tag, 'associatedcontrolid', 'for');
    if (isLabel && labelFor !== '' && textOf(tag) !== '' && !labels.has(labelFor)) {
      labels.set(labelFor, { names: [textOf(tag)], ...lines(tag) });
    }
    const checked = lowerAttribute(tag, 'controltovalidate');
    if (tag.name === 'asp:requiredfieldvalidator' && checked !== '' && !validators.has(checked)) {
      validators.set(checked, lines(tag));
    }
  }
  return { labels, validators };
}

function fieldElement(tag: Tag, lines: MarkupLines, context: Context): MarkupElement {
  const { attributes } = tag;
  const id = attributes.get('id') ?? '';
  const names = [id, attributes.get('name') ?? '', attributes.get('placeholder') ?? ''];
  const label = context.labels.get(id.toLowerCase());
  const validator = context.validators.get(id.toLowerCase());
  const marked = attributes.has('required');
  return {
    kind: 'field',
    names: names.filter((name) => name !== ''),
    text: '',
    required: marked || validator !== undefined,
    ...lines,
    ...(label === undefined ? {} : { label }),
    ...(validator === undefined || marked ? {} : { requiredBy: validator }),
  };
}

function actionElement(
  tag: Tag,
  kind: 'button' | 'link',
  lines: MarkupLines,
): MarkupElement | undefined {
  const text = textOf(tag);
  if (kind === 'link' && text === '') return undefined;
  const target = targetOf(tag, kind);
  const id = tag.attributes.get('id') ?? '';
  return {
    kind,
    names: kind === 'button' && id !== '' ? [id] : [],
    text,
    ...(target === undefined ? {} : { target }),
    ...lines,
  };
}

function elementOf(tag: Tag, lines: MarkupLines, context: Context): MarkupElement | undefined {
  const kind = kindOf(tag);
  if (kind === undefined) return undefined;
  return kind === 'field' ? fieldElement(tag, lines, context) : actionElement(tag, kind, lines);
}

function pageLines(source: string, lineStarts: readonly number[]): MarkupLines {
  const open = source.indexOf('<%@');
  const close = open < 0 ? -1 : source.indexOf('%>', open);
  if (close < 0) return { startLine: 1, endLine: 1 };
  return { startLine: lineAt(lineStarts, open), endLine: lineAt(lineStarts, close + 1) };
}

/**
 * The fields, buttons and links of a WebForms page, in document order, with their lines; undefined
 * for a file that is not a page, control or master page. Only a page (`.aspx`) has its route in its
 * file path.
 */
export function webFormsMarkup(path: string, text: string): PageMarkup | undefined {
  const lower = path.toLowerCase();
  const isPage = lower.endsWith('.aspx');
  if (!isPage && !lower.endsWith('.ascx') && !lower.endsWith('.master')) return undefined;
  const source = withoutServerComments(text);
  const starts = lineStartsOf(source);
  const lines = (tag: Tag): MarkupLines => ({
    startLine: lineAt(starts, tag.start),
    endLine: lineAt(starts, tag.end),
  });
  const tags = tagsOf(source);
  const context = contextOf(tags, lines);
  const elements = tags.flatMap((tag) => elementOf(tag, lines(tag), context) ?? []);
  return {
    path,
    route: isPage ? 'file' : 'elsewhere',
    page: pageLines(source, starts),
    elements,
  };
}
