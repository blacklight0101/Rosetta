// RF-648, RF-649, RF-650: placeholder so the red tests compile (DEC-191).

export interface WorkbookPageOption {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly recommended: boolean;
}

export function workbookOptions(question: string, hosting: string): WorkbookPageOption[] {
  return question === hosting ? [] : [];
}
