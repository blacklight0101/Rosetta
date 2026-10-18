// RF-637: stub, the real rule comes with the feature commit.

export interface WaitingQuestion {
  readonly id: string;
  readonly area?: string;
}

export interface WaitingResult {
  readonly byQuestion: ReadonlyMap<string, readonly string[]>;
  readonly byCard: ReadonlyMap<string, readonly string[]>;
}

export function waitingOnQuestions(input: {
  readonly questions: readonly WaitingQuestion[];
  readonly tasks: readonly { readonly id: string; readonly requirements: readonly string[] }[];
  readonly requirements: readonly { readonly id: string; readonly sources: readonly string[] }[];
  readonly areas: ReadonlyMap<string, string>;
}): WaitingResult {
  return {
    byQuestion: new Map(input.questions.map((question) => [question.id, []])),
    byCard: new Map(),
  };
}
