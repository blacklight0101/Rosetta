import type { HandoffPackage } from '../../application/plan/handoff-package.js';

// RF-612, RF-637, P6-11: what a package written for people building leaves out. Only a people build
// says it; an agent build has these files and says nothing about them.

const leftOutSentence =
  'This package has no agent files, no model per card and no build protocol, because people build the system.';

/** RF-612: the README sentence of a people build, followed by a blank line; nothing for an agent build. */
export function leftOutReadmeLines(handoff: HandoffPackage): string[] {
  return handoff.brief.buildMethod.aiAssisted ? [] : [leftOutSentence, ''];
}

/** RF-637: the build method as a whole-build question with its default, for a people build only. */
export function buildMethodQuestionLines(handoff: HandoffPackage): string[] {
  if (handoff.brief.buildMethod.aiAssisted) return [];
  return [
    '## Build method',
    '',
    'Whether the team builds with AI agents is a whole-build question, so no card waits on it. Default: people build, so the package has no agent files, no model per card and no build protocol. A team that builds with agents can answer the question again to add them, or answer otherwise.',
    '',
  ];
}
