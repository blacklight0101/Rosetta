import { posix } from 'node:path';
import type { ZipFile } from 'yauzl';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import { LimitCounter } from '../entry-guards.js';
import type { PlannedFile } from '../zip-entry-plan.js';
import { zipNotReadable, zipTooLarge } from '../zip-errors.js';
import { workbookNotReadable, workbookTooLarge } from './workbook-errors.js';
import type { WorkbookLimits } from './workbook-limits.js';
import { XmlFeeder, type Attributes, type XmlVisitor } from './xml-stream.js';

// RF-151, RF-129, ADR-022, ADR-023: the parts of one package, streamed from `yauzl` into a
// visitor. Nothing is written to disk. The entries were judged first by the zip guards; here each
// part is also counted while it inflates, so a header that lies about a size is stopped where the
// real size passes a limit.

export interface Relationship {
  readonly id: string;
  /** The last segment of the relationship type, for example `worksheet` or `comments`. */
  readonly type: string;
  /** The part the relationship points at, from the package root; the raw target when external. */
  readonly target: string;
  readonly external: boolean;
}

/** The package part a relative `target` names, as seen from the part `owner`. */
function resolveTarget(owner: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  return posix.normalize(posix.join(posix.dirname(owner), target));
}

function relationshipPartOf(owner: string): string {
  return `${posix.dirname(owner)}/_rels/${posix.basename(owner)}.rels`;
}

class RelationshipsReader implements XmlVisitor {
  readonly relationships: Relationship[] = [];
  private readonly owner: string;

  constructor(owner: string) {
    this.owner = owner;
  }

  open(name: string, attributes: Attributes): void {
    const id = attributes['Id'];
    const target = attributes['Target'];
    if (name !== 'Relationship' || id === undefined || target === undefined) return;
    const external = attributes['TargetMode'] === 'External';
    this.relationships.push({
      id,
      type: (attributes['Type'] ?? '').split('/').pop() ?? '',
      target: external ? target : resolveTarget(this.owner, target),
      external,
    });
  }
}

export interface PackageSettings {
  readonly limits: WorkbookLimits;
  readonly signal: AbortSignal;
}

export class WorkbookPackage {
  private readonly zip: ZipFile;
  private readonly parts = new Map<string, PlannedFile>();
  private readonly settings: PackageSettings;
  private readonly inflated: LimitCounter;

  constructor(zip: ZipFile, files: readonly PlannedFile[], settings: PackageSettings) {
    this.zip = zip;
    this.settings = settings;
    this.inflated = new LimitCounter(settings.limits.zip.maxBytes);
    for (const file of files) this.parts.set(file.segments.join('/').toLowerCase(), file);
  }

  /** The part names are not case sensitive in a package, so a lookup ignores case. */
  has(part: string): boolean {
    return this.parts.has(part.toLowerCase());
  }

  /** The relationships of `owner`, in file order; none when the owner has no relationships part. */
  async relationships(owner: string): Promise<Relationship[]> {
    const part = relationshipPartOf(owner);
    if (!this.has(part)) return [];
    const reader = new RelationshipsReader(owner);
    await this.stream(part, reader);
    return reader.relationships;
  }

  /** Streams `part` into `visitor`, counting its bytes against the limits as it inflates. */
  async stream(part: string, visitor: XmlVisitor): Promise<void> {
    const planned = this.parts.get(part.toLowerCase());
    if (planned === undefined) throw workbookNotReadable(part, 'the part is missing');
    try {
      const bytes = await this.feed(planned, part, visitor);
      if (bytes !== planned.entry.uncompressedSize) {
        throw zipNotReadable('an entry is not the size its header declares');
      }
    } catch (error) {
      if (error instanceof RosettaError || this.settings.signal.aborted) throw error;
      throw workbookNotReadable(part, 'the data could not be read', error);
    }
  }

  /** The inflated bytes of a binary part (`xl/vbaProject.bin`), counted against the limits as they inflate. */
  async readBytes(part: string, maxBytes: number): Promise<Buffer> {
    const planned = this.parts.get(part.toLowerCase());
    if (planned === undefined) throw workbookNotReadable(part, 'the part is missing');
    const chunks: Buffer[] = [];
    let bytes = 0;
    try {
      for await (const chunk of await this.zip.openReadStreamPromise(planned.entry)) {
        if (!Buffer.isBuffer(chunk)) throw workbookNotReadable(part, 'the data is not bytes');
        this.settings.signal.throwIfAborted();
        bytes += chunk.length;
        if (bytes > maxBytes) throw workbookTooLarge('bytes in a macro project', maxBytes);
        if (!this.inflated.add(chunk.length)) throw zipTooLarge(this.settings.limits.zip.maxBytes);
        chunks.push(chunk);
      }
      if (bytes !== planned.entry.uncompressedSize) {
        throw zipNotReadable('an entry is not the size its header declares');
      }
    } catch (error) {
      if (error instanceof RosettaError || this.settings.signal.aborted) throw error;
      throw workbookNotReadable(part, 'the data could not be read', error);
    }
    return Buffer.concat(chunks);
  }

  private async feed(planned: PlannedFile, part: string, visitor: XmlVisitor): Promise<number> {
    const { maxPartBytes, zip } = this.settings.limits;
    const feeder = new XmlFeeder(part, visitor);
    const decoder = new TextDecoder();
    let bytes = 0;
    for await (const chunk of await this.zip.openReadStreamPromise(planned.entry)) {
      if (!Buffer.isBuffer(chunk)) throw workbookNotReadable(part, 'the data is not bytes');
      this.settings.signal.throwIfAborted();
      bytes += chunk.length;
      if (bytes > maxPartBytes) throw workbookTooLarge('bytes in one XML part', maxPartBytes);
      if (!this.inflated.add(chunk.length)) throw zipTooLarge(zip.maxBytes);
      feeder.write(decoder.decode(chunk, { stream: true }));
    }
    feeder.write(decoder.decode());
    feeder.end();
    return bytes;
  }
}
