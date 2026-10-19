import { describe, expect, it } from 'vitest';
import { brokenLinks, setProblems, uncoveredItems } from '../../support/documentation-set.js';
import { runJourney, type Journey } from '../../support/journey-harness.js';
import { useSharedValue } from '../../support/understand-full-run.js';

// RF-263, RF-508, RF-620, RF-627, P3-33, P3-22: the checks of the documentation set journey are not
// vacuous. The files one journey run leaves are changed one way at a time (a document missing or
// empty, marked Incomplete, a section, a link or a diagram gone, a task card that builds nothing)
// and the check names the problem.

const journey = useSharedValue('rosetta-journey-fails-', runJourney);

const current = (): Journey => journey.current();

const nl = String.fromCharCode(10);

/** The files without this path. */
function without(files: Readonly<Record<string, string>>, path: string): Record<string, string> {
  return Object.fromEntries(Object.entries(files).filter(([each]) => each !== path));
}

describe('the documentation set journey: it fails when a document is missing', () => {
  it('RF-620 a document that is missing is a problem, for each document of the set', () => {
    const made = current();

    const paths = Object.keys(made.documents).filter((each) =>
      /^(prd|trd|tasks)\.md$|^flows\/|^ux\/|^api\//u.test(each),
    );
    const unreported = paths.filter((path) => {
      const problems = setProblems({ ...made, documents: without(made.documents, path) });
      return !problems.includes(`handoff/${path} is missing.`);
    });
    expect(paths.length).toBeGreaterThan(10);
    expect(unreported).toEqual([]);
    const noSpec = setProblems({ ...made, specification: without(made.specification, 'spec.md') });
    expect(noSpec).toContain('run/spec.md is missing.');
  });

  it('RF-620 a document that is empty is a problem', () => {
    const made = current();

    const problems = setProblems({ ...made, documents: { ...made.documents, 'prd.md': ' \n' } });

    expect(problems).toContain('handoff/prd.md is empty.');
  });
});

describe('the documentation set journey: it fails when a document is marked Incomplete', () => {
  it('P3-33 a wireframe page marked Incomplete is a problem', () => {
    const made = current();
    const notice =
      '<p class="box"><strong>Incomplete.</strong> The planner answer was cut off.</p>';
    const page = made.documents['ux/wireframes/SCRN-003.html'] ?? '';
    const marked = page.replace('<body>', `<body>${nl}${notice}`);

    const problems = setProblems({
      ...made,
      documents: { ...made.documents, 'ux/wireframes/SCRN-003.html': marked },
    });

    expect(marked).not.toBe(page);
    expect(problems).toEqual(['handoff/ux/wireframes/SCRN-003.html is marked Incomplete.']);
  });

  it('P3-33 a document marked Incomplete is a problem, whether it is Markdown or YAML', () => {
    const made = current();
    const notice = '> **Incomplete.** The planner answer for this document was cut off.\n\n';
    const marked = { ...made.documents };
    marked['trd.md'] = notice + (marked['trd.md'] ?? '');
    marked['api/openapi.yaml'] = `# Incomplete. Cut off.\n${marked['api/openapi.yaml'] ?? ''}`;
    marked['README.md'] = `${marked['README.md'] ?? ''}\n## Incomplete documents\n`;

    const problems = setProblems({ ...made, documents: marked });

    expect(problems).toEqual([
      'handoff/README.md is marked Incomplete.',
      'handoff/trd.md is marked Incomplete.',
      'handoff/api/openapi.yaml is marked Incomplete.',
    ]);
  });
});

describe('the documentation set journey: it fails when the specification is not whole', () => {
  it('RF-263 a specification without a section, or without its data model link, is a problem', () => {
    const made = current();
    const spec = made.specification['spec.md'] ?? '';
    const sections = ['Flows', 'Screens', 'Data model'];

    const reported = sections.map((name) => {
      const changed = spec.replace(`${nl}## ${name}${nl}`, `${nl}## Other${nl}`);
      return setProblems({ ...made, specification: { ...made.specification, 'spec.md': changed } });
    });

    expect(reported).toEqual(sections.map((name) => [`spec.md has no "## ${name}" section.`]));
    const unlinked = spec.replaceAll('(data-model.md)', '(x.md)');
    expect(
      setProblems({ ...made, specification: { ...made.specification, 'spec.md': unlinked } }),
    ).toEqual(['spec.md does not link data-model.md.']);
  });
});

