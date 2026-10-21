import { describe, expect, it } from 'vitest';
import { callsBody, callsPath, cloud } from './api-calls-fixtures.js';
import { loaded, renderCalls, rowOf, standard } from './api-calls-helpers.js';
import { json } from './fake-api.js';

// RF-1011, RF-402, Q-58, P3-86: the API calls panel shows the reasoning tokens of a call apart from
// its output tokens; a call without them shows its output tokens only.

describe('the API calls panel: reasoning tokens', () => {
  it('RF-1011 shows the reasoning tokens under the output tokens', async () => {
    renderCalls({
      ...standard,
      [`GET ${callsPath}`]: json(
        200,
        callsBody({}, [
          cloud(1, { outputTokens: 4096, reasoningTokens: 3500, finishReason: 'length' }),
          cloud(2, { outputTokens: 186 }),
        ]),
      ),
    });
    await loaded();

    expect(rowOf(1).textContent).toContain('4,096');
    expect(rowOf(1).textContent).toContain('3,500 reasoning');
    expect(rowOf(2).textContent).not.toContain('reasoning');
  });
});
