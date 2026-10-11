import { FanOutLogger } from '../../../../src/infrastructure/system/fan-out-logger.js';
import { StdoutJsonLogger } from '../../../../src/infrastructure/system/stdout-json-logger.js';
import { loggerContract } from '../../../contracts/logger.contract.js';
import { MemoryLogger } from '../../../support/memory-logger.js';

loggerContract('StdoutJsonLogger', (clock, masker) => {
  const chunks: string[] = [];
  const output = { write: (chunk: string) => chunks.push(chunk) };
  const logger = new StdoutJsonLogger({ output, clock, masker, minLevel: 'debug' });
  return Promise.resolve({ logger, written: () => Promise.resolve(chunks.join('')) });
});

loggerContract('MemoryLogger', (clock, masker) => {
  const logger = new MemoryLogger(clock, masker);
  return Promise.resolve({ logger, written: () => Promise.resolve(logger.text()) });
});

loggerContract('FanOutLogger', (clock, masker) => {
  const first = new MemoryLogger(clock, masker);
  const second = new MemoryLogger(clock, masker);
  const logger = new FanOutLogger([first, second]);
  return Promise.resolve({
    logger,
    written: () => {
      const text = first.text();
      if (second.text() !== text) throw new Error('the fan-out sinks received different entries');
      return Promise.resolve(text);
    },
  });
});
