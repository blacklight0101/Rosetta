import type { PromptFile } from '../../agent/prompt-file.js';
import type { ReaderPrompts } from '../../agent/reader-prompts.js';
import type { ToolCall, ToolDefinition } from '../../ports/llm-provider.js';
import type { LabTarget } from '../lab-target.js';

// RF-1406, ADR-029, P10-10: the lab targets of the shared prompts a model reads (stub, red step).

export interface SharedKit {
  readonly maskerOf: (
    file: PromptFile,
  ) => { mask(text: string): { readonly text: string } } | undefined;
  readonly protocol: {
    readonly systemOf: (
      system: string,
      template: string,
      tools: readonly ToolDefinition[],
    ) => string;
    readonly parse: (content: string) => {
      readonly text: string;
      readonly calls: readonly {
        readonly name: string;
        readonly arguments: Readonly<Record<string, unknown>>;
      }[];
    };
    readonly toolCallBlock: (call: ToolCall) => string;
    readonly toolResultBlock: (toolCallId: string, content: string) => string;
  };
}

// RF-1406
export function sharedTargets(current: ReaderPrompts, kit: SharedKit): LabTarget[] {
  return [current, kit].flatMap(() => []);
}
