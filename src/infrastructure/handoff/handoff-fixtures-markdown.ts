import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { formatCitation } from '../../domain/cards/citation.js';
import { statedVolumes } from '../../domain/planning/data-volumes.js';
import { statedSeeds, type SeedKind } from '../../domain/planning/seed-data.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { idLink, handoffFiles, shapeSections } from './handoff-links.js';

// P5-42, RF-632, DEC-135: `fixtures.md`, the data a test of a limit or a parser must start from:
// the seed data and the test data the supported claims of the cards state (inserts in schema scripts,
// seed code), masked where they tell of a secret, and the volumes the cards state. It is built from
// the claims and never from statistics of the repository's files. Claim text comes from the
// repository, so it goes through the escaper. The headings are the anchors the task cards link
// (handoff-links.ts, `shapeSections`).

function section(title: string, lines: readonly string[]): string[] {
  return [`## ${title}`, '', ...lines, ''];
}

function claimLine(
  claim: {
    cardId: string;
    claimId: string;
    text: string;
    citations: HandoffPackage['sources'][number]['claims'][number]['citations'];
  },
  esc: MarkdownEscaper,
  note: string,
): string {
  const citations = claim.citations.map((citation) => esc.inline(formatCitation(citation)));
  return `- ${idLink(claim.cardId, handoffFiles.sources)} ${esc.inline(claim.claimId)}: ${esc.inline(claim.text)}${note} Citations: ${citations.join(', ')}`;
}

function seedLines(handoff: HandoffPackage, esc: MarkdownEscaper, kind: SeedKind): string[] {
  const own = statedSeeds(handoff.sources).filter((seed) => seed.kind === kind);
  if (own.length === 0) {
    return [kind === 'seed' ? 'The cards state no seed data.' : 'The cards state no test data.'];
  }
  return own.map((seed) =>
    claimLine(seed, esc, seed.masked ? ' (values masked: the claim tells of a secret)' : ''),
  );
}

function volumeLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const volumes = statedVolumes(handoff.sources);
  if (volumes.length === 0) return ['The cards state no data volume.'];
  return volumes.map((volume) => claimLine(volume, esc, ''));
}

/** P5-08: the intro of a workbook project, whose data is in sheets, rows and cells. */
function workbookIntroLines(): string[] {
  return [
    'The legacy system is one or more workbooks, so its data is in sheets, rows and cells, not in repository files.',
    '',
    'Task cards that add a limit or a parser handle the volumes the cards state below (rows of a sheet, records of a table) and the cells of [workbook-formulas.md](workbook-formulas.md): build the test data from the sheets, rows and cells of the workbook itself.',
    '',
  ];
}

const intro =
  'The data a test of a limit or a parser must start from. It is taken from the supported claims of the cards: the inserts of schema scripts, seed code and test data they state. Values that tell of a secret are masked. Nothing here is a statistic of the repository files. Task cards that add a limit or a parser link the sections they must handle.';

// RF-632, P5-42
export function fixturesMarkdown(handoff: HandoffPackage, esc: MarkdownEscaper): string {
  return [
    '# Realistic data shapes',
    '',
    ...(handoff.workbookFormulas === undefined ? [intro, ''] : workbookIntroLines()),
    ...section(shapeSections.seeds, seedLines(handoff, esc, 'seed')),
    ...section(shapeSections.tests, seedLines(handoff, esc, 'test')),
    ...section(shapeSections.volumes, volumeLines(handoff, esc)),
  ].join('\n');
}
