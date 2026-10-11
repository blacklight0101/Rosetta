import { describe, expect, it } from 'vitest';
import type { LanguagePack, PackFile } from '../../src/application/ports/language-pack.js';

/**
 * Contract of the LanguagePack port (RF-110, ADR-004): every pack must pass it. `sample` is a file
 * the pack understands, with at least one symbol.
 */
export function languagePackContract(
  name: string,
  create: () => Promise<LanguagePack>,
  sample: PackFile,
): void {
  describe(`LanguagePack contract: ${name}`, () => {
    it('RF-110 names itself, has a version and claims lower-case extensions with a dot', async () => {
      const pack = await create();

      expect(pack.name).not.toBe('');
      expect(pack.version).not.toBe('');
      expect(pack.extensions.length).toBeGreaterThan(0);
      for (const extension of pack.extensions) expect(extension).toMatch(/^\.[a-z0-9]+$/u);
    });

    it('RF-110 reports symbols, references, routes and entities as lists', async () => {
      const analysis = (await create()).analyse(sample);

      expect(analysis.symbols.length).toBeGreaterThan(0);
      expect(Array.isArray(analysis.references)).toBe(true);
      expect(Array.isArray(analysis.routes)).toBe(true);
      expect(Array.isArray(analysis.entities)).toBe(true);
    });

    it('RF-110 keeps every line range inside the file and every record on the file path', async () => {
      const analysis = (await create()).analyse(sample);
      const lineCount = sample.text.split('\n').length;

      for (const symbol of analysis.symbols) {
        expect(symbol.path).toBe(sample.path);
        expect(symbol.startLine).toBeGreaterThanOrEqual(1);
        expect(symbol.endLine).toBeGreaterThanOrEqual(symbol.startLine);
        expect(symbol.endLine).toBeLessThanOrEqual(lineCount);
      }
      for (const route of analysis.routes) expect(route.path).toBe(sample.path);
      for (const entity of analysis.entities) expect(entity.path).toBe(sample.path);
      for (const reference of analysis.references) expect(reference.from).toBe(sample.path);
    });

    it('RF-106 gives the same analysis for the same file', async () => {
      const pack = await create();

      expect(pack.analyse(sample)).toEqual(pack.analyse(sample));
    });

    it('RF-110 answers an empty file with no symbols instead of failing', async () => {
      const analysis = (await create()).analyse({ path: sample.path, text: '' });

      expect(analysis.symbols).toEqual([]);
    });
  });
}
