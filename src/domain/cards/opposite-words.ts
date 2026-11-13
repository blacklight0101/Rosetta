// P9-13, P9-14, RF-645: the words that say the opposite of each other. A question that swaps one for
// the other asks something else, so two such questions are never merged as one. The rule is the
// domain's; the application's `sameQuestion` only asks it.

const oppositePairs: readonly (readonly [string, string])[] = [
  ['above', 'below'],
  ['over', 'under'],
  ['before', 'after'],
  ['more', 'less'],
  ['min', 'max'],
  ['minimum', 'maximum'],
  ['higher', 'lower'],
  ['upper', 'lower'],
  ['first', 'last'],
  ['import', 'export'],
  ['increase', 'decrease'],
  ['add', 'remove'],
  ['create', 'delete'],
  ['enable', 'disable'],
  ['allow', 'deny'],
  ['include', 'exclude'],
  ['open', 'close'],
  ['start', 'stop'],
  ['credit', 'debit'],
  ['inbound', 'outbound'],
  ['always', 'never'],
];

/** Whether the words only one question has and the words only the other has hold an opposite pair. */
export function hasOppositePair(
  onlyLeft: readonly string[],
  onlyRight: readonly string[],
): boolean {
  return oppositePairs.some(
    ([a, b]) =>
      (onlyLeft.includes(a) && onlyRight.includes(b)) ||
      (onlyLeft.includes(b) && onlyRight.includes(a)),
  );
}
