import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import type { PlanTask } from '../../domain/planning/plan-content.js';
import {
  coverageItems,
  type CoverageItem,
  type CoverageKind,
} from '../../domain/planning/plan-coverage.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { flowFile } from './handoff-flows-markdown.js';
import { handoffFiles } from './handoff-links.js';

// RF-627, RF-507: the items a task card builds, each with its kind linking the document that holds
// it. The links are built here from the kind and, for a journey, a checked card id; the name and
// the key of an item are model text and go through the escaper.

const kindLabels: Readonly<Record<CoverageKind, string>> = {
  feature: 'Feature',
  table: 'Table',
  operation: 'Operation',
  flow: 'Flow',
  screen: 'Screen',
};

function documentOf(item: CoverageItem): string {
  const files: Readonly<Record<CoverageKind, string>> = {
    feature: handoffFiles.prd,
    table: handoffFiles.dataModel,
    operation: handoffFiles.apiContract,
    flow: flowFile(item.id.slice('flow:'.length)),
    screen: handoffFiles.ux,
  };
  return files[item.kind];
}

function lineOf(item: CoverageItem, esc: MarkdownEscaper): string {
  const key = item.id.slice(item.kind.length + 1);
  const name = item.name === key ? '' : `: ${esc.inline(item.name)}`;
  return `- [${kindLabels[item.kind]}](${documentOf(item)}) ${esc.inline(key)}${name}`;
}

/** RF-627: `Builds: none`, or the list of the items the card builds, in the order of the items. */
export function buildsLines(
  task: PlanTask,
  handoff: HandoffPackage,
  esc: MarkdownEscaper,
): string[] {
  const built = new Set(task.builds);
  const items = coverageItems(handoff).filter((item) => built.has(item.id));
  if (items.length === 0) return ['Builds: none', ''];
  return ['Builds:', '', ...items.map((item) => lineOf(item, esc)), ''];
}
