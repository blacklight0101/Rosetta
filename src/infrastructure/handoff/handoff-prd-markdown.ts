import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { MOSCOW, type Moscow } from '../../domain/planning/prd-content.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { handoffFiles, idLink, sourceLinks } from './handoff-links.js';

// RF-621, RF-620, RF-602, RF-603, DEC-80: prd.md, the product requirements document. Every
// statement ends with the source cards it comes from (links into `sources.md`) and, when package
// requirements are built from the same cards, with those requirements; a section the cards could
// not fill holds a marked placeholder that names its open question instead. The text is the
// planner's and goes through the escaper; the labels, links and placeholders are Rosetta's.

/** The mark of a placeholder; structure tests look for it. */
const PLACEHOLDER = 'To be confirmed:';

const priorityLabels: Readonly<Record<Moscow, string>> = {
  Must: 'Must',
  Should: 'Should',
  Could: 'Could',
  Wont: "Won't",
};

function placeholder(id: string, what: string): string {
  return `${PLACEHOLDER} ${what} Open question [${id}](${handoffFiles.openQuestions}).`;
}

/** The package requirements that come from any of these cards, as links, or nothing. */
function requirementsOf(handoff: HandoffPackage, sources: readonly string[]): string {
  const own = handoff.content.requirements.filter((requirement) =>
    requirement.sources.some((id) => sources.includes(id)),
  );
  if (own.length === 0) return '';
  return ` Requirements: ${own.map((requirement) => idLink(requirement.id, handoffFiles.requirements)).join(', ')}`;
}

/** A heading and its lines; a section with no line holds the placeholder of its question. */
function section(
  title: string,
  lines: readonly string[],
  missing: { readonly id: string; readonly what: string },
): string[] {
  const body = lines.length > 0 ? lines : [placeholder(missing.id, missing.what)];
  return [`## ${title}`, '', ...body, ''];
}

interface Cited {
  readonly text: string;
  readonly sources: readonly string[];
}

/** A statement already escaped, with the source cards and package requirements it comes from. */
function cited(handoff: HandoffPackage, head: string, sources: readonly string[]): string {
  return `${head} Source cards: ${sourceLinks(sources)}.${requirementsOf(handoff, sources)}`;
}

function featureLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  return MOSCOW.flatMap((priority) =>
    handoff.prd.features
      .filter((feature) => feature.priority === priority)
      .map((feature) => {
        const label = `**${priorityLabels[priority]}**: **${esc.inline(feature.title)}**`;
        return `- ${cited(handoff, `${label} ${esc.inline(feature.description)}`, feature.sources)}`;
      }),
  );
}

// RF-621, RF-620, RF-602
export function prdMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  const { prd } = handoff;
  const statement = (item: Cited): string => cited(handoff, esc.inline(item.text), item.sources);
  const bullets = (items: readonly Cited[]): string[] =>
    items.map((item) => `- ${statement(item)}`);
  const roles = prd.roles.map((role) => {
    const proposed = handoff.meaning?.proposedRoles.includes(role.name) === true;
    const mark = proposed ? ' (proposed: no claim states this role)' : '';
    const head = `**${esc.inline(role.name)}**${mark}: ${esc.inline(role.description)}`;
    return `- ${cited(handoff, head, role.sources)}`;
  });
  const single = (item: Cited | undefined): string[] =>
    item === undefined ? [] : [statement(item)];
  return [
    '# Product requirements document',
    '',
    ...section('Problem', single(prd.problem), {
      id: 'prd.problem',
      what: 'The cards do not state the problem the modernisation solves.',
    }),
    ...section('Goal', single(prd.goal), {
      id: 'prd.goal',
      what: 'The cards and the planning brief do not state the goal.',
    }),
    ...section('Users and roles', roles, {
      id: 'prd.roles',
      what: 'The cards show no user role.',
    }),
    ...section('Features', featureLines(handoff, esc), {
      id: 'prd.features',
      what: 'The cards show no feature to prioritise.',
    }),
    ...section('Business rules to keep', bullets(prd.rules), {
      id: 'prd.rules',
      what: 'The cards show no business rule.',
    }),
    ...section('Out of scope', bullets(prd.outOfScope), {
      id: 'prd.out-of-scope',
      what: 'Nothing is declared out of scope.',
    }),
    ...section('Non-functional expectations', bullets(prd.nonFunctional), {
      id: 'prd.non-functional',
      what: 'The cards state no non-functional expectation.',
    }),
    ...section('Success measures', [], {
      id: 'prd.success-measures',
      what: 'The code cannot say how success is measured.',
    }),
  ].join('\n');
}
