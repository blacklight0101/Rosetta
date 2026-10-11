import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { exchangeSchema, FakeHttpServer, type RecordedExchange } from './fake-http-server.js';

// ADR-008, RF-401: a fake Ollama HTTP server on loopback that replays a recording of Ollama's
// wire answers. `GET /api/tags` answers the recording's installed models; each `POST /api/chat`
// answers the next recorded exchange. The bodies it received are kept for assertions.

const recordingSchema = z.strictObject({
  schemaVersion: z.literal(1),
  description: z.string().min(1),
  models: z.array(z.strictObject({ name: z.string(), digest: z.string() })),
  chat: z.array(exchangeSchema),
});

export type OllamaRecording = z.infer<typeof recordingSchema>;

const recordingsFolder = join(process.cwd(), 'tests', 'recordings', 'ollama');

/** Parses `tests/recordings/ollama/<name>.json`. */
export async function loadOllamaRecording(name: string): Promise<OllamaRecording> {
  const text = await readFile(join(recordingsFolder, `${name}.json`), 'utf8');
  return recordingSchema.parse(JSON.parse(text));
}

/** Answers tags with the recording's models and each chat with the next recorded exchange. */
function ollamaRoute(recording: OllamaRecording) {
  let next = 0;
  return (method: string, path: string): RecordedExchange | undefined => {
    if (method === 'GET' && path === '/api/tags') {
      return { status: 200, body: { models: recording.models } };
    }
    if (method !== 'POST' || path !== '/api/chat') return undefined;
    const exchange = recording.chat[next];
    next += 1;
    return exchange;
  };
}

export class FakeOllamaServer extends FakeHttpServer {
  constructor(recording: OllamaRecording) {
    super(ollamaRoute(recording));
  }

  /** The chat bodies received, in order. */
  chatBodies(): unknown[] {
    return this.bodiesOf('/api/chat');
  }
}
