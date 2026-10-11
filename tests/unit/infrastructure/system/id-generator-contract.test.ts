import { TimestampIdGenerator } from '../../../../src/infrastructure/system/timestamp-id-generator.js';
import { idGeneratorContract } from '../../../contracts/id-generator.contract.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

idGeneratorContract(
  'TimestampIdGenerator',
  () => new TimestampIdGenerator(new FixedClock('2026-10-11T09:05:03.007Z')),
);
idGeneratorContract('SequenceIdGenerator', () => new SequenceIdGenerator());
