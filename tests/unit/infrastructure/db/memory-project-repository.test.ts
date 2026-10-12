import { describe } from 'vitest';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryServerSettings } from '../../../../src/infrastructure/db/memory-server-settings.js';
import { projectRepositoryContract } from '../../../contracts/project-repository.contract.js';
import { serverSettingsContract } from '../../../contracts/server-settings.contract.js';

// Architecture section 7: the memory adapters pass the same contracts as the PostgreSQL ones.
describe('MemoryProjectRepository', () => {
  projectRepositoryContract('MemoryProjectRepository', () =>
    Promise.resolve(new MemoryProjectRepository()),
  );
});

describe('MemoryServerSettings', () => {
  serverSettingsContract('MemoryServerSettings', (roles) =>
    Promise.resolve(new MemoryServerSettings(roles)),
  );
});
