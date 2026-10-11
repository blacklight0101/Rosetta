import { connect, type Socket } from 'node:net';

// RF-007, RF-1013: raw HTTP/1.1 over a loopback socket, for the requests `fastify.inject` cannot
// send (a malformed request line, a missing Host header, pipelining on a draining connection).

/** How long the socket may stay silent before the exchange counts as finished. */
const quietMs = 300;

/** How long one exchange may take in all. */
const exchangeTimeoutMs = 5000;

export interface RawResponse {
  readonly status: number;
  /** Header names in lower case. */
  readonly headers: Map<string, string>;
  readonly body: string;
}

/** Every HTTP/1.x response found in the bytes a connection answered, in order. */
export function parseRawResponses(raw: string): RawResponse[] {
  return raw
    .split(/(?=HTTP\/1\.[01] \d{3} )/)
    .filter((part) => part !== '')
    .map((part) => {
      const [head = '', ...bodyParts] = part.split('\r\n\r\n');
      const [statusLine = '', ...lines] = head.split('\r\n');
      const headers = new Map(
        lines.map((line) => {
          const colon = line.indexOf(':');
          return [line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim()] as const;
        }),
      );
      return {
        status: Number(statusLine.split(' ')[1]),
        headers,
        body: bodyParts.join('\r\n\r\n'),
      };
    });
}

/** The single response of an exchange. */
export function parseRawResponse(raw: string): RawResponse {
  const [first] = parseRawResponses(raw);
  if (first === undefined) throw new Error(`no HTTP response in ${JSON.stringify(raw)}`);
  return first;
}

/** One client connection; the caller writes whatever bytes it wants and then settles it. */
export class RawConnection {
  private readonly socket: Socket;
  private readonly chunks: Buffer[] = [];
  private readonly answered: Promise<string>;

  constructor(socket: Socket) {
    this.socket = socket;
    this.answered = new Promise((resolve, reject) => {
      let quiet: NodeJS.Timeout | undefined;
      const finish = (): void => {
        clearTimeout(quiet);
        socket.destroy();
        resolve(Buffer.concat(this.chunks).toString('utf8'));
      };
      socket.setTimeout(exchangeTimeoutMs, () => {
        reject(new Error(`no answer within ${String(exchangeTimeoutMs)} ms`));
        socket.destroy();
      });
      socket.on('data', (chunk: Buffer) => {
        this.chunks.push(chunk);
        clearTimeout(quiet);
        quiet = setTimeout(finish, quietMs);
      });
      socket.on('error', reject);
      socket.on('close', finish);
    });
  }

  write(payload: string): void {
    this.socket.write(payload);
  }

  /** Everything the server answered, once it closed the connection or went quiet. */
  settle(): Promise<string> {
    return this.answered;
  }
}

/** Opens a connection to a listening address such as `http://127.0.0.1:54321`. */
export function openRawConnection(address: string): Promise<RawConnection> {
  const { hostname, port } = new URL(address);
  return new Promise((resolve, reject) => {
    const socket = connect({ host: hostname, port: Number(port) });
    socket.once('error', reject);
    socket.once('connect', () => {
      resolve(new RawConnection(socket));
    });
  });
}

/** Sends the bytes and returns everything the server answers. */
export async function sendRaw(address: string, payload: string): Promise<string> {
  const connection = await openRawConnection(address);
  connection.write(payload);
  return connection.settle();
}
