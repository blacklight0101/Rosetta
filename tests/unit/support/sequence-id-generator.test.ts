import { describe, expect, it } from 'vitest';
import { SequenceIdGenerator } from '../../support/sequence-id-generator.js';

describe('SequenceIdGenerator', () => {
  it('RNF-004 yields predictable UUIDs in order', () => {
    const ids = new SequenceIdGenerator();

    expect(ids.uuid()).toBe('00000000-0000-4000-8000-000000000001');
    expect(ids.uuid()).toBe('00000000-0000-4000-8000-000000000002');
  });

  it('RNF-004 yields run ids in the yyyyMMdd-HHmmss-<stage> shape, one second apart', () => {
    const ids = new SequenceIdGenerator();

    expect(ids.runId('scan')).toBe('20260101-000001-scan');
    expect(ids.runId('scan')).toBe('20260101-000002-scan');
    expect(ids.runId('plan')).toBe('20260101-000003-plan');
  });

  it('RNF-004 two generators repeat the same sequence', () => {
    expect(new SequenceIdGenerator().uuid()).toBe(new SequenceIdGenerator().uuid());
  });
});
