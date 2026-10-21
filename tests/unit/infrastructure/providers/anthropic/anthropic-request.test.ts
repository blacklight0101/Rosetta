import { describe, expect, it } from 'vitest';
import { messageBody } from '../../../../../src/infrastructure/providers/anthropic/anthropic-request.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';

// RF-404, Q-58: the body of one Anthropic Messages API call carries `output_config.effort` only
// when the request carries an effort; with none the key is not there at all.

describe('Anthropic request body: effort', () => {
  it('Q-58 has no output_config key at all when the request carries no effort', () => {
    expect(messageBody(contractRequest(), 512)).not.toHaveProperty('output_config');
  });

  it('Q-58 has output_config.effort with the effort of the request', () => {
    const body = messageBody({ ...contractRequest(), reasoningEffort: 'high' }, 512);

    expect(body.output_config).toEqual({ effort: 'high' });
  });
});
