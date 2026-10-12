// P1-13: where the end-to-end test server listens. One fixed port per run keeps the Origin of the
// server (ROSETTA_PUBLIC_URL) equal to the address the browser opens; ROSETTA_E2E_PORT moves it,
// for example when another run uses the default.

const DEFAULT_PORT = 18080;
const MIN_PORT = 1024;
const MAX_PORT = 65535;

/** The port from ROSETTA_E2E_PORT, or the default when it is unset or not a usable port. */
export function e2ePort(): number {
  const port = Number(process.env['ROSETTA_E2E_PORT']);
  return Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT ? port : DEFAULT_PORT;
}

/** The origin of the test server, which is also its public URL. */
export function e2eOrigin(): string {
  return `http://127.0.0.1:${String(e2ePort())}`;
}

/** RF-1201: the contact address the test server is configured with (`ROSETTA_CONTACT_EMAIL`). */
export const e2eContactEmail = 'access@example.org';
