import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  exchangeSchema,
  FakeHttpServer,
  type FakeServerOptions,
  type RecordedExchange,
} from './fake-http-server.js';

// ADR-008, RF-402: a fake OpenAI HTTP server on loopback that replays a recording of OpenAI's
// wire answers: each `POST /v1/chat/completions` answers the next recorded exchange. The requests
// it received (headers and bodies) are kept for assertions.

const recordingSchema = z.strictObject({
  schemaVersion: z.literal(1),
  description: z.string().min(1),
  chat: z.array(exchangeSchema),
  /** P3-131: the answers of `POST /v1/responses`. */
  responses: z.array(exchangeSchema).default([]),
});

export type OpenAiRecording = z.infer<typeof recordingSchema>;

const recordingsRoot = join(process.cwd(), 'tests', 'recordings');

const chatCompletionsPath = '/v1/chat/completions';
const responsesPath = '/v1/responses';

/** What OpenAI answers a Responses call that carries Chat Completions fields: HTTP 400. */
const unsupportedBody: RecordedExchange = {
  status: 400,
  body: {
    error: {
      message: "Unsupported parameter: 'messages'. Responses takes 'input'.",
      type: 'invalid_request_error',
      param: 'messages',
      code: 'unsupported_parameter',
    },
  },
};

function isResponsesBody(body: unknown): boolean {
  if (typeof body !== 'object' || body === null) return false;
  return Array.isArray(Reflect.get(body, 'input')) && !Reflect.has(body, 'messages');
}

/** Parses `tests/recordings/<folder>/<name>.json` (`openai` by default; `openai-compatible` for RF-403). */
export async function loadOpenAiRecording(
  name: string,
  folder: 'openai' | 'openai-compatible' = 'openai',
): Promise<OpenAiRecording> {
  const text = await readFile(join(recordingsRoot, folder, `${name}.json`), 'utf8');
  return recordingSchema.parse(JSON.parse(text));
}

function openAiRoute(recording: OpenAiRecording) {
  let nextChat = 0;
  let nextResponse = 0;
  return (method: string, path: string, body?: unknown): RecordedExchange | undefined => {
    if (method !== 'POST') return undefined;
    if (path === responsesPath) {
      if (!isResponsesBody(body)) return unsupportedBody;
      nextResponse += 1;
      return recording.responses[nextResponse - 1];
    }
    if (path !== chatCompletionsPath) return undefined;
    nextChat += 1;
    return recording.chat[nextChat - 1];
  };
}

export class FakeOpenAiServer extends FakeHttpServer {
  constructor(recording: OpenAiRecording, options: FakeServerOptions = {}) {
    super(openAiRoute(recording), options);
  }

  /** P3-131: the Responses bodies received, in order. */
  responseBodies(): unknown[] {
    return this.bodiesOf(responsesPath);
  }

  /** The chat completion bodies received, in order. */
  chatBodies(): unknown[] {
    return this.bodiesOf(chatCompletionsPath);
  }
}
