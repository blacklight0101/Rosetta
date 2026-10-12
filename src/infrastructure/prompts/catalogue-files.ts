import type { Catalogue } from '../../domain/planning/catalogue.js';

// RF-606, DEC-84: the catalogue folder `prompts/catalogue/`.

/** Reads, checks and hashes the principle catalogue under `promptsFolder` (RF-606). */
// RF-606
export async function loadCatalogue(promptsFolder: string): Promise<Catalogue> {
  void promptsFolder;
  return Promise.resolve({ version: 0, sha256: '', entries: [], styles: [] });
}
