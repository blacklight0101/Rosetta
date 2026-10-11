import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { z } from 'zod';

// ADR-008, RF-406: a fake provider HTTP server on loopback for adapter tests. A route function
// chooses the recorded exchange for each request; the requests it received (method, path,
// headers and JSON body) are kept for assertions. The provider fakes (Ollama, OpenAI) build on it.

export const exchangeSchema = z.union([
  z.strictObject({
    status: z.number().int(),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.unknown(),
  }),
  /** Never answers: the adapter's timeout must end the attempt. */
  z.strictObject({ hang: z.literal(true) }),
]);

export type RecordedExchange = z.infer<typeof exchangeSchema>;

export interface ReceivedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

/** Chooses the exchange that answers a request; undefined answers 404. */
export type Route = (method: string, path: string) => RecordedExchange | undefined;

async function bodyOf(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    if (Buffer.isBuffer(chunk)) chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8');
  return text === '' ? undefined : JSON.parse(text);
}

function headersOf(request: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(request.headers)) {
    headers[name] = Array.isArray(value) ? value.join(', ') : (value ?? '');
  }
  return headers;
}

function sendJson(response: ServerResponse, exchange: RecordedExchange): void {
  if ('hang' in exchange) return;
  response.writeHead(exchange.status, { 'content-type': 'application/json', ...exchange.headers });
  response.end(JSON.stringify(exchange.body));
}

function portOf(address: AddressInfo | string | null): number {
  if (address === null || typeof address === 'string') throw new Error('server not listening');
  return address.port;
}

export class FakeHttpServer {
  readonly received: ReceivedRequest[] = [];
  private readonly route: Route;
  private readonly server = createServer((request, response) => {
    void this.answer(request, response);
  });

  constructor(route: Route) {
    this.route = route;
  }

  /** Starts on a free loopback port and returns its base URL. */
  async start(): Promise<string> {
    await new Promise<void>((resolve) => {
      this.server.listen(0, '127.0.0.1', resolve);
    });
    return `http://127.0.0.1:${String(portOf(this.server.address()))}`;
  }

  async stop(): Promise<void> {
    this.server.closeAllConnections();
    await new Promise<void>((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }

  /** The bodies received on `path`, in order. */
  bodiesOf(path: string): unknown[] {
    return this.received.filter((r) => r.path === path).map((r) => r.body);
  }

  private async answer(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const path = request.url ?? '';
    const method = request.method ?? '';
    const headers = headersOf(request);
    this.received.push({ method, path, headers, body: await bodyOf(request) });
    const exchange = this.route(method, path);
    sendJson(response, exchange ?? { status: 404, body: { error: 'not recorded' } });
  }
}

/** A loopback URL with nothing listening on it: a stopped server. */
export async function closedLoopbackUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = portOf(server.address());
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  return `http://127.0.0.1:${String(port)}`;
}
