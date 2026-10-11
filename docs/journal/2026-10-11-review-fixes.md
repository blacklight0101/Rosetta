---
type: journal
date: 2026-10-11
decisions: DEC-102..DEC-112
---

# 2026-10-11 - Build plan review fixes

## What happened

After the build plan was merged and one issue per card was created, a light review of the whole documentation set
ran with three slice reviewers (product, technical, delivery). Its high findings were checked by hand and all held.
The owner answered the eleven questions with every default; the answers are DEC-102..DEC-112.

## What was decided and why

- **Sizes and dates (DEC-102).** Card sizes are agent working time, not developer days, so the 2026-10-20 hosted date
  and the 2026-10-26 hand-in stand. The hosted deployment carries whatever has merged by then and is redeployed as
  cards land.
- **Model verifier (DEC-103).** The second verifier step stays in P2; the milestone labels a claim whose citation
  holds as "awaiting model verification", which is honest about what M1 checks.
- **Hosted deployment (DEC-104).** The single hosted card waited on the owner half way, so it is split: P1-48 writes
  the host-choice ADR (`needs-owner`), the owner creates the account and stores the secrets (new gate G-07), and P1-55
  does the release workflow, deployment, runbook, ZAP scan and smoke test. Before v0.1.0 the host runs the
  `sha-<short>` image of `main`.
- **Demo run (DEC-105).** The owner makes the demo run on the hosted URL under a 2 USD cap; the orchestrator only
  copies its masked output into a `needs-owner` pull request, so no agent spends server keys.
- **Default models (DEC-106).** A server setting `defaultRoles` holds the models for new projects; P1-26 records the
  cheapest current OpenAI tool-calling model as the hosted recommendation.
- **Caps (DEC-107).** Server keys: the lower run cap, user-day and server-month caps, shipped prices. Own keys: the run
  cap and an optional own daily cap, with price overrides. UTC periods.
- **Estimate warning (DEC-108).** An estimate above the remaining cap warns but does not block Start; the budget guard
  still stops at the cap.
- **Ignore rules (DEC-109).** The project setting and the repository's `.rosettaignore` are joined; the file can only
  add exclusions.
- **Audit retention (DEC-110).** Audit events and the cost ledger are kept for the life of the deployment.
- **Owner checks and usage (DEC-111).** Checks only the owner can make are listed as pending and do not block merges;
  the 5-hour usage is read from the session tool, a scheduled check or the owner.
- **Technical bundle (DEC-112).** Ollama URL only from the environment; base URLs checked on save and on connect; CSRF
  cookie mode and an `Origin` check on sign-in; HKDF-derived key; scrypt limits; a `Scheduler` port; an error-code
  registry; a `web` Vitest project; a SQL lint rule; roles created outside migrations; a `test` image stage; the
  report as escaped static HTML; cost reservations; the zip export as its own card P1-56; dependency fixes.

## Process changes

- Task branches no longer edit `tasks.md` or `handoff.md`; status lines reach `main` through `docs/build-status` pull
  requests after merges, so three cards in flight do not conflict.
- P1-01 has a merge exception because CI does not exist before it.
- Builders never edit decision documents; they report spec gaps as open questions.

## Open after this session

- The owner merges the `needs-owner` pull request; the orchestrator then creates the issues for P1-55 and P1-56 and
  updates the changed issue bodies.
- G-01 review on 2026-10-13.
