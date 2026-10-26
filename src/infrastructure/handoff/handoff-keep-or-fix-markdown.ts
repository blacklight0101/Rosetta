import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { defaultOf } from '../../domain/planning/keep-or-fix.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { keepOrFixOf } from './handoff-keep-or-fix.js';
import { handoffFiles, idLink } from './handoff-links.js';

// RF-631, P5-41: the keep-or-fix table of risks.md and its questions in open-questions.md. The ids are
// made by code; the claim, its reason and its text go through the escaper.

/** P5-41: the claims judged a likely defect, each with a default of fix and an open question. */
export function keepOrFixTable(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { rows } = keepOrFixOf(handoff);
  if (rows.length === 0) return [];
  return [
    '## Keep or fix',
    '',
    'The planner judged each claim below a likely defect of the legacy system, not a rule to keep. No task card pins it with an approval test. The default is to fix it (a security matter defaults to the secure option); the owner decides in [open questions](open-questions.md#keep-or-fix).',
    '',
    '| Id | Claim | Legacy behaviour | Why it looks wrong | Default | Task cards |',
    '|---|---|---|---|---|---|',
    ...rows.map((row) => {
      const cards = row.cards.map((id) => idLink(id, handoffFiles.tasks)).join(', ');
      const claim = `${idLink(row.cardId, handoffFiles.sources)} ${esc.inline(row.claimId)}`;
      const standing = row.security ? 'Secure option' : 'Fix';
      return `| ${row.id} | ${claim} | ${esc.inline(row.text)} | ${esc.inline(row.reason)} | ${standing} | ${cards === '' ? 'none' : cards} |`;
    }),
    '',
  ];
}

/** P5-41: one question per keep-or-fix row, with the default of fix or, for a security matter, the secure option. */
export function keepOrFixQuestionLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { rows } = keepOrFixOf(handoff);
  if (rows.length === 0) return [];
  return [
    '## Keep or fix',
    '',
    'Each row of the [keep-or-fix table](risks.md#keep-or-fix) is a question: keep the legacy behaviour, or fix it.',
    '',
    ...rows.map((row) => {
      const cards = row.cards.map((id) => idLink(id, handoffFiles.tasks)).join(', ');
      return `- ${row.id}: Keep or fix ${esc.inline(row.claimId)}: ${esc.inline(row.text)} Default: ${defaultOf(row)} Cards waiting: ${cards === '' ? 'none' : cards}`;
    }),
    '',
  ];
}
