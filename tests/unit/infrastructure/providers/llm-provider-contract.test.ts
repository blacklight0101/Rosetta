import { microUsd } from '../../../../src/domain/budget/money.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FakeProvider } from '../../../../src/infrastructure/providers/fake/fake-provider.js';
import { MemoryProviderCallLog } from '../../../../src/infrastructure/providers/memory-provider-call-log.js';
import { ObservedProvider } from '../../../../src/infrastructure/providers/observed-provider.js';
import {
  contractScenarios,
  llmProviderContract,
} from '../../../contracts/llm-provider.contract.js';
import { recordingOf } from '../../../support/fake-recordings.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

llmProviderContract('FakeProvider', (scenario) =>
  Promise.resolve(
    new FakeProvider({ testMode: true, recording: recordingOf(contractScenarios[scenario]) }),
  ),
);

llmProviderContract('ObservedProvider around FakeProvider', (scenario) =>
  Promise.resolve(
    new ObservedProvider({
      inner: new FakeProvider({
        testMode: true,
        recording: recordingOf(contractScenarios[scenario]),
      }),
      recorder: new MemoryProviderCallLog(new SecretMasker()),
      clock: new FixedClock('2026-10-11T09:05:03.007Z'),
      ids: new SequenceIdGenerator(),
      target: { provider: 'local-fake', kind: 'fake', endpointHost: 'fake.invalid' },
      priceCall: () => microUsd(0n),
      transcripts: true,
    }),
  ),
);
