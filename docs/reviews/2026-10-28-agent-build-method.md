# Review - the build method the package gives an AI agent team

|                     |                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Card**            | P6-01 (RF-612, RF-635, RF-636, DEC-60, DEC-76, DEC-173)                                                                                                                                                                                                                                                                        |
| **Date**            | 2026-10-28                                                                                                                                                                                                                                                                                                                     |
| **Commit reviewed** | `develop` at `0ed86fca`                                                                                                                                                                                                                                                                                                        |
| **Reviewer**        | builder-sonnet (Claude), for the owner BlackLigth (blacklight0101)                                                                                                                                                                                                                                                             |
| **Inputs**          | the package writer (`src/infrastructure/handoff/`), the brief (`src/domain/planning/`, `web/src/`), RF-612, RF-635, RF-636, DEC-60, DEC-76, DEC-173, DEC-175 and ADR-025, `docs/orchestration/README.md` with `.claude/agents/`, and the project-blueprint skill, version 2 (updated 2026-10-26), used as the reference method |

Nothing in this review changes code or `docs/spec`. Requirement text below is a **proposal**; the owner merges the spec.
The skill is read as a method only: nothing that names the owner's employer or work projects was taken from it (DEC-03).

## 1. Summary

The package already carries a good part of the _rules_ of the method (principles, plan before building, guard tests,
review probes, risk class, behaviour to preserve, operations, metrics). What it lacks is the _structure_ that makes a
team of agents run itself: who orchestrates, who builds with which model, who verifies, how a card moves, when a
person must decide, and where to start. The owner's test of 2026-10-25 (a Sonnet run on a single-file app, 18 cards, no
agent method) has two causes, both confirmed in the code:

1. AI-assisted build is a single checkbox, off by default, and its help text says what is added but not what is lost
   (section 4).
2. Even when it is on, `AGENTS.md` holds rules and a tier table, not a method (section 3).

Besides those, five smaller findings that the owner did not ask about but that decide whether the method works:

- The largest model tier is never assigned to a card (section 5).
- Cards name a tier ("middle model tier"), never a model, and the brief never asks which agent tool the team uses
  (section 5).
- No package check ties a card's model to its band and risk class (section 6).
- The risk class floor (RF-635) is lower than the reference method's for data loss and money (section 5).
- The package has no phase-closing evidence card (verification matrix) and no mention of the develop and staging flow
  of DEC-175 (sections 8 and 9).

Proposed: five new requirements (RF-639..RF-643), changes to RF-612, RF-635 and RF-636, and eleven cards P6-02..P6-12
(section 10, section 11).

## 2. What an agent sees first

**Finding F-1 (High).** An agent given the package folder cannot tell how to proceed without a person explaining it.

- The first file is `README.md` with a numbered reading order. `AGENTS.md` is its **last** entry, and only when AI-assisted
  build is on (`src/infrastructure/handoff/handoff-list-markdown.ts:202`). The reading order begins with the product
  documents (`handoff-links.ts:49-56`, the document set), so an agent that opens `README.md` first reads product text
  before it learns it is an agent.
- `AGENTS.md` itself opens with "Instructions for the AI agents (and the people)" and points back to the README reading
  order (`handoff-method-markdown.ts:94`). There is no ordered "start here", no command table (install, build, test,
  verify), no statement of which file wins when two disagree, no resume point.
- `tasks.md` lists cards with a difficulty line and a risk class (`handoff-task-markdown.ts:46-51`,
  `handoff-quality-markdown.ts:14`), but nothing says who takes a card, what status it has, or what "done" means beyond
  the card's own acceptance criteria.
- With AI-assisted build off, none of this exists, and the package says nothing about it (section 4).

Compared with the reference method: its `AGENTS.md` template is a short tool-neutral index (under about 60 lines) whose
first block is "Start here" - handoff, rules, protocol, the card you were given - followed by a command table, the five
to eight rules broken most often and the layout. The orchestration protocol (`docs/orchestration/README.md`) is the
second file an agent reads. Rosetta's own `AGENTS.md` follows the same shape (`AGENTS.md:1-9`).

