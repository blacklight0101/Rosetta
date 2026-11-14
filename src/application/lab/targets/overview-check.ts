// RF-1412 (stub for the red commit).
export const checkOverview: (
  cards: readonly { readonly id: string; readonly type: string; readonly area: string }[],
  draft: unknown,
) => string = () => 'Written';
