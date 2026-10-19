// RF-128, RFC-004 section 4.2: sends one file as the body of a request and reports how much of it
// has gone. `fetch` cannot report upload progress, so a file goes through XMLHttpRequest. The
// result never throws: an answer carries its status and text, anything else is a failure.

export interface BlobSend {
  readonly method: 'PUT';
  readonly path: string;
  readonly file: Blob;
  readonly contentType: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly csrfToken: string | undefined;
  readonly timeoutMs: number;
  readonly signal: AbortSignal | undefined;
  readonly onProgress: ((loaded: number, total: number) => void) | undefined;
}

export type BlobOutcome =
  | { readonly kind: 'answered'; readonly status: number; readonly text: string }
  | { readonly kind: 'failed'; readonly cancelled: boolean };

// RF-128
export function sendBlob(send: BlobSend): Promise<BlobOutcome> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest();
    const failed = (cancelled: boolean): void => {
      resolve({ kind: 'failed', cancelled });
    };
    request.open(send.method, send.path);
    request.timeout = send.timeoutMs;
    request.setRequestHeader('content-type', send.contentType);
    request.setRequestHeader('accept', 'application/json');
    for (const [name, value] of Object.entries(send.headers)) request.setRequestHeader(name, value);
    if (send.csrfToken !== undefined) request.setRequestHeader('x-csrf-token', send.csrfToken);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) send.onProgress?.(event.loaded, event.total);
    };
    request.onload = () => {
      resolve({ kind: 'answered', status: request.status, text: request.responseText });
    };
    request.onerror = () => {
      failed(false);
    };
    request.ontimeout = () => {
      failed(false);
    };
    request.onabort = () => {
      failed(true);
    };
    send.signal?.addEventListener('abort', () => {
      request.abort();
    });
    request.send(send.file);
  });
}
