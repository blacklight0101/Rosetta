import { err, type Result } from '../../../domain/errors/result.js';

export interface DirModule {
  readonly name: string;
  readonly streamName: string;
  readonly offset?: number;
  readonly standard: boolean;
}

export interface DirInfo {
  readonly codePage: number;
  readonly encoding: string;
  readonly projectName: string;
  readonly modules: readonly DirModule[];
}

export interface DirFailure {
  readonly reason: 'corrupt' | 'too-many';
  readonly detail: string;
}

export function parseDirStream(dir: Uint8Array, maxModules: number): Result<DirInfo, DirFailure> {
  return err({ reason: 'corrupt', detail: `pending ${String(dir.length)} ${String(maxModules)}` });
}
