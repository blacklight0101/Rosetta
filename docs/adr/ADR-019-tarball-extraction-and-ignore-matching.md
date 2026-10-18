# ADR-019: Extract snapshots with `tar` and match ignore rules with `ignore`

**Date**: 2026-10-11
**Status**: Accepted (2026-10-11, DEC-113)
**Deciders**: BlackLigth (blacklight0101)

## Context

ADR-012 downloads a commit snapshot as a GitHub tarball (`.tar.gz`) and RF-140 reads ignore rules in gitignore
syntax. Node.js 24 has gzip (`node:zlib`) but no tar reader and no gitignore matcher, and neither package is in the
baseline of environments-and-delivery.md section 7. Both sit on a trust boundary: the archive comes from an
untrusted repository (path traversal, links, huge entry counts; RF-122, RF-127) and the ignore rules decide what may
leave the machine (RF-140, RF-147). The build plan found the gap while cutting the snapshot and repository-reader
cards; a builder must not pick a package on its own.

## Options Considered

1. Do nothing: no snapshot extraction and no ignore file. Not possible; RF-122 and RF-140 are Must.
2. `tar` 7.5 (node-tar, the extractor npm itself uses) with its entry filter, and `ignore` 7.0 (a gitignore matcher
   that follows the gitignore specification and is used by ESLint and Prettier).
3. Hand-written tar reader on `node:zlib` and a hand-written gitignore matcher.
4. Download the zipball instead and extract it with `yauzl`.

## Decision

We choose option 2. `tar` and `ignore` are runtime dependencies used only in `src/infrastructure/github/` and
`src/infrastructure/files/` respectively (dependency-cruiser rule). Extraction is streamed through `tar.x` with a
`filter` that rejects absolute paths, `..` segments, symbolic and hard links, and counts entries and bytes against the
RF-127 limits; every resolved path is still checked to lie inside the snapshot folder after extraction, so safety does
not rest on the package alone.

## Rationale

- Tar parsing has a long history of traversal and link bugs; node-tar has been hardened against them for years and
  is maintained by the npm author. A hand-written reader would repeat those bugs.
- The gitignore syntax (negation, anchoring, directory-only patterns, `**`) is easy to get subtly wrong, and a wrong
  match sends a file a user meant to exclude. `ignore` implements the specification and is widely used.
- The zipball needs a third package (`yauzl`) and changes ADR-012 for no gain.

## Consequences

**Positive**

- Two small, widely used packages instead of two hand-written security-sensitive parsers.

**Negative**

- Two more runtime dependencies to keep updated (Dependabot covers them); the extraction filter and the post-check
  must both be tested with hostile fixture archives.

## References

- RF-122, RF-127, RF-140, RF-147; ADR-006, ADR-012, ADR-013; environments-and-delivery.md section 7.
- Versions checked on the npm registry on 2026-10-11: `tar` 7.5.22, `ignore` 7.0.12.
