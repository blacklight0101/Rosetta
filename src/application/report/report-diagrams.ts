// RF-508, DEC-134: the Mermaid diagrams of the documents of a run, found by their fences so the HTML
// report can draw them while the Markdown keeps their source. The diagrams are the ones Rosetta's
// generators wrote (labels escaped, RF-508); the text is still treated as untrusted: it is only
// ever read as text here and shown as text on the page.

/** One diagram: the document it is in, the heading it sits under and its Mermaid source. */
export interface ReportDiagram {
  readonly document: string;
  /** The heading of the section the diagram is in, as text; the document's path when there is none. */
  readonly title: string;
  readonly source: string;
}

const OPEN = /^```mermaid[ \t]*$/u;
const CLOSE = /^```[ \t]*$/u;
const HEADING = /^#{1,6}[ \t]+(.+?)[ \t]*$/u;
const LINK = /\[([^\]]*)\]\([^)]*\)/gu;
const ESCAPE = /\\([\\`*_{}[\]()#+\-.!|<>~])/gu;

/** A heading as plain words: a link keeps its label and a Markdown escape loses its backslash. */
function headingText(heading: string): string {
  return heading.replace(LINK, '$1').replace(ESCAPE, '$1');
}

function diagramsOf(document: string, text: string): ReportDiagram[] {
  const found: ReportDiagram[] = [];
  let title = document;
  let open: string[] | undefined;
  for (const line of text.split(/\r?\n/u)) {
    if (open === undefined) {
      if (OPEN.test(line)) open = [];
      else title = headingText(HEADING.exec(line)?.[1] ?? title);
    } else if (CLOSE.test(line)) {
      found.push({ document, title, source: open.join('\n') });
      open = undefined;
    } else open.push(line);
  }
  // A fence that never closes is not a diagram: `open` is dropped.
  return found;
}

/** The diagrams of the documents, in the order the documents are given and then of the page. */
// RF-508
export function extractDiagrams(documents: Readonly<Record<string, string>>): ReportDiagram[] {
  return Object.entries(documents).flatMap(([name, text]) => diagramsOf(name, text));
}

/** The documents of an understand run and of a plan run that can hold a diagram (RF-508). */
const DOCUMENTS = [
  'spec.md',
  'data-model.md',
  'handoff/architecture.md',
  'handoff/trd.md',
  'handoff/data-model.md',
] as const;

const FLOWS_FOLDER = 'handoff/flows';
/** `[FLOW-001](FLOW-001.md)`: the link to a flow file in the index, by the card id the file is named by. */
const FLOW_LINK = /\]\(([A-Z]+-\d+)\.md\)/gu;

/**
 * The paths (relative to the run folder) to read for diagrams: the documents above, then the flow
 * files the hand-off package's flow index links. A path is built from a card id the pattern
 * checked, so it can only name a file of `handoff/flows/`.
 */
// RF-508
export function diagramDocumentPaths(flowsIndex: string | undefined): string[] {
  const ids = [...(flowsIndex ?? '').matchAll(FLOW_LINK)].map((match) => match[1] ?? '');
  const flows = [...new Set(ids)].map((id) => `${FLOWS_FOLDER}/${id}.md`);
  return [...DOCUMENTS, ...flows];
}
