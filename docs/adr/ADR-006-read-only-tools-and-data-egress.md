# ADR-006: Keep agents read-only and guard everything that leaves the machine

**Date**: 2026-10-09
**Status**: Accepted
**Deciders**: BlackLigth (blacklight0101)

## Context

Developers will point Rosetta at private code. Configuration files in legacy systems often hold connection strings
and passwords. Cloud providers receive whatever is sent. The owner decided that only requested files may leave the
machine, secrets are masked, cloud use is confirmed, and the analysed repository is never modified (DEC-16, DEC-17).

## Options Considered

1. Read-only tools only, an output folder outside the legacy repository, and an egress guard through which every
   provider call passes: `.rosettaignore` filter, secret masking that keeps line numbers, an egress log, a cloud
   warning and a maximum excerpt size.
2. Send whole files or the whole repository up front, relying on the provider's privacy terms.
3. Allow agents to write notes or patches inside the repository.
4. Do nothing: no filtering.

## Decision

We choose option 1. The agent tool set has no write tool. The file-system adapter refuses writes outside the output
folder, and configuration refuses an output folder inside the legacy repository (RF-002, RF-005). Every model call
passes the egress guard, which applies `.rosettaignore` (RF-140), masks secrets as `[MASKED:<kind>]` without changing
line numbers (RF-141), logs what was sent where (RF-142), requires confirmation before a cloud run (RF-143) and caps
excerpt size (RF-144).

## Rationale

- Least privilege: an agent that cannot write cannot damage the repository, whatever a prompt says.
- Masking at the boundary protects secrets regardless of provider, and keeping line numbers keeps citations valid.
- The egress log makes a run auditable, which matters for companies (RNF-004) and for the master's ethics module.
- Option 2 sends far more than needed and leaks secrets; option 3 risks the user's code; option 4 contradicts
  DEC-16.

## Consequences

**Positive**
- A clear privacy story: what leaves the machine is minimal, masked and recorded.
- Local-only runs with Ollama keep everything on the machine (RNF-011).

**Negative**
- Secret patterns are heuristics: false negatives are possible, so the cloud warning and `.rosettaignore` stay
  necessary.
- Masking can hide a value an agent needed to understand a rule (for example a feature flag that looks like a key).
- Every new tool must be reviewed as read-only and routed through the guard.

## References

- DEC-03, DEC-16, DEC-17.
- RF-002, RF-005, RF-140..RF-144, RF-201; RNF-003, RNF-004, RNF-011.
- ADR-003.
