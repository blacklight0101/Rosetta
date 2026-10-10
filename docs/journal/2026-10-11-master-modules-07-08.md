---
type: journal
date: 2026-10-11
decisions: DEC-57, DEC-58
---

# 2026-10-11 - Master modules 07 and 08 folded in

Curated summary of the working session (DEC-38). No conversation is recorded here.

The owner finished Modules 07 (infrastructure, cloud, LLMOps, multi-agent systems) and 08 (secure development) of the
master. Both were compared with Rosetta's documents to find what had not been taken into account.

| Topic | Outcome | Why | Ids |
|---|---|---|---|
| Untrusted input | Analysed code and model output are untrusted at every boundary; a threat model maps them to OWASP Top 10:2025 and the OWASP LLM Top 10 | Rosetta reads code written by strangers and shows what models write | ADR-013, DEC-57 |
| Prompt injection | Repository content reaches the agents only as labelled data; tested with a hostile fixture repository | The most likely real attack on Rosetta | RF-145 |
| Web and report safety | Text-only rendering, content security policy, no referrer, token out of the address bar | A hostile repository must not run code in the page or the report | RF-507, RF-1013 |
| Downloads and tools | https to GitHub only, size limits, links refused; bounded grep; built-in deny list; fail-closed masking; security events logged | Fail closed and log it | RF-127, RF-146, RF-147, RF-141, RF-009 |
| Secure by default and disclosure | Defaults table; `SECURITY.md`; private vulnerability reporting | Security by design and by default | RNF-014 |
| Supply chain and CI | SBOM on releases, dependency review, job timeouts, safe pull request titles, Pages smoke test | The CI defects the course found in its own workflows | DEC-57 |
| LLMOps | Multi-agent pattern named; verifier judge rules and calibration; exact model versions and prompt hashes; P50/P95 latency; OpenTelemetry GenAI field names; evaluations saved as experiments with repetitions | Measured, reproducible quality | RF-301, RF-305, RNF-004, RNF-015, RF-1011 |
| Not adopted | Agent frameworks, hosted tracing, vector stores, Docker in M1, hosted demos, Snyk, login and database topics | They conflict with earlier decisions or do not apply | DEC-58 |
