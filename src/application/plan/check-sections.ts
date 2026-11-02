// RF-1015, RF-627 (P7-25): the sections of checks.md for the plan run page. The file is Rosetta's own
// (handoff-checks-markdown.ts): a title line, then sections that each begin with a `## ` heading.
// The server splits it, so the page shows what the file says without reading Markdown itself.

export interface CheckSection {
  readonly title: string;
  /** The section's text as the file has it, without its heading. */
  readonly text: string;
}

const HEADING = /^## (.+)$/u;

// RF-1015
export function checkSectionsOf(markdown: string): readonly CheckSection[] {
  const sections: { title: string; lines: string[] }[] = [];
  for (const line of markdown.split(/\r?\n/u)) {
    const title = HEADING.exec(line)?.[1];
    if (title !== undefined) sections.push({ title: title.trim(), lines: [] });
    else sections.at(-1)?.lines.push(line);
  }
  return sections.map((section) => ({
    title: section.title,
    text: section.lines.join('\n').trim(),
  }));
}
