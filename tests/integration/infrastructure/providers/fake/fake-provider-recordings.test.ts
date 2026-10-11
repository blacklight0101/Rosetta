import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FakeProvider } from '../../../../../src/infrastructure/providers/fake/fake-provider.js';
import { loadRecording } from '../../../../../src/infrastructure/providers/fake/recording.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';

describe('recordings under tests/recordings', () => {
  it('RF-400 the fake provider replays a recording file', async () => {
    const recording = await loadRecording(
      join(process.cwd(), 'tests', 'recordings', 'fake', 'catalog-area.json'),
    );
    const provider = new FakeProvider({ testMode: true, recording });

    const first = await provider.complete(contractRequest());
    const second = await provider.complete(contractRequest());

    expect(first.toolCalls.map((call) => call.name)).toEqual(['read_file']);
    expect(second.finishReason).toBe('stop');
  });

  it('RF-400 a missing recording file is refused with RST-1502', async () => {
    const missing = join(process.cwd(), 'tests', 'recordings', 'none.json');

    await expect(loadRecording(missing)).rejects.toMatchObject({ code: 'RST-1502' });
  });
});