## 3. What `AGENTS.md` holds today, against the method

`agentsMarkdown` writes these sections in this order (`handoff-method-markdown.ts:89-133`): chosen principles as rules
(:96), architecture and migration (:105), technology (:110), plan before building (:115), task cards and difficulty with
a tier table (:119-123), then the quality rules (guard tests, review probes, risk class - `handoff-quality-markdown.ts`),
behaviour to preserve, operations (RF-636), build metrics, and human review (:129).

| Element of the method (reference v2 and this repository)                                | In the package today                                                                                                  | Gap    |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------ |
| Start-here order, commands, rules broken most often                                     | no start-here; no commands; rules come only from the chosen principles                                                | yes    |
| Orchestrator role (runs as the main session, never a subagent; ready set; stops)        | absent                                                                                                                | yes    |
| Builder per band, with its own short hard-rule list                                     | a three-row tier table (`handoff-method-markdown.ts:75-80`); no builder instructions                                  | yes    |
| Independent verifier per band (sonnet 1-8, opus 9-10); never verifies its own work      | absent. "A person reviews every pull request" (:131) is the only review                                               | yes    |
| Retry ladder (FAIL 1 same builder, FAIL 2 fresh builder one band up, FAIL 3 owner)      | absent                                                                                                                | yes    |
| Card status flow (`Todo` .. `Done`, `Blocked (reason)`)                                 | absent                                                                                                                | yes    |
| Merge rules (CI green, verifier PASS, up to date, `needs-owner`, squash)                | partly: operations rule one PR at a time and up to date (RF-636, `handoff-parallel-markdown.ts:59`); no `needs-owner` | yes    |
| Report format (builder) and verdict format (verifier)                                   | absent                                                                                                                | yes    |
| Red test first (test commit before code)                                                | only if the `tdd` principle was chosen (`handoff-task-markdown.ts:65`); not stated as a rule of the method            | yes    |
| Human gates and who opens them                                                          | absent. Gates exist in this repository (`docs/orchestration/README.md` section 7) but not in the package              | yes    |
| Usage throttle (5-hour window bands, one agent at a time)                               | absent                                                                                                                | yes    |
| Escalation and stop conditions (contradiction between documents, hard-rule conflict)    | "If the card and the requirements disagree, stop and ask" (:117) covers one of them                                   | partly |
| Hard-rule greps for the verifier                                                        | absent                                                                                                                | yes    |
| Size budgets for living files (`AGENTS.md` under about 60 lines, `CLAUDE.md` about 150) | the file is written without a budget                                                                                  | yes    |
| Guard tests, probes, behaviour to preserve, risk class, operations, metrics             | present (RF-630..RF-638)                                                                                              | no     |

**Finding F-2 (High).** The package states the _rules_ of the method but not its _roles and flow_. A team following only
`AGENTS.md` has builders with no orchestrator and no verifier; the reference method treats the independent verifier and
the gates as the main source of quality, because a model that writes the code also mirrors its own misunderstanding in
the tests.

**Finding F-3 (Medium).** If every item above went into `AGENTS.md`, the file would pass the reference's size budget by
a wide margin. The method fits better in two files: a short `AGENTS.md` (start-here index, commands, top rules) and an
`orchestration.md` protocol (roles, bands, status flow, merge rules, gates, throttle, formats). Section 7 proposes this.

## 4. Should Plan setup ask plainly, or default the method on?

Today (evidence):

- The question is one checkbox, "The team builds the new system with AI agents (AI-assisted build)", default off
  (`web/src/pages/PlanMethodStep.tsx:14-22`, default text "Default: without AI-assisted build", `steps.ts:90-91`).
- An unanswered question is stored as `{ aiAssisted: false }` and listed as defaulted (`planning-brief.ts:189`, `:205`;
  `brief-questions.ts:90-94`: "No; the package has no AI-assisted build method.").
- The help text lists what is added ("AGENTS.md, task cards rated by difficulty and a human review") and nothing about
  what the package leaves out when it stays off. The model is told about it (`plan-message.ts:77`), but the user is not.
- The brief has no field for the agent tool or the models (`planning-brief-schema.ts:58`:
  `buildMethod: { aiAssisted: boolean }`).

