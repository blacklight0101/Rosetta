import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { z } from 'zod';

// ADR-008, RF-401: a fake Ollama HTTP server on loopback that replays a recording of Ollama's
// wire answers. `GET /api/tags` answers the recording's installed models; each `POST /api/chat`
// answers the next recorded exchange. The bodies it received are kept for assertions.

const exchangeSchema = z.union([
  z.strictObject({
    status: z.number().int(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.unknown(),
  }),
  /** Never answers: the adapter's timeout must end the attempt. */
  z.strictObject({ hang: z.literal(true) }),
]);

const recordingSchema = z.strictObject({
  schemaVersion: z.literal(1),
  description: z.string().min(1),
  models: z.array(z.strictObject({ name: z.string(), digest: z.string() })),
  chat: z.array(exchangeSchema),
});

export type OllamaExchange = z.infer<typeof exchangeSchema>;
export type OllamaRecording = z.infer<typeof recordingSchema>;

const recordingsFolder = join(process.cwd(), 'tests', 'recordings', 'ollama');

/** Parses `tests/recordings/ollama/<name>.json`. */
export async function loadOllamaRecording(name: string): Promise<OllamaRecording> {
  const text = await readFile(join(recordingsFolder, `${name}.json`), 'utf8');
  return recordingSchema.parse(JSON.parse(text));
}

export interface ReceivedRequest {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
}

async function bodyOf(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    if (Buffer.isBuffer(chunk)) chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text === '' ? undefined : JSON.parse(text);
}

function sendJson(response: ServerResponse, exchange: OllamaExchange): void {
  if ('hang' in exchange) return;
  response.writeHead(exchange.status, { 'content-type': 'application/json', ...exchange.headers });
  response.end(JSON.stringify(exchange.body));
}

export class FakeOllamaServer {
  readonly received: ReceivedRequest[] = [];
  private readonly recording: OllamaRecording;
  private readonly server = createServer((request, response) => {
    void this.answer(request, response);
  });
  private next = 0;

  constructor(recording: OllamaRecording) {
    this.recording = recording;
  }

  /** Starts on a free loopback port and returns its base URL. */
  async start(): Promise<string> {
    await new Promise<void>((resolve) => {
      this.server.listen(0, '127.0.0.1', resolve);
    });
    return `http://127.0.0.1:${String(this.port())}`;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }

  /** The chat bodies received, in order. */
  chatBodies(): unknown[] {
    return this.received.filter((r) => r.path === '/api/chat').map((r) => r.body);
  }

  private port(): number {
    const address: AddressInfo | string | null = this.server.address();
    if (address === null || typeof address === 'string') throw new Error('server not listening');
    return address.port;
  }

  private async answer(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const path = request.url ?? '';
    const method = request.method ?? '';
    this.received.push({ method, path, body: await bodyOf(request) });
    if (method === 'GET' && path === '/api/tags') {
      sendJson(response, { status: 200, body: { models: this.recording.models } });
      return;
    }
    const exchange = method === 'POST' && path === '/api/chat' ? this.nextExchange() : undefined;
    sendJson(response, exchange ?? { status: 404, body: { error: 'not recorded' } });
  }

  private nextExchange(): OllamaExchange | undefined {
    const exchange = this.recording.chat[this.next];
    this.next += 1;
    return exchange;
  }
}

/** A loopback URL with nothing listening on it: a stopped Ollama. */
export async function closedLoopbackUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address: AddressInfo | string | null = server.address();
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  if (address === null || typeof address === 'string') throw new Error('server not listening');
  return `http://127.0.0.1:${String(address.port)}`;
}
