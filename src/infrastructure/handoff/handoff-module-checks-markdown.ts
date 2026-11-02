import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { DEPLOYMENT_ITEM, moduleItems } from '../../domain/planning/module-coverage.js';
import { coverageOf } from '../../domain/planning/plan-coverage.js';
import type { SourceModule, SourceModules } from '../../domain/planning/source-modules.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';

// P8-06, RF-601, EV-32: the section of checks.md on the modules of the source. Every module of the
// scan and its deployment material either has a task card or is named here with the reason, so a
// reader sees which parts of the legacy system (a WebForms app, a WinForms client, the Kubernetes and
// Service Fabric deployment) the plan leaves without work. Paths are repository text and go through
// the escaper; the reasons are Rosetta's sentences.

const NO_REASON = 'No task card touches it.';

interface Row {
  readonly id: string;
  readonly name: string;
  readonly languages: string;
  readonly files: number;
}

function moduleRow(each: SourceModule): Row {
  return {
    id: `module:${each.path}`,
    name: each.path,
    languages: each.languages.join(', '),
    files: each.files,
  };
}

function untouchedRows(handoff: HandoffPackage, modules: SourceModules): Row[] {
  const open = new Set(
    coverageOf(moduleItems(modules), handoff.content.tasks).modules.map((each) => each.id),
  );
  const rows = [...modules.modules, ...modules.overCap].map(moduleRow);
  const { deployment } = modules;
  if (deployment !== undefined) {
    const name = `Deployment material: ${deployment.paths.join(', ')}`;
    rows.push({ id: DEPLOYMENT_ITEM, name, languages: '', files: deployment.files });
  }
  const over = new Set(modules.overCap.map((each) => `module:${each.path}`));
  return rows.filter((row) => open.has(row.id) || over.has(row.id));
}

// P8-06, RF-601
export function moduleCheckLines(handoff: HandoffPackage, esc: MarkdownEscaper): string[] {
  const { modules } = handoff;
  if (modules === undefined) return [];
  const count = modules.modules.length + modules.overCap.length;
  if (count === 0 && modules.deployment === undefined) return [];
  const rows = untouchedRows(handoff, modules);
  if (rows.length === 0) {
    return [
      '## Modules of the source',
      '',
      `Every module of the source (${String(count)})${modules.deployment === undefined ? '' : ' and its deployment material'} is touched by at least one task card.`,
      '',
    ];
  }
  const reasons = new Map((handoff.moduleReasons ?? []).map((each) => [each.id, each.reason]));
  return [
    '## Modules with no task card',
    '',
    'A module is a folder of the source that holds a project or package manifest; the deployment material is its Dockerfiles, Kubernetes and Service Fabric folders, compose, publish and CI files. A task card touches a module when it builds it by its id, and the deployment material also when it changes a deployment file. No task card touches these, so the package plans no work for them; the owner decides whether a card must port or retire each.',
    '',
    '| Module | Languages | Files | Why no card |',
    '|---|---|---|---|',
    ...rows.map(
      (row) =>
        `| ${esc.inline(row.name)} | ${esc.inline(row.languages)} | ${String(row.files)} | ${reasons.get(row.id) ?? NO_REASON} |`,
    ),
    '',
  ];
}
