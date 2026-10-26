// P5-31, RF-626, DEC-11: what a language pack tells the cards about the markup of a page: each
// field, button and link with the lines that show it. The shape knows no stack; the pack that reads
// the markup of a stack fills it.

/** A 1-based, inclusive line range of a page file. */
export interface MarkupLines {
  readonly startLine: number;
  readonly endLine: number;
}

export interface MarkupElement extends MarkupLines {
  readonly kind: 'field' | 'button' | 'link';
  /** The names the element carries itself: its id, name or placeholder. */
  readonly names: readonly string[];
  /** The label that names a field, with its own lines, when it is a separate element. */
  readonly label?: MarkupLines & { readonly names: readonly string[] };
  /** The visible text of a button or link; empty for a field. */
  readonly text: string;
  /** The target of a link, or the handler of a button; absent for a button with none. */
  readonly target?: string;
  /** A field only: a required attribute or a validator for it is in the markup. */
  readonly required?: boolean;
  /** The lines of the validator that makes a field required, when it is not the field itself. */
  readonly requiredBy?: MarkupLines;
}

export interface PageMarkup {
  readonly path: string;
  /** `file`: the route of the page is its file path; `elsewhere`: it is configured outside the page. */
  readonly route: 'file' | 'elsewhere';
  /** The page directive, or line 1 of a page without one. */
  readonly page: MarkupLines;
  readonly elements: readonly MarkupElement[];
}
