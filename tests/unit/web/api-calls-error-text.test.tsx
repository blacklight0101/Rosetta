import { describe, expect, it } from 'vitest';
import { callsBody, callsPath, cloud } from './api-calls-fixtures.js';
import { loaded, renderCalls, rowOf, standard } from './api-calls-helpers.js';
import { json } from './fake-api.js';

// RF-1011, RF-408: the API calls panel shows the provider's error text beside the call that failed.

describe('the API calls panel: provider error text', () => {
  it('RF-1011 shows the error text in the row of a failed call and none in an answered one', async () => {
    renderCalls({
      ...standard,
      [`GET ${callsPath}`]: json(
        200,
        callsBody({}, [
          cloud(1, {
            status: 'failed',
            httpStatus: 400,
            errorCode: 'RST-1506',
            errorMessage: 'invalid_request_error: tools not supported with reasoning_effort',
          }),
          cloud(2),
        ]),
      ),
    });
    await loaded();

    expect(rowOf(1).textContent).toContain(
      'invalid_request_error: tools not supported with reasoning_effort',
    );
    expect(rowOf(2).textContent).not.toContain('invalid_request_error');
  });
});
