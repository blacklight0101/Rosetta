// FAKE SECRETS ONLY (RNF-003). Every secret shape added by P2-43 (RF-141): bare JWTs, token and secret
// keys, cloud keys, command-line flags, Authorization schemes and URL credentials. Every value is built at
// run time from harmless pieces such as "FAKE0", so the repository holds no secret-like literal.

import { moreCoverageCases } from './secret-coverage-more.js';
import { keyCoverageCases } from './secret-coverage-keys.js';
import type { CoverageCase } from './secret-coverage-values.js';
import { schemeCoverageCases } from './secret-coverage-schemes.js';

export const coverageCases: readonly CoverageCase[] = [
  ...keyCoverageCases,
  ...schemeCoverageCases,
  ...moreCoverageCases,
];
