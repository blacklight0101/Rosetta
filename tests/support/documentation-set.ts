import { extractDiagrams } from '../../src/application/report/report-diagrams.js';

// RF-620, RF-263, RF-508, P3-22, P3-33: what the documentation set journey checks about the files a
// plan run and the understand run before it leave in their folders. `setProblems` lists everything
// wrong, in plain words, so the journey expects an empty list and a test can show that a missing,
// empty or Incomplete document, or a report without its diagrams, is a problem.

export type Files = Readonly<Record<string, string>>;

/** The three folders the set is read from. */
export interface DocumentationSet {
  /** The understand run's folder: the specification (RF-263) and the legacy data model. */
  readonly specification: Files;
  /** The plan run's `handoff/` folder: the package (RF-620..RF-627). */
  readonly documents: Files;
  /** The `report/` folder of the understand run, by path inside it (RF-508). */
  readonly report: Files;
}

/** The documents of the specification, in the understand run's folder. */
const specificationFiles = ['spec.md', 'data-model.md', 'overview.md', 'coverage.md'] as const;

/** The documents of the package in the reading order of RF-620, then the parts RF-601 lists. */
const packageFiles = [
  'README.md',
  'prd.md',
  'trd.md',
  'data-model.md',
  'api/openapi.yaml',
  'flows/README.md',
  'ux/README.md',
  'ux/design-brief.md',
  'tasks.md',
  'roadmap.md',
  'checks.md',
  'requirements.md',
  'architecture.md',
  'sources.md',
] as const;

/** The marks P3-33 puts on a document whose planner answer stayed cut off. */
const incompleteMarks = [
  /^> \*\*Incomplete\.\*\*/mu,
  /^# Incomplete\./mu,
  /^## Incomplete documents/mu,
];

function problemsOfFile(where: string, files: Files, path: string): string[] {
  const text = files[path];
  if (text === undefined) return [`${where}/${path} is missing.`];
  return text.trim() === '' ? [`${where}/${path} is empty.`] : [];
}

/** A document that is missing or empty, for each path. */
function missingOrEmpty(where: string, files: Files, paths: readonly string[]): string[] {
  return paths.flatMap((path) => problemsOfFile(where, files, path));
}

/** The ids of the cards of a type the understand run wrote (`cards/<TYPE>/<id>.md`). */
export function cardIds(specification: Files, type: string): string[] {
  const prefix = `cards/${type}/`;
  return Object.keys(specification)
    .filter((path) => path.startsWith(prefix) && path.endsWith('.md'))
    .map((path) => path.slice(prefix.length, -'.md'.length))
    .sort();
}

/** The wireframes the user-interface material links. */
function linkedWireframes(documents: Files): string[] {
  const links = (documents['ux/README.md'] ?? '').matchAll(/\]\((wireframes\/[^)]+\.html)\)/gu);
  return [...new Set([...links].map((match) => `ux/${match[1] ?? ''}`))];
}

function incompleteProblems(documents: Files): string[] {
  return Object.entries(documents)
    .filter(([, text]) => incompleteMarks.some((mark) => mark.test(text)))
    .map(([path]) => `handoff/${path} is marked Incomplete.`);
}

/** RF-263: the specification has a flows section, a screens section with the map and the link. */
function specificationProblems(specification: Files): string[] {
  const spec = specification['spec.md'] ?? '';
  const sections = ['## Flows', '## Screens', '## Data model'];
  const missing = sections.filter((heading) => !spec.includes(`\n${heading}\n`));
  const linked = spec.includes('(data-model.md)') ? [] : ['spec.md does not link data-model.md.'];
  return [...missing.map((heading) => `spec.md has no "${heading}" section.`), ...linked];
}