**Finding F-4 (High).** The default is off, and the person who does not tick the box gets a package that looks complete.
The defaulted-questions list says "no AI-assisted build method", but that list sits at the end of the package, not where
the choice is made. The Sonnet test of 2026-10-25 is exactly this path.

Options:

| Option | What it means                                                                                       | Cost                                                 |
| ------ | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| A      | keep the checkbox, default off, add a plain sentence of what is left out                            | lowest; still silent for people who skip the step    |
| B      | ask as a required two-way question ("Agents will build" / "People will build"), no default          | one more required click; no accidental path          |
| C      | default **on** when the brief names an agent tool in the project context, otherwise ask plainly (B) | needs the context field; wrong guess is easy to undo |

**Recommendation (default of the proposal): B, with C as the shortcut.** The step is a required two-way choice. It
shows, next to each answer, what the package contains and what it leaves out. When the project context already names an
agent tool (Claude Code, Codex, Copilot agent and similar), the step opens with "Agents will build" selected and says why.
When the answer is "People will build", the package says so in its README, and lists in `open-questions.md` that the
agent files can be added later by answering the question again (RF-637 applies to the build method as a whole-build
question, so no single card waits on it).

Wording of the plain sentence (proposal): "With agents: the package adds a start-here file for agents, a build protocol
(roles, model per difficulty, verifier, merge rules, gates), agent definitions for your tool and the model to use on
every task card. Without: task cards carry no difficulty or model, and there is no protocol for agents."

**Open questions** (defaults in brackets): Q-A. Is the question required (no default) or defaulted on? [required, with
the context shortcut.] Q-B. Does a returning user's saved brief keep its answer? [yes; a brief saved before this change
stays "People will build" with the tool unanswered, and the page invites to answer again.]

## 5. Asking the agent tool and models; bands mapped to models

Today's mapping lives in the domain and is tool-neutral by design:

- `difficultyBands` gives three tiers named `smallest`, `middle`, `largest` (`src/domain/planning/task-method.ts:51-55`).
- A card's difficulty comes **only from its size**: S is 4, M is 6, L is 8 (`task-method.ts:57`, `:69-72`). So a card
  never rates 9 or 10.
- The risk class raises `smallest` to `middle`, never higher (`task-method.ts:79`).
- A card shows `Difficulty: 6 (middle model tier)` and `Risk class: none` (`handoff-task-markdown.ts:51`,
  `handoff-quality-markdown.ts:14`).

**Finding F-5 (High).** No card in any package can ever name the largest tier. The bands are written in the AGENTS.md
table (:121-123) but the derivation (:57) stops at 8, and the risk floor only raises from the smallest. The package
therefore tells a team to keep an opus-class model for difficulty 9 and 10 and never produces such a card; every
security or data card runs at the middle tier at best. This also explains why the 2026-10-25 run lacked the method
altogether: the derived rating carries no judgement beyond size.

**Finding F-6 (Medium).** The reference method rates by the cost of a mistake, not only by size: a mistake that leaks a
secret, grants access wrongly, loses or corrupts data, doubles an external side effect or needs a manual production fix
is the top band; a card on a security or privacy boundary is at least middle with the strongest verifier. RF-635 sets the
floor at the middle tier for _every_ non-`none` class and does not distinguish `money` and `data loss`.

**Finding F-7 (Medium).** The brief cannot say which agent tool the team uses or which models it has. The package says
"middle model tier"; a Codex team and a Claude Code team must translate by hand. The reference maps bands to model
aliases and says: when models change, change only the `model:` lines and the band table.

Proposal (new RF-639, section 10):

- Plan setup, build method step, after "Agents will build": **Which agent tool does the team build with?** Claude Code,
  Codex, or another tool (free text). **Which models does it have?** One model name per tier (smallest, middle,
  largest) and, optionally, an escalation model that is used only with the owner's approval in chat.
