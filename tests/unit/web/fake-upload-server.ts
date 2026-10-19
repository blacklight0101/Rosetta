import { vi } from 'vitest';

// P3-39, RFC-004 section 4.2: a fake `PUT /api/projects/:id/source`. The page sends the archive with
// XMLHttpRequest (fetch cannot report upload progress), so the fake stands in for that class. Every
// request is recorded; a test answers it, or reports progress, from the outside.

export interface UploadRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: unknown;
}

export interface PendingUpload extends UploadRequest {
  readonly progress: (loaded: number, total: number) => void;
  readonly respond: (status: number, body: unknown) => void;
  readonly failNetwork: () => void;
}

export interface FakeUploadServer {
  readonly requests: UploadRequest[];
  /** The upload still waiting for an answer. */
  readonly pending: () => PendingUpload;
}

type Listener = (event?: unknown) => void;

class FakeRequest {
  static readonly all: FakeRequest[] = [];
  method = '';
  path = '';
  readonly headers: Record<string, string> = {};
  body: unknown;
  status = 0;
  responseText = '';
  timeout = 0;
  readonly upload: { onprogress: Listener | null } = { onprogress: null };
  onload: Listener | null = null;
  onerror: Listener | null = null;
  onabort: Listener | null = null;
  ontimeout: Listener | null = null;

  open(method: string, path: string): void {
    this.method = method;
    this.path = path;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }

  send(body: unknown): void {
    this.body = body;
    FakeRequest.all.push(this);
  }

  abort(): void {
    this.onabort?.();
  }
}

export function installFakeUploadServer(): FakeUploadServer {
  FakeRequest.all.length = 0;
  vi.stubGlobal('XMLHttpRequest', FakeRequest);
  return {
    requests: FakeRequest.all,
    pending() {
      const request = FakeRequest.all.at(-1);
      if (request === undefined) throw new Error('No upload was sent.');
      return {
        method: request.method,
        path: request.path,
        headers: request.headers,
        body: request.body,
        progress(loaded, total) {
          request.upload.onprogress?.({ lengthComputable: true, loaded, total });
        },
        respond(status, body) {
          request.status = status;
          request.responseText = JSON.stringify(body);
          request.onload?.();
        },
        failNetwork() {
          request.onerror?.();
        },
      };
    },
  };
}
