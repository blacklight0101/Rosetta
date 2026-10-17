import type { CodeMap } from '../../src/domain/code-map/code-map.js';
import type { FileEntry } from '../../src/domain/code-map/file-entry.js';
import { stackLayers } from '../../src/domain/planning/planning-brief.js';
import type { OptionsDraft } from '../../src/domain/planning/plan-options.js';

// RF-608, RF-609: a valid draft of the planner's options and the ways tests spoil it.

type DraftStyle = OptionsDraft['architecture']['options'][number];

export const verifiedIds: ReadonlySet<string> = new Set([
  'FEAT-001',
  'BR-001',
  'ENT-001',
  'INT-001',
]);

export function styleDraft(style: string, overrides: Partial<DraftStyle> = {}): DraftStyle {
  return {
    style,
    strengths: [`${style} keeps the page code apart from the rules.`],
    costs: [`${style} needs more files for the same screen.`],
    evidence: ['FEAT-001', 'ENT-001'],
    ...overrides,
  };
}

/** A draft that passes: `clean` recommended next to `layered`, two options for every layer. */
export function validDraft(): OptionsDraft {
  return {
    architecture: {
      recommended: 'clean',
      options: [styleDraft('layered'), styleDraft('clean', { evidence: ['BR-001', 'FEAT-001'] })],
    },
    stack: stackLayers.map((layer) => ({ layer, options: [`${layer} A`, `${layer} B`] })),
  };
}

export function withStack(draft: OptionsDraft, stack: OptionsDraft['stack']): OptionsDraft {
  return { ...draft, stack };
}

export function withOptions(
  draft: OptionsDraft,
  options: OptionsDraft['architecture']['options'],
  recommended = draft.architecture.recommended,
): OptionsDraft {
  return { ...draft, architecture: { recommended, options } };
}

/** A code map of one area holding these files, scanned with these language packs. */
export function codeMapOf(files: readonly FileEntry[], packs: readonly string[] = []): CodeMap {
  const sorted = files.map((file) => file.path).sort();
  const area = { name: '(root)', origin: 'folder', mapLevel: 'coarse', files: sorted } as const;
  const tokens = files.reduce((sum, file) => sum + file.estimatedTokens, 0);
  return {
    schemaVersion: 1,
    source: { owner: 'o', repo: 'shop', commitSha: 'c'.repeat(40), subpath: '' },
    files,
    areas: [{ ...area, estimatedTokens: tokens }],
    symbols: [],
    links: [],
    sqlStatements: [],
    entities: [],
    languagePacks: packs.map((name) => ({ name, version: '1' })),
  };
}
