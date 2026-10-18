// RF-638, DEC-135: how the build process is measured. The build method of the package names four
// measures, says where they are recorded and says to change one thing in the process at a time
// and compare, so a change to the process is judged by results. Fixed text, in Rosetta's words;
// nothing in it comes from the repository or a model.

const measures = [
  'the share of cards that pass review the first time',
  'review rounds per card',
  'cost or tokens per card',
  'escaped defects found after merge',
] as const;

/** The build metrics section of the agent instructions (RF-638). */
// RF-638
export function metricsRuleLines(): string[] {
  return [
    '## Build metrics',
    '',
    'Measure the build, so that a change to the way you work is judged by results and not by feeling. Four measures are enough:',
    '',
    ...measures.map((measure) => `- ${measure}`),
    '',
    'Record them for every card in its pull request (the review rounds, the tokens or cost and whether it passed review the first time), and keep one running table in the repository that is updated when a card merges. When a defect is found after a merge, add it to the card that shipped it.',
    '',
    'Change one thing in the process at a time (the model tier of a band, the size of the cards, the review checklist), build a few cards, and compare the same four measures before and after. Keep the change only when the numbers improve.',
    '',
  ];
}
