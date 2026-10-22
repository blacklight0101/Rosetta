import type { Anthropic } from '@anthropic-ai/sdk';
import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages';

// RF-404, Q-60: one streamed Messages API call (platform.claude.com/docs/en/build-with-claude/streaming).
// The SDK's stream helper sends `stream: true` and folds the server-sent events into the final
// message, with its usage (`message_start` holds the input tokens, the cumulative `output_tokens`
// of `message_delta` the output). Every event restarts the idle timeout; the SDK drops the `ping`
// events before they get here, and a ping says the connection is open, not that the model answers.

export interface StreamCall {
  readonly body: MessageCreateParamsNonStreaming;
  readonly signal: AbortSignal;
  /** An event arrived (never a ping). */
  readonly onEvent: () => void;
  /** A piece of the answer (text, thinking or tool input) arrived. */
  readonly onText: (text: string) => void;
}

export interface StreamedMessage {
  /** The message the events add up to; the caller parses it. */
  readonly message: unknown;
  readonly requestId: string | undefined;
}

function deltaText(delta: object): string {
  const text: unknown = Reflect.get(delta, 'text') ?? Reflect.get(delta, 'thinking');
  const json: unknown = Reflect.get(delta, 'partial_json');
  if (typeof text === 'string') return text;
  return typeof json === 'string' ? json : '';
}

export async function streamedMessage(
  client: Anthropic,
  call: StreamCall,
): Promise<StreamedMessage> {
  const stream = client.messages.stream(call.body, { signal: call.signal });
  stream.on('streamEvent', (event) => {
    call.onEvent();
    if (event.type === 'content_block_delta') call.onText(deltaText(event.delta));
  });
  const message = await stream.finalMessage();
  return { message, requestId: stream.request_id ?? undefined };
}
