import { describe, expect, it } from 'vitest';
import {
  diagramDocumentPaths,
  extractDiagrams,
} from '../../../../src/application/report/report-diagrams.js';

// RF-508, DEC-134: the Mermaid diagrams of the run's documents (the specification, the data model
// and the hand-off package) are found by their fences, each with the heading it sits under, so the
// HTML report can draw them and the Markdown keeps their source.

const fence = (source: string): string[] => ['```mermaid', source, '```'];

describe('extractDiagrams', () => {
  it('RF-508 finds each Mermaid fence with the heading it sits under and its document', () => {
    const spec = [
      '# Specification',
      '## Screens',
      '',
      ...fence('flowchart LR\n  s1["Home"]'),
      '### FLOW-001 Check out',
      ...fence('sequenceDiagram\n  participant p1 as Cart'),
    ].join('\n');

    expect(extractDiagrams({ 'spec.md': spec })).toEqual([
      { document: 'spec.md', title: 'Screens', source: 'flowchart LR\n  s1["Home"]' },
      {
        document: 'spec.md',
        title: 'FLOW-001 Check out',
        source: 'sequenceDiagram\n  participant p1 as Cart',
      },
    ]);
  });

  it('RF-508 keeps the order of the documents given and of the fences in each', () => {
    const found = extractDiagrams({
      'spec.md': ['## A', ...fence('flowchart LR\n a')].join('\n'),
      'data-model.md': [
        '## B',
        ...fence('erDiagram\n e1'),
        '## C',
        ...fence('erDiagram\n e2'),
      ].join('\n'),
    });

    expect(found.map((diagram) => `${diagram.document} ${diagram.title}`)).toEqual([
      'spec.md A',
      'data-model.md B',
      'data-model.md C',
    ]);
  });
});

describe('extractDiagrams edge cases', () => {
  it('RF-508 ignores fences of other languages and a Mermaid fence that never closes', () => {
    const text = [
      '## Code',
      '```ts',
      'const a = 1;',
      '```',
      '## Torn',
      '```mermaid',
      'flowchart LR',
      '  a --> b',
    ].join('\n');

    expect(extractDiagrams({ 'spec.md': text })).toEqual([]);
  });

  it('RF-508 names a diagram by its document when no heading comes before it', () => {
    expect(extractDiagrams({ 'handoff/trd.md': fence('flowchart LR\n a').join('\n') })).toEqual([
      { document: 'handoff/trd.md', title: 'handoff/trd.md', source: 'flowchart LR\n a' },
    ]);
  });

  it('RF-508 shows a heading as text: a card link keeps its words and escapes are dropped', () => {
    const text = [
      '### FLOW-001 Pay \\*now\\* ([card file](cards/FLOW/FLOW-001.md))',
      ...fence('sequenceDiagram\n  a->>b: x'),
    ].join('\n');

    expect(extractDiagrams({ 'spec.md': text }).map((diagram) => diagram.title)).toEqual([
      'FLOW-001 Pay *now* (card file)',
    ]);
  });

  it('RF-508 keeps hostile source as it is: it is text, and the page shows it as text', () => {
    const hostile =
      'flowchart LR\n  a["<script>window.__pwned=1</script>"]\n  click a "javascript:x"';

    expect(extractDiagrams({ 'spec.md': fence(hostile).join('\n') })[0]?.source).toBe(hostile);
  });
});

describe('diagramDocumentPaths', () => {
  it('RF-508 lists the documents that can hold a diagram, then the flow files the index names', () => {
    const index = [
      '- [FLOW-001](FLOW-001.md): Check out',
      '- [FLOW-012](FLOW-012.md): Return',
      '| [FLOW-003](sources.md#flow-003) | Journey | reason |',
    ].join('\n');

    expect(diagramDocumentPaths(index)).toEqual([
      'spec.md',
      'data-model.md',
      'handoff/architecture.md',
      'handoff/trd.md',
      'handoff/data-model.md',
      'handoff/flows/FLOW-001.md',
      'handoff/flows/FLOW-012.md',
    ]);
  });

  it('RF-508 lists no flow file for a package without an index, and never a path that leaves the folder', () => {
    expect(diagramDocumentPaths(undefined)).toHaveLength(5);
    expect(diagramDocumentPaths('- [x](../../secret.md)\n- [y](a/b.md)')).toHaveLength(5);
  });
});
