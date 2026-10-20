import { useState } from 'preact/hooks';
import {
  contextDraftOf,
  parseContextSize,
  type ContextResult,
  type ContextSize,
} from './ollama-context.js';

// RF-401, Q-44: the Ollama context size on the Default models page: the text of the field and the
// problem the last save found in it.

export interface ContextDraft {
  readonly text: string;
  readonly problem: string | undefined;
  readonly change: (text: string) => void;
  /** Shows the saved value again after a save. */
  readonly reset: (saved: ContextSize | undefined) => void;
  /** The size to save; when no role uses Ollama the field is ignored (Auto). */
  readonly read: (active: boolean) => ContextResult;
}

// RF-401
export function useContextSize(saved: ContextSize | undefined): ContextDraft {
  const [text, setText] = useState(contextDraftOf(saved));
  const [problem, setProblem] = useState<string | undefined>();
  return {
    text,
    problem,
    change: (next) => {
      setText(next);
      setProblem(undefined);
    },
    reset: (value) => {
      setText(contextDraftOf(value));
      setProblem(undefined);
    },
    read: (active) => {
      const result: ContextResult = active ? parseContextSize(text) : { ok: true, value: 'auto' };
      setProblem(result.ok ? undefined : result.message);
      return result;
    },
  };
}
