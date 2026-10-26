import type { Citation } from './citation.js';
import type { ScreenAction, ScreenDetail, ScreenField, ScreenInput } from './flow-screen.js';
import { nameHolds, wordsOf } from './name-words.js';
import type { MarkupElement, MarkupLines, PageMarkup } from './page-markup.js';

// P5-31, P3-122, RF-626, ADR-005: the claims of a screen that its page markup can state. The
// markup comes from a language pack (DEC-11); here an item the agent named is matched to the one
// element that shows it, so its claim cites that element's lines and nothing else, and says only
// what those lines show. An item the markup does not show keeps the claim it had.

function citationOf(markup: PageMarkup, lines: MarkupLines): Citation {
  return { path: markup.path, startLine: lines.startLine, endLine: lines.endLine };
}

const sameText = (left: string, right: string): boolean =>
  left.trim().toLowerCase() === right.trim().toLowerCase();

interface Located {
  readonly markup: PageMarkup;
  readonly element: MarkupElement;
}

function elementsOf(
  markups: readonly PageMarkup[],
  kinds: readonly MarkupElement['kind'][],
): Located[] {
  return markups.flatMap((markup) =>
    markup.elements
      .filter((element) => kinds.includes(element.kind))
      .map((element) => ({ markup, element })),
  );
}

/** What the markup shows of a field: whether it is required, and the lines that show it. */
export interface FieldShown {
  readonly required: boolean;
  readonly citations: readonly Citation[];
}

/** The field element that carries the name, or the one a label of that name belongs to. */
export function fieldShown(
  markups: readonly PageMarkup[],
  field: Pick<ScreenField, 'name'>,
): FieldShown | undefined {
  const fields = elementsOf(markups, ['field']);
  const own = fields.find(({ element }) => element.names.some((n) => nameHolds(n, field.name)));
  const labelled = fields.find(({ element }) =>
    element.label?.names.some((n) => nameHolds(n, field.name)),
  );
  const found = own ?? labelled;
  if (found === undefined) return undefined;
  const { markup, element } = found;
  const label = own === undefined && element.label !== undefined ? [element.label] : [];
  const required = element.required === true;
  const validator = required && element.requiredBy !== undefined ? [element.requiredBy] : [];
  return {
    required,
    citations: [element, ...label, ...validator].map((lines) => citationOf(markup, lines)),
  };
}

/** A button or link of the markup that an action of the screen names. */
export interface ActionShown {
  readonly kind: 'link' | 'button';
  readonly citations: readonly Citation[];
}

export function actionShown(
  markups: readonly PageMarkup[],
  action: ScreenAction,
): ActionShown | undefined {
  const { handler, flow, label } = action;
  if (handler === undefined || flow !== undefined) return undefined;
  const wanted = wordsOf(label).join(' ');
  const found = elementsOf(markups, ['button', 'link']).find(
    ({ element }) =>
      element.target !== undefined &&
      sameText(element.target, handler) &&
      wordsOf(element.text).join(' ') === wanted,
  );
  if (found === undefined || found.element.kind === 'field') return undefined;
  return { kind: found.element.kind, citations: [citationOf(found.markup, found.element)] };
}

/** The link of the markup that leads to a target. */
export function linkShown(
  markups: readonly PageMarkup[],
  target: string,
): { readonly text: string; readonly citations: readonly Citation[] } | undefined {
  const found = elementsOf(markups, ['link']).find(
    ({ element }) => element.target !== undefined && sameText(element.target, target),
  );
  if (found === undefined) return undefined;
  return { text: found.element.text, citations: [citationOf(found.markup, found.element)] };
}

function routeForm(route: string): string {
  const slashed = route.trim().replaceAll('\\', '/').replace(/^~/u, '');
  return (slashed.startsWith('/') ? slashed : `/${slashed}`).toLowerCase();
}

/**
 * The page directive that shows the route, when the route of the screen is the file path of a
 * page whose route is its file path. A page whose route is configured elsewhere, or a route that
 * is not the path, is no claim of the file (the code cannot show it).
 */
export function routeShown(
  markups: readonly PageMarkup[],
  route: string,
): { readonly path: string; readonly citations: readonly Citation[] } | undefined {
  const page = markups.find(
    (markup) => markup.route === 'file' && routeForm(route) === routeForm(markup.path),
  );
  if (page === undefined) return undefined;
  return { path: page.path, citations: [citationOf(page, page.page)] };
}

/** The screen as a card keeps it: no markup, and a field required only when the markup shows it. */
export function settledScreen(screen: ScreenInput): ScreenDetail {
  const { markup = [], ...kept } = screen;
  if (markup.length === 0) return kept;
  const route = routeShown(markup, screen.route);
  const fields = screen.fields.map((field) => {
    const shown = fieldShown(markup, field);
    return shown === undefined ? field : { ...field, required: shown.required };
  });
  return { ...kept, route: route === undefined ? screen.route : `/${route.path}`, fields };
}
