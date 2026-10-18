// RF-508: skeleton, filled in by the next commit.
export interface ReportDiagram {
  readonly document: string;
  readonly title: string;
  readonly source: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- skeleton, filled in by the next commit
export function extractDiagrams(_documents: Readonly<Record<string, string>>): ReportDiagram[] {
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- skeleton, filled in by the next commit
export function diagramDocumentPaths(_flowsIndex: string | undefined): string[] {
  return [];
}
