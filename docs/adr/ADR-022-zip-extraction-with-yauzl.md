# ADR-022: Read uploaded zip archives with `yauzl`

**Date**: 2026-10-19
**Status**: Proposed
**Deciders**: BlackLigth (blacklight0101)

## Context

DEC-148 adds a zip file as the second source of a project (RFC-004, RF-128..RF-134). GitHub snapshots arrive as
`.tar.gz` and are extracted with `tar` (ADR-019); nothing in the project reads zip archives today (the zip export,
RF-512, writes them with `yazl`). A zip uploaded by a user is untrusted input (ADR-013) and must pass the limits of
RF-127 and RF-129: entry count, total size, compression ratio, unsafe paths, links, encrypted entries. A new runtime
dependency needs an ADR (`docs/environments-and-delivery.md` section 7) and a version at least two weeks old
(DEC-125).

## Options Considered

1. **`yauzl` 3.4.0** (MIT, one dependency `pend`, released 2026-06-07): the reading companion of `yazl`; reads the
   central directory first, streams each entry, exposes the declared sizes, compression method, encryption flag and
   external attributes, and validates entry names; widely used and maintained by the author of `yazl`.
2. **`unzipper`**: streams from the local headers, which can disagree with the central directory; more dependencies.
3. **`adm-zip`**: reads the whole archive into memory; unsuited to a 500 MB limit.
4. **A zip reader of Rosetta's own** on `node:zlib`: no dependency, but the zip format has many edge cases
   (ZIP64, data descriptors, encodings) that a small reader would get wrong.
5. **Accept `.tar.gz` uploads only**, reusing `tar`: no dependency, but Windows users make zips, not tarballs.

## Decision

Use `yauzl` 3.4.0, pinned exactly, only inside `src/infrastructure/` behind the extraction port that the tarball
extractor also implements. Open archives with `lazyEntries` and `validateEntrySizes`; check the central directory
totals against the limits before writing anything; refuse encrypted entries and methods other than stored and
deflate; apply Rosetta's own path, link, device-name and ratio checks on top of `yauzl`'s name validation; count
written bytes and stop at the limit whatever the headers declare.

## Rationale

`yauzl` reads the central directory, which is the authoritative list of entries, so a crafted local header cannot
smuggle entries past the count and size checks. It streams, so memory stays flat at the 500 MB limit. Its companion
`yazl` is already trusted for the export, so the same author and coding style are audited once.

## Consequences

- One more runtime dependency (and `pend`) in the baseline list, watched by Dependabot under DEC-125.
- The extraction guards exist twice, for tar and zip, behind one port; the shared checks (paths, device names,
  deny list, counting) live in one module both use.
- ZIP64 archives work; split or spanned archives are refused.

## References

- RFC-004, DEC-148, RF-127, RF-129, ADR-013, ADR-019.

## Notes
