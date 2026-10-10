# ADR-013: Treat analysed code and model output as untrusted input

**Date**: 2026-10-11
**Status**: Accepted
**Deciders**: BlackLigth (blacklight0101)

## Context

Rosetta reads code written by strangers (any public GitHub repository, DEC-48), passes excerpts of it to language
models, and shows what the models write in a local web page and a published report (ADR-012). Each step crosses a
trust boundary: the repository can contain text written to manipulate the agents (indirect prompt injection, OWASP
LLM01), archives can be hostile (path traversal, symbolic links, size bombs), model output can carry markup that
runs in a browser (OWASP LLM05, A03), and a model-chosen regular expression can block the process. ADR-005 already
makes evidence checkable and ADR-006 limits what leaves the machine; neither says how the agents and the pages must
treat the content itself. The master's Module 08 (secure development) asks for threat modelling, security by design
and by default, and logging of security events.

## Options Considered

1. Treat both the analysed code and everything a model writes as untrusted data at every boundary, with a written
   threat model, fixed defaults and tests that attack each control.
2. Rely on the existing controls (read-only tools, egress guard, citation check) and fix issues as they appear.
3. Sanitise model output with an HTML sanitiser library and allow rich Markdown in cards.

## Decision

We choose option 1.

- **Prompt boundary**: tool results reach the model only inside delimited blocks labelled as file content, never
  in the system prompt; every prompt states that text inside those blocks is data, not instructions (RF-145).
- **Output boundary**: card text and code are rendered as text, never as HTML; Markdown is rendered with raw HTML
  off; only `https://github.com/` links survive (RF-507). The local page and the report carry a content security
  policy and no referrer (RF-1013).
- **Input boundary**: downloads are https only, from GitHub hosts only (redirects included), with size and entry
  limits; symbolic and hard links in archives are refused (RF-127); the `grep` tool limits pattern size and runs with
  a timeout (RF-146); a built-in deny list of secret files applies even without `.rosettaignore` (RF-147).
- **Failure mode**: every guard fails closed: a masking error blocks the call (RF-141), a refused request or read is
  logged as a security event (RF-009).
- **Evidence**: the threat model in [docs/security/threat-model.md](../security/threat-model.md) maps each boundary
  (STRIDE) to OWASP Top 10:2025 and the OWASP Top 10 for LLM applications, with the control and its requirement.
  Secure defaults are listed in RNF-014. Vulnerabilities are reported through `SECURITY.md`.

## Rationale

- Option 1 puts each control at the boundary where the risk enters and gives every control a test that attacks it,
  which the verifier can check per card.
- Option 2 leaves the most likely attack (a repository that talks to the agents) unaddressed until it happens in a
  published report.
- Option 3 adds a runtime dependency and a larger attack surface; plain text loses nothing that cards need.

## Consequences

**Positive**
- Known LLM and web risks are handled by design, and the threat model is reusable evidence for the master.
- Damage from a successful injection stays bounded: tools are read-only, the citation check is code, caps apply.

**Negative**
- More tests and fixtures (injection, XSS, symlink, oversized archive, slow regex) in P1.
- Cards cannot contain rich HTML; formatting is limited to plain Markdown.

## References

- DEC-57, DEC-58; RF-009, RF-127, RF-141, RF-145, RF-146, RF-147, RF-507, RF-1013; RNF-014.
- Refines ADR-005 (evidence), ADR-006 (read-only tools and egress), ADR-012 (web UI and GitHub sources).

## Notes

- 2026-10-11: DEC-69 adds the trust boundaries of a hosted application (browser to server over the internet,
  server to PostgreSQL, stored secrets) to the threat model; the controls are in ADR-015 and ADR-017. The decisions
  of this ADR are unchanged.
