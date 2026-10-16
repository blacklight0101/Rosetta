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
});

export type OpenAiRecording = z.infer<typeof recordingSchema>;

const recordingsRoot = join(process.cwd(), 'tests', 'recordings');

const chatCompletionsPath = '/v1/chat/completions';

/** Parses `tests/recordings/<folder>/<name>.json` (`openai` by default; `openai-compatible` for RF-403). */
export async function loadOpenAiRecording(
  name: string,
  folder: 'openai' | 'openai-compatible' = 'openai',
): Promise<OpenAiRecording> {
  const text = await readFile(join(recordingsRoot, folder, `${name}.json`), 'utf8');
  return recordingSchema.parse(JSON.parse(text));
}

function openAiRoute(recording: OpenAiRecording) {
  let next = 0;
  return (method: string, path: string): RecordedExchange | undefined => {
    if (method !== 'POST' || path !== chatCompletionsPath) return undefined;
    const exchange = recording.chat[next];
    next += 1;
    return exchange;
  };
}

export class FakeOpenAiServer extends FakeHttpServer {
  constructor(recording: OpenAiRecording, options: FakeServerOptions = {}) {
    super(openAiRoute(recording), options);
  }

  /** The chat completion bodies received, in order. */
  chatBodies(): unknown[] {
    return this.bodiesOf(chatCompletionsPath);
  }
}
