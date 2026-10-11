import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  clientErrorHandler,
  connectHandler,
  type ClientSocket,
} from '../../../../src/presentation/web/early-errors.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';

// RF-007, RF-009, RF-1013: the handler for connections the Node parser refuses.

const publicUrl = 'https://rosetta.example.org';

interface FakeSocket extends ClientSocket {
  readonly written: string[];
}

function fakeSocket(state: { destroyed?: boolean; writable?: boolean } = {}): FakeSocket {
  const written: string[] = [];
  return {
    destroyed: state.destroyed ?? false,
    writable: state.writable ?? true,
    written,
    end(data: string) {
      written.push(data);
    },
  };
}

function parserError(code: string): Error {
  return Object.assign(new Error(`parser failure ${code}`), { code });
}

function handler(): { handle: (error: Error, socket: ClientSocket) => void; logger: MemoryLogger } {
  const logger = new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), new SecretMasker());
  return { handle: clientErrorHandler(logger, publicUrl), logger };
}

describe('client error handler: nothing to answer', () => {
  it('RF-009 a connection reset writes no response and no log entry', () => {
    const { handle, logger } = handler();
    const socket = fakeSocket();

    handle(parserError('ECONNRESET'), socket);

    expect(socket.written).toEqual([]);
    expect(logger.entries).toEqual([]);
  });

  it('RF-009 a destroyed socket gets no response and no log entry', () => {
    const { handle, logger } = handler();
    const socket = fakeSocket({ destroyed: true });

    handle(parserError('HPE_INVALID_METHOD'), socket);

    expect(socket.written).toEqual([]);
    expect(logger.entries).toEqual([]);
  });

  it('RF-009 a socket that is no longer writable gets no response and no log entry', () => {
    const { handle, logger } = handler();
    const socket = fakeSocket({ writable: false });

    handle(parserError('HPE_INVALID_METHOD'), socket);

    expect(socket.written).toEqual([]);
    expect(logger.entries).toEqual([]);
  });
});

describe('client error handler: refused requests', () => {
  it.each([
    ['ERR_HTTP_REQUEST_TIMEOUT', 408, 'Request Timeout'],
    ['HPE_HEADER_OVERFLOW', 431, 'Request Header Fields Too Large'],
    ['HPE_INVALID_METHOD', 400, 'Bad Request'],
  ])(
    'RF-007 %s answers %i RST-2000 with the security headers and one log entry',
    (code, status, reason) => {
      const { handle, logger } = handler();
      const socket = fakeSocket();

      handle(parserError(code), socket);

      const [response = ''] = socket.written;
      const [headLines = '', body = ''] = response.split('\r\n\r\n');
      const head = `${headLines}\r\n`;
      expect(head.startsWith(`HTTP/1.1 ${String(status)} ${reason}\r\n`)).toBe(true);
      expect(head).toContain('Connection: close\r\n');
      expect(head).toContain('X-Content-Type-Options: nosniff\r\n');
      expect(head).toContain('Strict-Transport-Security: max-age=31536000\r\n');
      expect(head).toContain('X-Robots-Tag: noindex, nofollow\r\n');
      expect(head).toContain(`Content-Length: ${String(Buffer.byteLength(body))}\r\n`);
      expect(JSON.parse(body)).toMatchObject({ code: ERROR_CODES.requestInvalid });
      expect(logger.entries).toHaveLength(1);
      expect(logger.entries[0]).toMatchObject({
        logger: 'http',
        data: { statusCode: status, error: code },
      });
    },
  );

  it('RF-007 an error without a code is reported by its name', () => {
    const { handle, logger } = handler();

    handle(new RangeError('no code'), fakeSocket());

    expect(logger.entries[0]?.data).toMatchObject({ statusCode: 400, error: 'RangeError' });
  });
});

describe('connect handler', () => {
  it('RF-007 a CONNECT request answers 400 RST-2000 on the socket', () => {
    const logger = new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), new SecretMasker());
    const socket = fakeSocket();

    connectHandler(logger, publicUrl)(new IncomingMessage(new Socket()), socket);

    expect(socket.written[0]?.startsWith('HTTP/1.1 400 Bad Request\r\n')).toBe(true);
    expect(socket.written[0]).toContain('X-Robots-Tag: noindex, nofollow\r\n');
    expect(logger.entries[0]?.data).toMatchObject({ method: 'CONNECT', statusCode: 400 });
  });

  it('RF-009 a CONNECT request on a destroyed socket gets no response and no log entry', () => {
    const logger = new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), new SecretMasker());
    const socket = fakeSocket({ destroyed: true });

    connectHandler(logger, publicUrl)(new IncomingMessage(new Socket()), socket);

    expect(socket.written).toEqual([]);
    expect(logger.entries).toEqual([]);
  });
});
