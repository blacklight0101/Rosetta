// RF-209, P7-02, DEC-194: a Completed run, or a CapReached one that left planned areas unread
// ("Partly read"), can be deepened.

interface EndedFacts {
  readonly endState: string;
  readonly unreadAreas?: number | undefined;
}

export function mayDeepen(
  ended: EndedFacts | undefined,
  run: { readonly unreadAreas: number },
): boolean {
  if (ended?.endState === 'Completed') return true;
  return ended?.endState === 'CapReached' && (ended.unreadAreas ?? run.unreadAreas) > 0;
}
