import type { SessionStore } from '../../src/application/ports/session-store.js';
import { StreamRegistry } from '../../src/presentation/web/event-stream.js';
import { StreamClosingSessionStore } from '../../src/presentation/web/stream-closing-sessions.js';
import type { FixedClock } from './fixed-clock.js';
import { ManualScheduler } from './manual-scheduler.js';
import { MemoryProviderKeyRepository } from '../../src/infrastructure/db/memory-provider-key-repository.js';
import { AesGcmSecretBox } from '../../src/infrastructure/security/aes-gcm-secret-box.js';
import { FakeHostResolver } from './fake-host-resolver.js';
import { fixtureSecret } from './provider-key-fixtures.js';
import { MemoryAccountUsage } from '../../src/infrastructure/db/memory-account-usage.js';
import { MemoryCostTotals } from '../../src/infrastructure/db/memory-cost-totals.js';
import { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import { MemorySessionStore } from '../../src/infrastructure/db/memory-session-store.js';
import { MemoryUserRepository } from '../../src/infrastructure/db/memory-user-repository.js';
import { MemorySnapshotCache } from './memory-snapshot-cache.js';
import { MemoryWorkspaceFolders } from './memory-workspace-folders.js';
import { recordRoutes, type RouteRecorder } from './route-recorder.js';
import {
  runOutputs,
  type RunOutputDoubles,
  type RunOutputGiven,
  type RunOutputs,
} from './web-run-services.js';

// Parts of the test server (web-server.ts) that are only wiring.

/** RF-1012: the run and project folders the deletions measure and remove, and the snapshot cache. */
export interface HistoryDoubles {
  readonly folders: MemoryWorkspaceFolders;
  readonly snapshots: MemorySnapshotCache;
}

/** The memory stores every test server starts with. */
export function memoryStores(): HistoryDoubles & {
  users: MemoryUserRepository;
  sessions: MemorySessionStore;
  usage: MemoryAccountUsage;
  projects: MemoryProjectRepository;
  costs: MemoryCostTotals;
} {
  return {
    users: new MemoryUserRepository(),
    sessions: new MemorySessionStore(),
    usage: new MemoryAccountUsage(),
    projects: new MemoryProjectRepository(),
    costs: new MemoryCostTotals(),
    folders: new MemoryWorkspaceFolders(),
    snapshots: new MemorySnapshotCache(),
  };
}

/** The run outputs (given or memory doubles) and the record of the routes the server registers. */
export function outputsAndRoutes(given: RunOutputGiven): {
  outputs: RunOutputs;
  recorder: RouteRecorder;
  doubles: RunOutputDoubles & { routes: () => readonly string[] };
} {
  const recorder = recordRoutes();
  const { outputs, doubles } = runOutputs(given);
  return { outputs, recorder, doubles: { ...doubles, routes: () => recorder.rows() } };
}

/**
 * The keep-alive scheduler, the open streams and the clock of the run routes, and the session store
 * the use cases are given: it ends the open streams of a session that ends (RF-1101).
 */
export function streamRoute(
  clock: FixedClock,
  sessions: SessionStore,
): {
  route: { heartbeat: ManualScheduler; streams: StreamRegistry; clock: FixedClock };
  endingSessions: SessionStore;
} {
  const streams = new StreamRegistry();
  return {
    route: { heartbeat: new ManualScheduler(() => undefined), streams, clock },
    endingSessions: new StreamClosingSessionStore(sessions, streams),
  };
}

export interface KeyParts {
  readonly keys: MemoryProviderKeyRepository;
  readonly secretBox: AesGcmSecretBox;
  readonly resolver: FakeHostResolver;
}

/** RF-1104: the key store, its sealing box and the DNS stand-in of the base-URL check. */
export function keyParts(): KeyParts {
  return {
    keys: new MemoryProviderKeyRepository(),
    secretBox: new AesGcmSecretBox({ current: fixtureSecret(1) }),
    resolver: new FakeHostResolver(),
  };
}
