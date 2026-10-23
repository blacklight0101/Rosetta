import type { OpenAI } from 'openai';
import type {
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses';

// P3-131, Q-60: one streamed Responses call (developers.openai.com, Responses streaming). The answer
// arrives as typed events: `response.output_text.delta` and `response.function_call_arguments.delta`
// in pieces, `response.output_item.done` with each finished item, and one last event that holds
// the whole response with its usage: `response.completed`, or `response.incomplete` when the
// output limit cut it (status incomplete, reason max_output_tokens). That response is the answer the
// shared reading parses; when its output is empty the items of `output_item.done` stand in. A stream
// that ends without a last event, or with `response.failed` or `error`, is a failed attempt. Every
// event restarts the idle timeout.

export interface ResponsesStreamCall {
  readonly body: ResponseCreateParamsStreaming;
  readonly signal: AbortSignal;
  /** An event arrived. */
  readonly onEvent: () => void;
  /** A piece of the answer (text or tool arguments) arrived. */
  readonly onText: (text: string) => void;
}

export interface StreamedResponse {
  /** The response the events add up to; the caller parses it. */
  readonly response: unknown;
  readonly requestId: string | undefined;
}

class StreamFailed extends Error {}

class Assembly {
  private final: object | undefined;
  private readonly items: unknown[] = [];

  add(event: ResponseStreamEvent, onText: (text: string) => void): void {
    if (
      event.type === 'response.output_text.delta' ||
      event.type === 'response.function_call_arguments.delta' ||
      event.type === 'response.refusal.delta'
    ) {
      onText(event.delta);
    } else if (event.type === 'response.output_item.done') {
      this.items.push(event.item);
    } else if (event.type === 'response.completed' || event.type === 'response.incomplete') {
      this.final = event.response;
    } else if (event.type === 'response.failed') {
      throw new StreamFailed('The Responses stream ended with response.failed.');
    } else if (event.type === 'error') {
      throw new StreamFailed('The Responses stream sent an error event.');
    }
  }

  /** The response of the last event, with the finished items when its own output is empty. */
  response(): unknown {
    if (this.final === undefined) throw new StreamFailed('The Responses stream ended early.');
    const output: unknown = Reflect.get(this.final, 'output');
    const empty = Array.isArray(output) && output.length === 0;
    return empty ? { ...this.final, output: this.items } : this.final;
  }
}

export async function streamedResponse(
  client: OpenAI,
  call: ResponsesStreamCall,
): Promise<StreamedResponse> {
  const { data, response } = await client.responses
    .create(call.body, { signal: call.signal })
    .withResponse();
  const assembly = new Assembly();
  for await (const event of data) {
    call.onEvent();
    assembly.add(event, call.onText);
  }
  // The SDK ends the iteration quietly when the signal aborts; a cut stream is not an answer.
  call.signal.throwIfAborted();
  return {
    response: assembly.response(),
    requestId: response.headers.get('x-request-id') ?? undefined,
  };
}
