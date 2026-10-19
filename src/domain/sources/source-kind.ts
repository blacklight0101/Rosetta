// RF-130, RFC-004 section 4.1, DEC-148: a project's source is one of two kinds. `github` is a public
// repository pinned to a commit; `upload` is a zip the user sent. A stored record that does not say
// which kind it is was written before uploads existed and is a GitHub one.

export const SOURCE_KINDS = ['github', 'upload'] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

/** The kind a record names; a record without one is a GitHub record. */
// RF-130
export function sourceKindOf(record: { readonly kind?: SourceKind | undefined }): SourceKind {
  return record.kind ?? 'github';
}
