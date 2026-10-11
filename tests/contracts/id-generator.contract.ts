import { describe, expect, it } from 'vitest';
import type { IdGenerator } from '../../src/application/ports/id-generator.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Contract of the IdGenerator port (RNF-004): every adapter and fake must pass it. */
export function idGeneratorContract(name: string, create: () => IdGenerator): void {
  describe(`IdGenerator contract: ${name}`, () => {
    it('RNF-004 uuid returns a version 4 UUID', () => {
      expect(create().uuid()).toMatch(UUID_V4);
    });

    it('RNF-004 uuid never repeats', () => {
      const ids = create();
      const seen = new Set([ids.uuid(), ids.uuid(), ids.uuid()]);

      expect(seen.size).toBe(3);
    });

    it('RNF-004 runId has the form yyyyMMdd-HHmmss-<stage>', () => {
      expect(create().runId('understand')).toMatch(/^\d{8}-\d{6}-understand$/);
    });
  });
}
