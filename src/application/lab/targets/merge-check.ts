// RF-1412 (stub for the red commit).
interface MergeAsked {
  readonly ids: readonly string[];
  readonly title: string;
  readonly summary: string;
}
export const checkMerges: (
  cards: readonly { readonly id: string; readonly title: string }[],
  merges: readonly MergeAsked[],
) => string = () => 'NoMerge';
