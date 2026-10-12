import { describe } from 'vitest';
import { MemoryEventSink } from '../../../../src/infrastructure/events/memory-event-sink.js';
import { runEventStoreContract } from '../../../contracts/run-event-store.contract.js';

// Architecture section 7: the memory sink passes the same contract as the JSONL event log.
describe('MemoryEventSink', () => {
  runEventStoreContract('MemoryEventSink', () => {
    const sink = new MemoryEventSink();
    return Promise.resolve({ sink, history: sink });
  });
});
