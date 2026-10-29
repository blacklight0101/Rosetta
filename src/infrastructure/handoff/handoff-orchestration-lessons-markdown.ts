import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import { stackLanguages } from './handoff-grep-rules.js';
import type { SectionWriter } from './handoff-orchestration-gates-markdown.js';

// RF-640, RF-644, DEC-177: the section "Lessons from running a build" of orchestration.md. Every
// line is the package's own fixed wording, one or two sentences, tool-neutral; no brief text is
// written here (ADR-013), so nothing needs the escaper. Three items depend on the brief: the one
// for Claude Code (the agent tool), the Windows items (a stack answer naming Windows) and the .NET
// item (a .NET language in the stack). It names no employer and no other project (DEC-03).

const always: readonly string[] = [
  'Continuous integration on the pull request is the authority, and a result is read from the exit code, never from a search of output.',
  'A flaky test may hide a real defect, so it becomes a card. Flaky focus or keyboard end-to-end steps usually mean the page heading renders only after data loads, so the Done-when of a user-interface card includes "the heading renders before data loads".',
  'Verifier minors that are pure wording may be fixed by the orchestrator on the branch before merge; everything else becomes a follow-up card.',
  "The owner's hands-on review changes the product, so record each change as a decision, mark the withdrawn requirements, add the requirement ids and only then cut the cards.",
  "An owner's bug report is traced in the logs, reproduced by a failing test and fixed in a follow-up card. When the cause is in seeded data, fix the seed and recreate the local database after asking.",
  'Patterns the secrets scan looks for are written self-safe in documents, for example `Passwor[d]=`, and are not allow-listed.',
  'Parallel cards collide in shared files such as resource files, allow-lists and shared test files. Resolve a collision by union and run a clean full build after each merge.',
  'A card with date navigation tests the first and last supported dates.',
  "Verifiers work only in the branch's worktree, and the main checkout is checked after each one.",
  'When the owner asks to try a change before it is merged, build a feature branch for the owner to try.',
  'Agents never skip or override hooks, add files by explicit path, never use a bare stash, stop processes only by the id they started, and install without lifecycle scripts in shared worktrees.',
  'One writer per seat: each agent gets full paths and its own log folder, and a lease file marks the orchestrator when a second one could take over.',
  'Evaluate the product on real inputs in a separate stack with its own ports and data, with an id per finding.',
  'Near a deadline, freeze the scope to what stops the journey, gives wrong content or loses data.',
  'The work is shown at the end of a phase.',
  'The session end updates the living hand-off and checks it for stale claims.',
  "Clean-up after every merge removes the card's worktrees and branches, but keeps a worktree that a running container stack uses.",
];

const claudeCodeItem =
  "Agent definitions load only from the session's project folder, so otherwise a general-purpose subagent is told to read the builder or verifier file.";

const windowsItems: readonly string[] = [
  'Windows has reserved TCP port ranges; pick ports outside them.',
  'The command-line length limit of `npx` applies to long argument lists; pass long lists through a file.',
  'A running app locks build output; stop it before building.',
  'The container engine stops with its Linux subsystem; start the subsystem first.',
  'Overnight system restarts end running processes; check them in the morning.',
];

const dotnetItem =
  'A build locked by a running preview is built in another configuration or after stopping the preview.';

function platformIsWindows(handoff: HandoffPackage): boolean {
  return handoff.choices.stack.some((each) => /\bwindows\b/iu.test(each.choice));
}

// RF-644
export const lessonsSection: SectionWriter = (handoff) => {
  const claude = handoff.brief.buildMethod.agentTool?.kind === 'claude-code';
  const items = [
    ...always,
    ...(claude ? [claudeCodeItem] : []),
    ...(platformIsWindows(handoff) ? windowsItems : []),
    ...(stackLanguages(handoff).includes('dotnet') ? [dotnetItem] : []),
  ];
  return [
    '## Lessons from running a build',
    '',
    'Lessons earlier builds paid for, so that this team does not learn them again.',
    '',
    ...items.map((each) => `- ${each}`),
    '',
  ];
};
