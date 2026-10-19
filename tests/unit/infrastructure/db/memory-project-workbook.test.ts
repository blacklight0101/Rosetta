import { describe } from 'vitest';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { projectWorkbookSourceContract } from '../../../contracts/project-workbook-source.contract.js';

// RF-152: the memory adapter stores workbook projects as the PostgreSQL one does.
describe('MemoryProjectRepository with workbook projects', () => {
  projectWorkbookSourceContract('MemoryProjectRepository', () =>
    Promise.resolve(new MemoryProjectRepository()),
  );
});
