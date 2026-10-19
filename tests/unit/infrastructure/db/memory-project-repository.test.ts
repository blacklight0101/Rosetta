import { describe } from 'vitest';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryServerSettings } from '../../../../src/infrastructure/db/memory-server-settings.js';
import { projectRepositoryContract } from '../../../contracts/project-repository.contract.js';
import { projectUploadSourceContract } from '../../../contracts/project-upload-source.contract.js';
import {
  serverCapsContract,
  serverSettingsContract,
} from '../../../contracts/server-settings.contract.js';

// Architecture section 7: the memory adapters pass the same contracts as the PostgreSQL ones.
describe('MemoryProjectRepository', () => {
  const fresh = () => Promise.resolve(new MemoryProjectRepository());
  projectRepositoryContract('MemoryProjectRepository', fresh);
  projectUploadSourceContract('MemoryProjectRepository', fresh);
});

describe('MemoryServerSettings', () => {
  serverSettingsContract('MemoryServerSettings', (roles) =>
    Promise.resolve(new MemoryServerSettings(roles)),
  );
  serverCapsContract('MemoryServerSettings', () => Promise.resolve(new MemoryServerSettings({})));
});