- Defaults (every question has one): for Claude Code the aliases `haiku`, `sonnet`, `opus`, escalation `fable` only with
  the owner's approval (the reference's fable rule). For Codex and "another", **no default model names** (names change
  too fast to ship); the question is required and the examples are placeholders such as "the cheapest, the middle and
  the strongest model of your plan". A missing model name leaves the tier unnamed and the package check (section 6) lists
  the card.
- The bands stay 1-5 smallest, 6-8 middle, 9-10 largest. The package prints the map once (in `orchestration.md`) and each
  card line becomes `Difficulty: 6 (middle tier, model: sonnet)`.
- The derivation changes so the largest tier is reachable (open question Q-C): size gives 4, 6, 8 as today; a risk class
  of `security boundary`, `data loss` or `money` rates the card 9 when its size is M or L and keeps 8 when S [default:
  `security boundary` and `data loss` and `money` all raise an M or L card to the largest tier; an S card to the middle
  tier]. Alternative: keep the floor at the middle tier as RF-635 says today and let the planner mark a card 9-10 with a
  reason. The default follows the reference's cost-of-a-mistake test and costs more; the owner chooses (Q-C).
- The verifier tier: the same table gives the verifier of each band (middle for 1-8, largest for 9-10) and the rule that
  a model never verifies its work at a lower tier. The retry ladder (FAIL 2 goes one band up, never down) is printed
  with the map.

## 6. A package check: model exists, matches band and risk class

Today `checks.md` has coverage checks (every feature built by at least one card, `handoff-checks-markdown.ts:37`) and
truthfulness checks (`handoff-truthful-checks-markdown.ts`). No check reads a card's difficulty, tier or risk class
(search of both files for "tier", "difficulty", "model": no match). RF-635 has a structure test only.

**Finding F-8 (Medium).** Nothing stops a package from naming a model the team does not have, or from giving a
`data loss` card the smallest tier. Because the tier comes from a table in code (not from the planner), today it cannot
happen by construction for the tier. Once a tool and models exist (RF-639) and the planner or the owner can edit a card's
model, it can.

Proposal (new RF-641): the package writes a check section for the build method in `checks.md`, when AI-assisted build is
on. For every task card:

1. the card names a model; the model is one of the tool's models in the brief (or the escalation model with the
   owner-approval note);
2. the model's tier is the tier of the card's band, or higher, never lower;
3. a card with a risk class other than `none` has at least the middle tier (RF-635), and the strongest verifier;
4. the verifier named for the card is not of a lower tier than the builder;
5. the card shows its risk class next to the difficulty.

A failed check is listed as a finding in `checks.md` with the card id, never silently corrected (the same rule the
other checks follow). Open question Q-D: does a failed check block the package or only list it? [list it, as the other
checks do; the package is still written.]

## 7. Agent definitions per tool and a start-here section (DEC-60)

DEC-60 puts the Claude Code **plugin** run mode (RF-700..RF-799) out of scope until reviewed; the package stays usable
without any tool. Agent definition _files_ are not a plugin: they are plain Markdown that a person copies into a
repository.

Reference shapes:

- Claude Code: `.claude/agents/<role>.md` with `name`, `description`, `model` (and `tools` for verifiers) and the body.
  The reference has seven files: `orchestrator`, `builder-haiku`, `builder-sonnet`, `builder-opus`, `builder-fable`,
  `verifier`, `verifier-opus`. This repository's `.claude/agents/` is the worked example.
- Codex and other tools that read `AGENTS.md`: the roles are sections of `AGENTS.md` or linked files; there is no model
  frontmatter.

**Finding F-9 (Medium).** The package has no place for an agent definition, so even a Claude Code team must write
seven files by hand to match the tier table. The orchestrator file is the most delicate one, because the reference warns
that the orchestrator must run as the main session, never as a subagent (subagents cannot spawn builders).

Proposal (new RF-640 and RF-642, section 10):

- `AGENTS.md` becomes the short start-here index (under about 60 lines): read-first order (handoff, rules, protocol, your
  card), a command table, the five to eight rules broken most often, a layout table. It is first in the README reading
  order when the method is on.
- A new `orchestration.md` holds the protocol: roles, band table with models, retry ladder, card status flow, merge rules,
  gates, usage throttle, escalation, report and verdict formats, size budgets. The README links it second.
