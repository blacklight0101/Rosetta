import { request } from 'node:http';

// RF-1006: a small server-sent events client over a real loopback connection, for the tests that
// need a stream that stays open (`fastify.inject` waits for the end of the response).

export interface SseConnection {
  readonly status: number;
  readonly contentType: string;
  /** Everything received so far. */
  text(): string;
  /** Resolves once the received text contains `part`. */
  waitFor(part: string): Promise<void>;
  /** Resolves when the server ended the stream. */
  readonly ended: Promise<void>;
  /** Closes the connection from the client side. */
  abort(): void;
  /** Stops reading, as a page that stalls: what the server sends waits in its buffers. */
  pause(): void;
  /** Reads again after `pause`. */
  resume(): void;
}

export function connectSse(url: string, headers: Record<string, string>): Promise<SseConnection> {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers }, (response) => {
      let received = '';
      const waiting = new Set<() => void>();
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        received += chunk;
        for (const check of [...waiting]) check();
      });
      const ended = new Promise<void>((done) => {
        response.on('end', done);
        response.on('close', done);
        response.on('error', () => {
          done();
        });
      });
      resolve({
        status: response.statusCode ?? 0,
        contentType: response.headers['content-type'] ?? '',
        text: () => received,
        waitFor: (part) =>
          new Promise<void>((found) => {
            const check = (): void => {
              if (!received.includes(part)) return;
              waiting.delete(check);
              found();
            };
            waiting.add(check);
            check();
          }),
        ended,
        abort: () => {
          req.destroy();
        },
        pause: () => {
          response.pause();
        },
        resume: () => {
          response.resume();
        },
      });
    });
    req.on('error', reject);
    req.end();
  });
}
