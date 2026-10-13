// FAKE CREDENTIAL ONLY (RNF-003), RF-1104, P1-131: the key the end-to-end server holds for OpenAI,
// so a user without a key of their own runs on the server's key under the administrator's caps
// (RF-1106). It is built from pieces at run time, goes only into the environment of the test server
// (serve.ts) and is never printed; the provider that answers is the double of the harness, so
// nothing leaves the machine with it. Specs import it only to prove it appears on no page.

/** The server's OpenAI key in the test environment. */
export function e2eServerOpenAiKey(): string {
  return ['fixture', 'server', 'material', 'of', 'a', 'key', 'SRV1'].join('-');
}
