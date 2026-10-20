import { describe } from 'vitest';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import {
  projectWorkbookAttachContract,
  projectWorkbookCountContract,
  projectWorkbookSourceContract,
} from '../../../contracts/project-workbook-source.contract.js';

// RF-152, RF-150: the memory adapter stores workbook projects and their source as the PostgreSQL one does.
describe('MemoryProjectRepository with workbook projects', () => {
  const fresh = () => Promise.resolve(new MemoryProjectRepository());
  projectWorkbookSourceContract('MemoryProjectRepository', fresh);
  projectWorkbookAttachContract('MemoryProjectRepository', fresh);
  projectWorkbookCountContract('MemoryProjectRepository', fresh);
});