- A new folder `agents/` in the package holds one file per role, written for the chosen tool:
  - Claude Code: files named as the tool expects (`orchestrator.md`, `builder-<tier>.md`, `verifier.md`,
    `verifier-largest.md`), each with the `model:` of its tier from the brief, plus a one-line instruction that says to
    copy the folder to `.claude/agents/`. Fable is written only when the brief names an escalation model, and says "only
    with the owner's approval in chat".
  - Codex and another tool: the same roles as plain Markdown prompts without frontmatter, with a short note on how to use
    them (paste as the task prompt, or reference from `AGENTS.md`).
- Usable without the tool: the protocol and the roles are described in prose in `orchestration.md`, so a person or an
  agent without definition support follows them the same way. Nothing in the package executes. No Claude Code plugin, no
  hook, no command (DEC-60 stays as it is).

Open question Q-E: ship definitions for "another" tool? [no; for "another" the package ships the prose protocol only,
and says so.]

## 8. Other v2 elements: what to carry and what to leave

| v2 element                                             | Rosetta has it                                                    | Proposal                                                                                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Difficulty bands 1-10, verifier per band, retry ladder | bands: yes (tiers); verifier and ladder: no                       | carry (RF-639, RF-640)                                                                                                       |
| Merge rules with `needs-owner`                         | one-at-a-time rule only (RF-636)                                  | carry into `orchestration.md`; `needs-owner` = a pull request that changes the spec, ADRs, decision log or agent rules       |
| Usage throttle                                         | no                                                                | carry as a short optional section; the percentages are the team's choice, so the package gives the default bands and says so |
| `AGENTS.md` index under about 60 lines                 | long rules file                                                   | carry (RF-640); size budget stated in the file                                                                               |
| Threat model                                           | `risks.md` and a TRD security section (`handoff-trd-security.ts`) | no new file; add a "security review" card to the plan for packages with a boundary (P6-10)                                   |
| Verification matrices (one per phase)                  | none; search of `src/domain/planning` for "matrix": no match      | carry as a phase-closing card (section 10, P6-10)                                                                            |
| Size budgets for living files                          | none                                                              | state them in `AGENTS.md` and `orchestration.md` (RF-640)                                                                    |
| Ownership table (one owning card per shared file)      | file lists and parallel groups (RF-634)                           | already covered; no change                                                                                                   |
| Docs consistency tests (counts)                        | the package has no counts to keep in sync                         | not needed                                                                                                                   |
| Local models as builders                               | not applicable                                                    | leave out; if the team lists a local model, the check warns that it is for scripted cards of difficulty 1-2 only (open Q-F)  |
| Employer and work projects named in the skill          | -                                                                 | **left out** (DEC-03): the review and the cards name none                                                                    |

## 9. DEC-175 and ADR-025 as a recommendation

Rosetta's newest practice: `develop` is the integration branch and the default; card branches are cut from it and merged
there by the orchestrator (squash, DEC-96); every push to `develop` deploys to staging and runs a smoke test; a release is
one pull request `develop` to `main`, labelled `needs-owner` and merged by the owner with a merge commit; production
deploys on a schedule, never on merge.

**Finding F-10 (Low).** The package says nothing about branches. A new team reading `AGENTS.md` has no integration branch,
no staging and no release gate.

Proposal (RF-643, optional): `orchestration.md` carries a short "Recommended delivery flow" section **when the brief says
the new system is deployed as a hosted app** (project context; default: not shown). It lists the branch roles, the
owner-merged release and the staging smoke test as a _recommendation_, with the reasons from ADR-025, and says the team
may choose another flow and record it as a decision. It does not state Rosetta's Azure details. The section is never a
requirement for the team's own repository and never blocks a card.

## 10. Proposed requirement changes (proposals; the owner merges the spec)

Numbering follows the next free ids of the RF-600..RF-699 range (RF-639..RF-643; none exists today).

### RF-612 (change) - Build method for an AI-assisted team