/** RF-508: the diagrams of the specification are all drawn on the report's diagrams page. */
function reportProblems(set: DocumentationSet): string[] {
  const page = set.report['diagrams.html'];
  if (page === undefined || page.trim() === '')
    return ['report/diagrams.html is missing or empty.'];
  const markdown = Object.fromEntries(
    specificationFiles.map((name) => [name, set.specification[name] ?? '']),
  );
  const expected = extractDiagrams(markdown);
  const missing = ['sequenceDiagram', 'flowchart', 'erDiagram'].filter(
    (kind) => !page.includes(kind),
  );
  return [
    ...(expected.length === 0 ? ['The specification holds no diagram.'] : []),
    ...missing.map((kind) => `report/diagrams.html draws no ${kind}.`),
    ...(set.report['report.html']?.includes('diagrams.html') === true
      ? []
      : ['report/report.html does not link the diagrams page.']),
  ];
}

// RF-620
export function setProblems(set: DocumentationSet): string[] {
  const { specification, documents } = set;
  const flows = cardIds(specification, 'FLOW').map((id) => `flows/${id}.md`);
  return [
    ...missingOrEmpty('run', specification, specificationFiles),
    ...missingOrEmpty('handoff', documents, [
      ...packageFiles,
      ...flows,
      ...linkedWireframes(documents),
    ]),
    ...incompleteProblems(documents),
    ...specificationProblems(specification),
    ...reportProblems(set),
  ];
}

/** The text as a reader sees it: the escaper's backslashes removed. */
const plain = (text: string): string => text.replaceAll('\\', '');

/** Every `Builds:` line of the task cards, as a reader sees it. */
function builtItems(tasks: string): string[] {
  return plain(tasks)
    .split('\n')
    .filter((line) => /^- \[(Feature|Table|Operation|Flow|Screen)\]/u.test(line));
}

/** The items the documents of the set name, found in the files themselves, by kind and name. */
function namedItems(documents: Files): { kind: string; name: string }[] {
  const features = plain(documents['prd.md'] ?? '').matchAll(/^- \*\*\w+\*\*: \*\*([^*]+)\*\*/gmu);
  const tables = plain(documents['data-model.md'] ?? '').matchAll(/^### (\w+)$/gmu);
  const operations = (documents['api/openapi.yaml'] ?? '').matchAll(/operationId: (\w+)/gu);
  const named = (kind: string, found: Iterable<RegExpExecArray>) =>
    [...found].map((match) => ({ kind, name: match[1] ?? '' }));
  const files = Object.keys(documents);
  const ids = (folder: string, extension: string) =>
    files
      .filter((path) => path.startsWith(folder) && path.endsWith(extension))
      .map((path) => path.slice(folder.length, -extension.length))
      .filter((id) => id !== 'README');
  return [
    ...named('Feature', features),
    ...named('Table', tables),
    ...named('Operation', operations),
    ...ids('flows/', '.md').map((name) => ({ kind: 'Flow', name })),
    ...ids('ux/wireframes/', '.html').map((name) => ({ kind: 'Screen', name })),
  ];
}

/**
 * RF-627: every feature, table, operation, journey and screen the documents name, derived from the
 * files and not from the planner's report, with no task card that builds it.
 */
export function uncoveredItems(documents: Files): string[] {
  const built = builtItems(documents['tasks.md'] ?? '');
  return namedItems(documents)
    .filter(
      ({ kind, name }) =>
        !built.some((line) => line.startsWith(`- [${kind}]`) && line.includes(name)),
    )
    .map(({ kind, name }) => `${kind} ${name} is built by no task card.`);
}

/** RF-620: the relative links of the Markdown files that point at a file the set does not hold. */
export function brokenLinks(documents: Files): string[] {
  const broken: string[] = [];
  for (const [path, text] of Object.entries(documents)) {
    if (!path.endsWith('.md')) continue;
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
    for (const match of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/gu)) {
      const target = match[1] ?? '';
      if (/^[a-z][a-z0-9+.-]*:/iu.test(target)) continue;
      const resolved = new URL(target, `http://set/${folder}`).pathname.slice(1);
      if (documents[resolved] === undefined)
        broken.push(`${path} links ${target}, which is not in the set.`);
    }
  }
  return broken;
}
