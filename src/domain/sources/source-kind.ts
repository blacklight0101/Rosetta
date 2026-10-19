// Skeleton: the behaviour arrives with the feat commit.
export const SOURCE_KINDS = ['github', 'upload'] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- skeleton until the feat commit
export function sourceKindOf(_record: { readonly kind?: SourceKind | undefined }): SourceKind {
  return 'github';
}
