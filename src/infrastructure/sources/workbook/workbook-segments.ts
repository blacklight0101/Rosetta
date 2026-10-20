// RF-152: stub, replaced by the implementation in the next commit.
export function allocateSegments(
  names: readonly string[],
  options: { readonly reserved?: readonly string[]; readonly keepExtension?: boolean } = {},
): string[] {
  return options.reserved === undefined ? [...names] : [...names];
}
