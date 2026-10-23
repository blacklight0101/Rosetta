import { afterEach, describe, expect, it } from 'vitest';
import { runAgentTask } from '../../../src/application/agent/agent-loop.js';
import { OpenAiProvider } from '../../../src/infrastructure/providers/openai/openai-provider.js';
import { shippingCards } from '../../support/agent-fixtures.js';
import { loopSetup, readOrder } from '../../support/agent-loop-harness.js';
import { FakeOpenAiServer } from '../../support/fake-openai-server.js';
import { fakeOpenAiKey } from '../../support/secret-fixture.js';

// P3-131, RF-201, RF-402: a Responses exchange (hand-written in the documented shape, no real call)
// with one tool call and then the cards round-trips through the agent loop: the loop runs the call,
// answers it by call id as a function_call_output item, and ends Done on the second answer.

const usage = (input: number, output: number) => ({
  input_tokens: input,
  input_tokens_details: { cached_tokens: 0 },
  output_tokens: output,
  output_tokens_details: { reasoning_tokens: 0 },
});
const answer = (output: unknown[], counts: ReturnType<typeof usage>) => ({
  status: 200,
  headers: { 'x-request-id': 'req_FAKE-loop' },
  body: {
    id: 'resp_FAKE',
    object: 'response',
    status: 'completed',
    model: 'fake-model-2026',
    output,
    usage: counts,
  },
});

const servers: FakeOpenAiServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
});

describe('the agent loop over the Responses API', () => {
  it('P3-131 a tool call and its output round-trip', async () => {
    const server = new FakeOpenAiServer({
      schemaVersion: 1,
      description: 'FAKE recording: a read_file call, then the cards.',
      chat: [],
      responses: [
        answer(
          [
            {
              type: 'function_call',
              id: 'fc_FAKE1',
              call_id: 'call_FAKE_loop_1',
              name: readOrder.name,
              arguments: JSON.stringify(readOrder.args),
            },
          ],
          usage(100, 10),
        ),
        answer(
          [
            {
              type: 'message',
              content: [{ type: 'output_text', text: shippingCards }],
            },
          ],
          usage(160, 40),
        ),
      ],
    });
    servers.push(server);
    const baseUrl = `${await server.start()}/v1`;
    const provider = new OpenAiProvider({
      ...{ apiKey: fakeOpenAiKey, baseUrl, timeoutSeconds: 5, maxRetries: 0, testMode: true },
      usesResponses: () => true,
    });
    const { request } = loopSetup([]);

    const result = await runAgentTask(request(provider));

    expect(result.state).toBe('Done');
    expect(result.turns).toBe(2);
    const bodies = server.responseBodies() as { input: { type?: string; call_id?: string }[] }[];
    expect(server.received.map(({ path }) => path)).toEqual(['/v1/responses', '/v1/responses']);
    const sent = bodies[1]?.input ?? [];
    expect(sent.filter((item) => item.type === 'function_call_output')).toEqual([
      expect.objectContaining({ call_id: 'call_FAKE_loop_1' }),
    ]);
  });
});