> Given the build method question is answered "Agents will build", when the package is written, then it contains
> `AGENTS.md` as a start-here index, `orchestration.md` with the build protocol, the agent definitions for the chosen
> tool (RF-642), task cards rated by difficulty with the model of their band (RF-639), and a human review on every pull
> request. Given the answer is "People will build", then the package contains none of these and its README says so in
> one sentence.

Change from today: the question is required rather than defaulted off (Q-A); `orchestration.md` and the definitions are
added; `AGENTS.md` shrinks to an index. Verification: structure test of the package, both answers.

### RF-635 (change) - Risk class per card

> Given a task card, when it is written, then it has a risk class next to its difficulty; a card with a risk class
> other than `none` is built by at least the middle tier and checked by the strongest verifier; a card whose risk class
> is `security boundary`, `data loss` or `money` and whose size is M or L is rated for the largest tier.

Open question Q-C (default as in section 5). Verification: structure test plus a unit test that a card of every class and
size gets the tier the table gives.

### RF-636 (change) - Agent operations

Keep the text; add to the operations section: a card whose pull request changes the spec, the ADRs, the decision log or
the agent files is labelled `needs-owner` and merged only by a person; a builder never edits the task list on a task
branch (the orchestrator records status in one batched pull request). Open question Q-G: is the second rule right for a
team without a status pull request? [state it as the default and say it may be replaced.]

### RF-639 (new) - Agent tool and models per difficulty band - R1 - Should - Source DEC-173

> Given "Agents will build", when Plan setup asks, then it asks the agent tool (Claude Code, Codex or another) and a model
> per tier, each with its default and its example; and when the package is written, then every task card shows the model
> of its tier next to its difficulty. Given the tool has no default models, then the question is required and a tier
> without a model name is listed in `checks.md`.

Verification: unit test of the brief schema, integration test of the card line, e2e test of the step.

### RF-640 (new) - Start-here index and build protocol - R1 - Should - Source DEC-173

> Given "Agents will build", when the package is written, then `AGENTS.md` has at most about 60 lines (start-here order,
> commands, top rules, layout) and is first in the README reading order, and `orchestration.md` contains: the roles
> (orchestrator, builder per tier, independent verifier per band), the band table with models, the retry ladder, the card
> status flow, the merge rules including `needs-owner`, the human gates, the usage throttle, escalation and stop
> conditions, the report and verdict formats, the red test first, and the size budgets of living files.

Verification: structure test of both files; the line budget is a test.

### RF-641 (new) - Package check of the model per card - R1 - Should - Source DEC-173, RF-635

> Given "Agents will build", when `checks.md` is written, then it lists a card whose model is not one of the chosen
> tool's models, whose tier is lower than its band, whose risk class other than `none` has a tier lower than the middle
> one, or whose verifier is of a lower tier than its builder.

Verification: unit tests of each failure; a clean package lists none.

### RF-642 (new) - Agent definitions per tool - R1 - Could - Source DEC-173, DEC-60

> Given "Agents will build" and a tool of Claude Code or Codex, when the package is written, then an `agents/` folder
> holds one definition per role for that tool, each with the model of its tier, and a note on where to copy it; and the
> same roles are described in prose in `orchestration.md`, so the package is usable without the tool. Nothing in the
> package installs, runs or configures the tool.

Verification: structure test per tool; a test that the folder contains no hook, command or plugin file (DEC-60).

### RF-643 (new) - Recommended delivery flow - R1 - Could - Source DEC-173, DEC-175

> Given "Agents will build" and a hosted application, when `orchestration.md` is written, then it has a recommended
> delivery flow section (integration branch, staging with a smoke test, owner-merged release) marked as a
> recommendation. Given the application is not hosted, then the section is absent.

Open question Q-H: where does the brief learn that the app is hosted? [from the project context field "deployment", else
absent.]

### Phase-closing evidence (proposal, folded into a plan-content card)

The plan's cards for a package of two or more phases each end with a verification-matrix card (requirement to tests,
targets, gaps to follow-up cards) and a security review card where a risk class other than `none` exists. This is a
change to the planner's instructions and fixed cards, not a new requirement; it is card P6-10 and an extension of RF-630.

## 11. Proposed cards

