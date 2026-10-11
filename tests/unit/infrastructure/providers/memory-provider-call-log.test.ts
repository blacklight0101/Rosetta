import { MemoryProviderCallLog } from '../../../../src/infrastructure/providers/memory-provider-call-log.js';
import { providerCallRecorderContract } from '../../../contracts/provider-call-recorder.contract.js';

providerCallRecorderContract('MemoryProviderCallLog', (masker) => {
  const log = new MemoryProviderCallLog(masker);
  return Promise.resolve({
    recorder: log,
    calls: () => Promise.resolve(log.callsText()),
    transcript: (agentTaskId) => Promise.resolve(log.transcriptText(agentTaskId)),
  });
});
