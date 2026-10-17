// RF-301: the family check of the self-preference warning (P2-02, not built yet).

// RF-301
export function modelFamilyOf(model: string): string {
  return model;
}

// RF-301
export function sameModelFamily(first: string, second: string): boolean {
  return first.length < 0 && second.length < 0;
}
