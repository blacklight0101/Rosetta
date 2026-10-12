import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { exchangeSchema, FakeHttpServer, type RecordedExchange } from './fake-http-server.js';

// ADR-008, RF-404: a fake Anthropic HTTP server on loopback that replays a recording of
// Anthropic's wire answers: each `POST /v1/messages` answers the next recorded exchange. The
// requests it received (headers and bodies) are kept for assertions.

const recordingSchema = z.strictObject({
  schemaVersion: z.literal(1),
  description: z.string().min(1),
  messages: z.array(exchangeSchema),
});

export type AnthropicRecording = z.infer<typeof recordingSchema>;

const recordingsFolder = join(process.cwd(), 'tests', 'recordings', 'anthropic');

const messagesPath = '/v1/messages';

/** Parses `tests/recordings/anthropic/<name>.json`. */
export async function loadAnthropicRecording(name: string): Promise<AnthropicRecording> {
  const text = await readFile(join(recordingsFolder, `${name}.json`), 'utf8');
  return recordingSchema.parse(JSON.parse(text));
}

function anthropicRoute(recording: AnthropicRecording) {
  let next = 0;
  return (method: string, path: string): RecordedExchange | undefined => {
    if (method !== 'POST' || path !== messagesPath) return undefined;
    const exchange = recording.messages[next];
    next += 1;
    return exchange;
  };
}

export class FakeAnthropicServer extends FakeHttpServer {
  constructor(recording: AnthropicRecording) {
    super(anthropicRoute(recording));
  }

  /** The message bodies received, in order. */
  messageBodies(): unknown[] {
    return this.bodiesOf(messagesPath);
  }
}
