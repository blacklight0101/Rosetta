import type { OpenAI } from 'openai';
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions';

// RF-402, Q-60: one streamed Chat Completions call (developers.openai.com, Chat Completions
// streaming). The answer arrives as `chat.completion.chunk` events: `delta.content` and
// `delta.refusal` in pieces, `delta.tool_calls` entries with an `index` whose `arguments` come in
// pieces, a `finish_reason` on the last choice chunk, and, with `include_usage`, one more chunk
// with no choices that holds the usage. They are put together into the shape of the plain answer,
// which the shared reading then parses. Every chunk restarts the idle timeout.

export interface StreamCall {
  readonly body: ChatCompletionCreateParamsStreaming;
  readonly signal: AbortSignal;
  /** A chunk arrived. */
  readonly onEvent: () => void;
  /** A piece of the answer (text, refusal or tool arguments) arrived. */
  readonly onText: (text: string) => void;
}

export interface StreamedCompletion {
  /** The chat completion the chunks add up to; the caller parses it. */
  readonly completion: unknown;
  readonly requestId: string | undefined;
}

type ToolCallPiece = NonNullable<
  ChatCompletionChunk['choices'][number]['delta']['tool_calls']
>[number];

interface PartialToolCall {
  id: string;
  name: string;
  arguments: string;
}

class Assembly {
  private model = '';
  private content = '';
  private refusal = '';
  private finishReason: string | null = null;
  private usage: unknown = null;
  private readonly calls = new Map<number, PartialToolCall>();

  add(chunk: ChatCompletionChunk, onText: (text: string) => void): void {
    this.model = chunk.model;
    this.usage = chunk.usage ?? this.usage;
    const choice = chunk.choices[0];
    if (choice === undefined) return;
    this.finishReason = choice.finish_reason ?? this.finishReason;
    this.addText(choice.delta, onText);
    for (const piece of choice.delta.tool_calls ?? []) this.addToolPiece(piece, onText);
  }

  private addText(delta: ChatCompletionChunk.Choice.Delta, onText: (text: string) => void): void {
    const { content, refusal } = delta;
    this.content += content ?? '';
    this.refusal += refusal ?? '';
    onText(`${content ?? ''}${refusal ?? ''}`);
  }

  private addToolPiece(piece: ToolCallPiece, onText: (text: string) => void): void {
    const call = this.calls.get(piece.index) ?? { id: '', name: '', arguments: '' };
    const { id, function: part } = piece;
    call.id = id ?? call.id;
    call.name += part?.name ?? '';
    call.arguments += part?.arguments ?? '';
    this.calls.set(piece.index, call);
    onText(part?.arguments ?? '');
  }

  /** The answer in the shape of a plain chat completion. */
  completion(): unknown {
    const toolCalls = [...this.calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, call]) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.arguments },
      }));
    return {
      model: this.model,
      choices: [
        {
          message: {
            content: this.content,
            refusal: this.refusal === '' ? null : this.refusal,
            ...(toolCalls.length === 0 ? {} : { tool_calls: toolCalls }),
          },
          finish_reason: this.finishReason,
        },
      ],
      usage: this.usage,
    };
  }
}

export async function streamedCompletion(
  client: OpenAI,
  call: StreamCall,
): Promise<StreamedCompletion> {
  const { data, response } = await client.chat.completions
    .create(call.body, { signal: call.signal })
    .withResponse();
  const assembly = new Assembly();
  for await (const chunk of data) {
    call.onEvent();
    assembly.add(chunk, call.onText);
  }
  // The SDK ends the iteration quietly when the signal aborts; a cut stream is not an answer.
  call.signal.throwIfAborted();
  return {
    completion: assembly.completion(),
    requestId: response.headers.get('x-request-id') ?? undefined,
  };
}
