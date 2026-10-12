import type { DraftEditor, FieldIssue } from './use-settings-editor.js';

// P1-41: what every section of the project settings form receives.

export interface SectionProps {
  readonly editor: DraftEditor;
  /** What the last refusal said about the field with this path, if anything. */
  readonly errorFor: (field: string) => FieldIssue | undefined;
  /** The providers a role or a price can name. */
  readonly providers: readonly { readonly value: string; readonly label: string }[];
}
