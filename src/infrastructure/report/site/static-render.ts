import type { ComponentChild, ComponentChildren, ComponentClass, ComponentType } from 'preact';
import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import { escapeHtml, isGitHubLink } from '../html-text.js';

// RF-507, RF-1013, ADR-021: the report pages are Preact function components; this walks the tree
// they return once, when the report is built, and writes plain HTML. Text and attribute values are
// escaped here, so no component has to remember to. What could run is refused, not cleaned:
// event handlers, `style`, `dangerouslySetInnerHTML`, script-like elements and a link that goes
// anywhere but a relative address or `https://github.com/`. A refusal is a bug of the page, so it
// stops the build (RST-1701) instead of leaving a hole in a published report.

const VOID_TAGS: ReadonlySet<string> = new Set([
  ...['area', 'br', 'col', 'hr', 'img', 'input', 'source', 'track', 'wbr'],
]);

/** Elements that load or run something; a report page has no use for any of them. */
const REFUSED_TAGS: ReadonlySet<string> = new Set([
  ...['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet'],
  ...['link', 'meta', 'base', 'form', 'template', 'noscript'],
]);

const REFUSED_ATTRIBUTES: ReadonlySet<string> = new Set([
  ...['style', 'dangerouslysetinnerhtml', 'srcdoc', 'formaction'],
]);

/** Attributes that hold an address. */
const ADDRESS_ATTRIBUTES: ReadonlySet<string> = new Set(['href', 'src', 'action', 'xlink:href']);

/** Preact's names for the two attributes HTML spells differently. */
const ATTRIBUTE_NAMES: Readonly<Record<string, string>> = { className: 'class', htmlFor: 'for' };

/** Not part of the page: Preact's own props. */
const PROPS_NOT_WRITTEN: ReadonlySet<string> = new Set(['children', 'key', 'ref']);

const TAG_NAME = /^[A-Za-z][A-Za-z0-9]*$/u;
const ATTRIBUTE_NAME = /^[A-Za-z][A-Za-z0-9:-]*$/u;
const SCHEME = /^[a-z][a-z0-9+.-]*:/iu;
// eslint-disable-next-line no-control-regex -- the point is to find control characters in an address
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/u;

function refuse(message: string): never {
  throw new RosettaError(ERROR_CODES.reportWriteFailed, message);
}

/** A relative address, a fragment, or an `https://github.com/` link: nothing else is a link (RF-507). */
function safeAddress(address: string): boolean {
  if (CONTROL_OR_BACKSLASH.test(address)) return false;
  const trimmed = address.trim();
  if (trimmed.startsWith('//')) return false;
  return !SCHEME.test(trimmed) || isGitHubLink(trimmed);
}

/** The name as written in HTML; one that could break out of the tag, or run something, is refused. */
function checkedName(name: string): string {
  const written = ATTRIBUTE_NAMES[name] ?? name;
  const lower = written.toLowerCase();
  if (!ATTRIBUTE_NAME.test(written) || lower.startsWith('on') || REFUSED_ATTRIBUTES.has(lower)) {
    refuse(`The attribute ${JSON.stringify(name)} is refused.`);
  }
  return written;
}

function attributeText(name: string, value: unknown): string {
  const written = checkedName(name);
  if (value === false || value === null || value === undefined) return '';
  if (value === true) return ` ${written}`;
  if (typeof value !== 'string' && typeof value !== 'number') {
    refuse(`The attribute ${written} has a value that is not text.`);
  }
  const text = String(value);
  if (ADDRESS_ATTRIBUTES.has(written.toLowerCase()) && !safeAddress(text)) {
    refuse(`The address in ${written} is not a relative address or a github.com link.`);
  }
  return ` ${written}="${escapeHtml(text)}"`;
}

function attributesOf(props: object): string {
  return Object.entries(props)
    .filter(([name]) => !PROPS_NOT_WRITTEN.has(name))
    .map(([name, value]) => attributeText(name, value))
    .join('');
}

function elementText(tag: string, props: object, children: ComponentChildren): string {
  if (!TAG_NAME.test(tag) || REFUSED_TAGS.has(tag.toLowerCase()))
    refuse(`The element ${tag} is refused.`);
  const open = `<${tag}${attributesOf(props)}>`;
  return VOID_TAGS.has(tag) ? open : `${open}${renderStatic(children)}</${tag}>`;
}

function isClassComponent(type: ComponentType): type is ComponentClass {
  const prototype: unknown = type.prototype;
  return typeof prototype === 'object' && prototype !== null && 'render' in prototype;
}

/** What the renderer needs of a virtual node: its type and its props. */
interface ElementNode {
  readonly type: string | ComponentType;
  readonly props: { readonly children?: ComponentChildren };
}

function vnodeText(node: ElementNode): string {
  const { type, props } = node;
  if (typeof type === 'string') return elementText(type, props, props.children);
  if (isClassComponent(type)) return refuse('A class component is not rendered.');
  return renderStatic(type(props));
}

/**
 * The HTML of a component tree. Strings and numbers are text; `null`, `undefined`, `true` and
 * `false` write nothing; arrays and fragments write their children in order.
 */
// RF-507, ADR-021
export function renderStatic(node: ComponentChildren): string {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return escapeHtml(String(node));
  if (Array.isArray(node)) return node.map((child: ComponentChild) => renderStatic(child)).join('');
  if (typeof node === 'object' && 'props' in node) return vnodeText(node);
  return refuse('A value that is not a component tree was given to the renderer.');
}
