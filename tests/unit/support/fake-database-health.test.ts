import { databaseHealthContract } from '../../contracts/database-health.contract.js';
import { FakeDatabaseHealth } from '../../support/fake-database-health.js';

databaseHealthContract('FakeDatabaseHealth', {
  up: () => Promise.resolve(new FakeDatabaseHealth(true)),
  down: () => Promise.resolve(new FakeDatabaseHealth(false)),
});