describe('the documentation set journey: it fails when the report is not whole', () => {
  it('RF-508 a report without its diagrams page, or without one kind of diagram, is a problem', () => {
    const made = current();
    const page = made.report['diagrams.html'] ?? '';

    expect(setProblems({ ...made, report: without(made.report, 'diagrams.html') })).toEqual([
      'report/diagrams.html is missing or empty.',
    ]);
    const kinds = ['sequenceDiagram', 'flowchart', 'erDiagram'];
    const reported = kinds.map((kind) =>
      setProblems({
        ...made,
        report: { ...made.report, 'diagrams.html': page.replaceAll(kind, 'x') },
      }),
    );
    expect(reported).toEqual(kinds.map((kind) => [`report/diagrams.html draws no ${kind}.`]));
    const unlinked = (made.report['report.html'] ?? '').replaceAll('diagrams.html', 'x.html');
    expect(setProblems({ ...made, report: { ...made.report, 'report.html': unlinked } })).toEqual([
      'report/report.html does not link the diagrams page.',
    ]);
  });

  it('RF-508 a specification that holds no diagram is a problem', () => {
    const made = current();
    const bare = (text: string | undefined): string =>
      (text ?? '').replaceAll('```mermaid', '```text');
    const specification = {
      ...made.specification,
      'spec.md': bare(made.specification['spec.md']),
      'data-model.md': bare(made.specification['data-model.md']),
    };

    expect(setProblems({ ...made, specification })).toContain(
      'The specification holds no diagram.',
    );
  });

  it('RF-626 a wireframe the user-interface material links but the package lacks is a problem', () => {
    const made = current();

    const problems = setProblems({
      ...made,
      documents: without(made.documents, 'ux/wireframes/SCRN-003.html'),
    });

    expect(problems).toEqual(['handoff/ux/wireframes/SCRN-003.html is missing.']);
  });
});

describe('the documentation set journey: it fails when the plan leaves an item out', () => {
  it('RF-627 an item that no task card builds is a problem, for each kind of item', () => {
    const { documents } = current();
    const tasks = documents['tasks.md'] ?? '';

    const kinds = ['Feature', 'Table', 'Operation', 'Flow', 'Screen'];
    const reported = kinds.map((kind) => {
      const lines = tasks.split(nl);
      const at = lines.findIndex((line) => line.startsWith(`- [${kind}]`));
      const cut = { ...documents, 'tasks.md': lines.filter((_, index) => index !== at).join(nl) };
      return uncoveredItems(cut).length;
    });
    expect(reported).toEqual([1, 1, 1, 1, 1]);
  });

  it('RF-627 an item is not covered by a card that only names it outside a line of its kind', () => {
    const { documents } = current();
    const lines = (documents['tasks.md'] ?? '').split(nl);
    const notes = lines.map((line) =>
      line.startsWith('- [Table]') ? '- Note: catalog_item basket_line' : line,
    );
    const wrongKind = lines.map((line) =>
      line.startsWith('- [Table]') ? '- [Flow](flows/FLOW-001.md) catalog_item basket_line' : line,
    );

    const reported = [notes, wrongKind].map((each) =>
      uncoveredItems({ ...documents, 'tasks.md': each.join(nl) }),
    );

    const both = [
      'Table catalog_item is built by no task card.',
      'Table basket_line is built by no task card.',
    ];
    expect(reported).toEqual([both, both]);
  });
});

describe('the documentation set journey: it fails when a link is broken', () => {
  it('RF-620 a link to a file the package does not hold is a problem', () => {
    const { documents } = current();

    const problems = brokenLinks(without(documents, 'sources.md'));

    expect(problems).toContain('prd.md links sources.md, which is not in the set.');
    expect(problems).toContain('flows/FLOW-001.md links ../sources.md, which is not in the set.');
  });

  it('RF-620 a link to another site, or to a heading of a file the package holds, is not a problem', () => {
    const files = {
      'a.md': '[x](https://example.com/x) [y](b.md#top) [z](mailto:a@b.c)',
      'b.md': 'text',
      'api/c.yaml': '[w](missing.md)',
    };

    expect(brokenLinks(files)).toEqual([]);
  });
});
