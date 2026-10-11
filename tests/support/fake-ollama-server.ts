import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { exchangeSchema, FakeHttpServer, type RecordedExchange } from './fake-http-server.js';

// ADR-008, RF-401: a fake Ollama HTTP server on loopback that replays a recording of Ollama's
// wire answers. `GET /api/tags` answers the recording's installed models; each `POST /api/chat`
// answers the next recorded exchange. For the context size (DEC-114) `POST /api/show` answers the
// recorded `show`, `POST /api/generate` (the model load) answers a finished load, and each
// `GET /api/ps` answers the next recorded `ps`. Anything not recorded answers 404. The bodies it
// received are kept for assertions.

const recordingSchema = z.strictObject({
  schemaVersion: z.literal(1),
  description: z.string().min(1),
  models: z.array(z.strictObject({ name: z.string(), digest: z.string() })),
  /** The /api/show answer (the model's trained context); left out, /api/show answers 404. */
  show: exchangeSchema.optional(),
  /** The /api/ps answers in order (what is loaded, and how much of it is in GPU memory). */
  ps: z.array(exchangeSchema).optional(),
  chat: z.array(exchangeSchema),
});

export type OllamaRecording = z.infer<typeof recordingSchema>;

const recordingsFolder = join(process.cwd(), 'tests', 'recordings', 'ollama');

/** Parses `tests/recordings/ollama/<name>.json`. */
export async function loadOllamaRecording(name: string): Promise<OllamaRecording> {
  const text = await readFile(join(recordingsFolder, `${name}.json`), 'utf8');
  return recordingSchema.parse(JSON.parse(text));
}

/** Ollama's answer to a load (`/api/generate` without a prompt). */
const loaded: RecordedExchange = {
  status: 200,
  body: { model: 'contract-model', response: '', done: true, done_reason: 'load' },
};

/** Answers tags with the recording's models, chat and ps with the next recorded exchange. */
function ollamaRoute(recording: OllamaRecording) {
  const next = { chat: 0, ps: 0 };
  const nextOf = (
    list: 'chat' | 'ps',
    exchanges: readonly RecordedExchange[],
  ): RecordedExchange | undefined => {
    const index = next[list];
    next[list] += 1;
    return exchanges[index];
  };
  return (method: string, path: string): RecordedExchange | undefined => {
    switch (`${method} ${path}`) {
      case 'GET /api/tags':
        return { status: 200, body: { models: recording.models } };
      case 'POST /api/chat':
        return nextOf('chat', recording.chat);
      case 'POST /api/show':
        return recording.show;
      case 'POST /api/generate':
        return loaded;
      case 'GET /api/ps':
        return nextOf('ps', recording.ps ?? []);
      default:
        return undefined;
    }
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
