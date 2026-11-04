// RF-1008, P8-89, P8-109: the kind of a run in the words of the History artboard, in one place so that
// History and the Cost page name runs alike. A Deepen is an understand run that improves another, and
// reads "Deepen, 3 rounds" once it has finished rounds (never "Understand"); a scan is "Scan", a plan
// "Plan" and an understand run that is not a Deepen "Understand".

const kinds: Readonly<Record<string, string>> = {
  scan: 'Scan',
  understand: 'Understand',
  plan: 'Plan',
};

/** `deepenRounds` is the rounds a Deepen has finished (0 before its first), or null for any other run. */
// RF-1008
export function runKindText(stage: string, deepenRounds: number | null): string {
  if (deepenRounds !== null) {
    if (deepenRounds === 0) return 'Deepen';
    return `Deepen, ${String(deepenRounds)} ${deepenRounds === 1 ? 'round' : 'rounds'}`;
  }
  return kinds[stage] ?? stage;
}