All cards in this phase wait for the owner's gate (DEC-173) and for the proposals above to be accepted. They are
appended to `docs/orchestration/tasks.md`, Phase 6. Bands follow the cost-of-a-mistake test; none is above `sonnet`
because no card touches a secret, access or stored data: the brief schema change is additive and defaulted.

| Card  | Title                                                                     | Band       | Size | Depends on                 |
| ----- | ------------------------------------------------------------------------- | ---------- | ---- | -------------------------- |
| P6-02 | The brief records the agent tool and a model per tier                     | 7 (sonnet) | M    | none                       |
| P6-03 | Plan setup asks the build method plainly and says what it leaves out      | 7 (sonnet) | M    | P6-02                      |
| P6-04 | Task cards name the model of their tier and the largest tier is reachable | 8 (sonnet) | M    | P6-02                      |
| P6-05 | A package check for the model of every card                               | 7 (sonnet) | S    | P6-04                      |
| P6-06 | `AGENTS.md` becomes the start-here index and comes first                  | 6 (sonnet) | S    | P6-02                      |
| P6-07 | `orchestration.md`: roles, bands, retry ladder, status flow, merge rules  | 8 (sonnet) | M    | P6-04, P6-06               |
| P6-08 | `orchestration.md`: gates, usage throttle, escalation, delivery flow      | 7 (sonnet) | M    | P6-07                      |
| P6-09 | Agent definitions per tool in the package                                 | 7 (sonnet) | M    | P6-04, P6-07               |
| P6-10 | Phase-closing verification-matrix and security review cards in the plan   | 8 (sonnet) | M    | none                       |
| P6-11 | The package says what it leaves out when people build                     | 5 (haiku)  | S    | P6-03                      |
| P6-12 | Method end to end: a single-file app run with the method on               | 8 (sonnet) | M    | P6-05, P6-08, P6-09, P6-11 |

Mix: one haiku, ten sonnet, no opus. The card the review would flag as risky is P6-04 (it changes the derivation every
package uses); it is rated 8, its verifier is the middle one, and its probes are the size and risk-class table. If the
owner picks Q-C option "planner marks 9-10", P6-04 becomes 9 (opus).

Order: P6-02 first; then P6-03, P6-04 and P6-06 can run together (disjoint files: the web step, the task markdown and
domain, the method markdown); P6-05 after P6-04; P6-07 and P6-08 are serialized (same new file); P6-09 after P6-07.

## 12. Open questions, with defaults

| Id  | Question                                                                                        | Default                                                             | Needed by |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------- |
| Q-A | Is the build method question required, or defaulted on when the context names an agent tool?    | required, with the context shortcut                                 | P6-03     |
| Q-B | What happens to a brief saved before the change?                                                | stays "People will build"; the page invites to answer again         | P6-02     |
| Q-C | How is the largest tier reached? Risk class on M or L cards rates 9, or the planner marks 9-10? | risk class on M or L cards rates 9; an S card keeps 8 (middle tier) | P6-04     |
| Q-D | Does a failed model check block the package?                                                    | no; it is listed in `checks.md`                                     | P6-05     |
| Q-E | Definitions for "another" tool?                                                                 | no; prose protocol only                                             | P6-09     |
| Q-F | Warn when a local model is listed as a builder?                                                 | yes, for difficulty above 2                                         | P6-05     |
| Q-G | Does the "builder never edits the task list" rule suit every team?                              | stated as a default, replaceable by a recorded decision             | P6-07     |
| Q-H | How does the brief say the application is hosted?                                               | the project context field "deployment"; absent means no section     | P6-08     |
| Q-I | Fable for Claude Code: ship the file?                                                           | only when the brief names an escalation model, owner-approval note  | P6-09     |

## 13. What this review did not check

- No package was generated; the findings about the first file and the sections of `AGENTS.md` come from the writer's
  source, not from a run. P6-12 runs one.
- No other tool's definition format was verified (Codex reads `AGENTS.md`; its model selection is outside the file). The
  Codex shape in RF-642 is therefore "plain Markdown prompts", not a format promise.
- The reference skill was read as a method only. Its internal examples that name the owner's employer or work projects
  were not copied and are not cited here.
