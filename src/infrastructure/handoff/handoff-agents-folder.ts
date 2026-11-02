import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import {
  isLocalTier,
  modelForTier,
  resolveBuildMethod,
} from '../../domain/planning/build-method.js';
import type { BuildMethod } from '../../domain/planning/build-method.js';
import type { MarkdownEscaper } from '../cards/markdown-text.js';
import { renderYamlHeader } from '../cards/yaml-header.js';
import type { TextMasker } from '../guards/secret-masker.js';
import {
  builderLines,
  escalationLines,
  orchestratorLines,
  verifierLines,
} from './handoff-agent-prose.js';
import type { BuilderTier } from './handoff-agent-prose.js';
import { handoffFiles } from './handoff-links.js';

// RF-612, RF-642, DEC-60, ADR-013: the `agents/` folder of an AI-assisted package, written for the
// agent tool the brief chose. Claude Code gets one definition per role with the model of its tier
// in its front matter; Codex gets plain role prompts; another tool gets no folder, because
// `orchestration.md` already describes the roles in prose (Q-E). The folder holds Markdown only:
// no hook, command, settings or plugin file, and nothing here installs or runs the tool.
// A model name is text from the brief: the front matter is written by the YAML header writer
// (every value a quoted scalar, so a name cannot add a key or a line), and the README table
// escapes it as Markdown. Both mask it first.

const FOLDER = 'agents';
const verifierTools = 'Read, Grep, Glob, Bash';

interface Role {
  readonly file: string;
  readonly title: string;
  readonly what: string;
  readonly description: string;
  readonly body: readonly string[];
  /** The model of the role: a tier, or the escalation model. */
  readonly model: BuilderTier | 'escalation';
  readonly tools?: string;
}

const builderRole = (tier: BuilderTier, method: BuildMethod): Role => ({
  file: `builder-${tier}.md`,
  title: `Builder (${tier} tier)`,
  what: `builds the cards of the ${tier} tier`,
  description: `Builder for the task cards of the ${tier} tier. Implements exactly one card from tasks.md on its own branch, test first, and reports in the fixed format.`,
  body: builderLines(tier, method),
  model: tier,
});

const verifierRole = (tier: BuilderTier): Role => ({
  file: tier === 'largest' ? 'verifier-largest.md' : 'verifier.md',
  title: tier === 'largest' ? 'Verifier (largest tier)' : 'Verifier (middle tier)',
  what: tier === 'largest' ? 'verifies the cards of the largest tier' : 'verifies the other cards',
  description: `Independent verifier of the ${tier} tier. Re-runs every gate on the branch of a card and returns VERDICT PASS or FAIL with ranked findings. Never edits the branch.`,
  body: verifierLines(tier),
  model: tier,
  tools: verifierTools,
});

const orchestratorRole: Role = {
  file: 'orchestrator.md',
  title: 'Orchestrator',
  what: 'runs the build as the main session',
  description:
    'Orchestrator of the build. Runs as the main session, never as a subagent, because a subagent cannot start builders. Picks ready cards, starts builders and verifiers, merges under the merge rules.',
  body: orchestratorLines(),
  model: 'largest',
};

const escalationRole: Role = {
  file: 'builder-escalation.md',
  title: 'Builder (escalation model)',
  what: "builds a card at FAIL 3, only with the owner's approval",
  description:
    "Builder of last resort. Used only at the third failure of a card (FAIL 3) and only with the owner's approval in chat. Never starts a card.",
  body: escalationLines(),
  model: 'escalation',
};

function rolesOf(method: BuildMethod, escalation: boolean): Role[] {
  return [
    orchestratorRole,
    builderRole('smallest', method),
    builderRole('middle', method),
    builderRole('largest', method),
    verifierRole('middle'),
    verifierRole('largest'),
    ...(escalation ? [escalationRole] : []),
  ];
}

function modelOf(method: BuildMethod, role: Role): string | undefined {
  return role.model === 'escalation' ? method.models?.escalation : modelForTier(method, role.model);
}

/** A Claude Code definition: front matter written by the YAML header writer, then the role. */
function claudeCodeFile(role: Role, model: string | undefined, masker: TextMasker): string {
  const header = renderYamlHeader({
    name: role.file.replace(/\.md$/u, ''),
    description: role.description,
    ...(model === undefined ? {} : { model: masker.mask(model).text }),
    ...(role.tools === undefined ? {} : { tools: role.tools }),
  });
  return ['---', header, '---', '', ...role.body].join('\n');
}

/** A plain role prompt for Codex or any tool that reads Markdown: no front matter. */
function promptFile(role: Role): string {
  return [`# ${role.title}`, '', ...role.body].join('\n');
}

function noteLines(method: BuildMethod): string[] {
  if (method.agentTool?.kind === 'claude-code') {
    return [
      'These files are plain Markdown definitions for Claude Code subagents. To use them, copy this folder into the repository you build in, as `.claude/agents/` (a file per role), and start the orchestrator as the main session, for example with `claude --agent orchestrator`.',
      '',
      'Nothing here installs, runs or configures the tool: there is no hook, command, settings or plugin file. Copying the files is your decision. Without the tool, follow the same roles from the prose in [orchestration.md](../orchestration.md).',
      '',
    ];
  }
  return [
    `These files are plain role prompts without front matter. To use them, paste the prompt of a role as the task prompt of the agent that plays it, or reference the file from the \`AGENTS.md\` of the repository you build in (the package's own is [AGENTS.md](../${handoffFiles.agents})). Models are chosen in the tool, not in the files; the table lists the model of each tier.`,
    '',
    `Nothing here installs, runs or configures the tool. The roles are also described in prose in [orchestration.md](../${handoffFiles.orchestration}).`,
    '',
  ];
}

function readmeFile(method: BuildMethod, roles: readonly Role[], esc: MarkdownEscaper): string {
  const rows = roles.map((role) => {
    const model = modelOf(method, role);
    const name = model === undefined ? 'not named' : esc.inline(model);
    const local = role.model !== 'escalation' && isLocalTier(method, role.model);
    return `| \`${role.file}\` | ${role.title} ${role.what} | ${local ? `${name}, runs locally` : name} |`;
  });
  const escalation = roles.some((role) => role.model === 'escalation')
    ? [
        "The escalation definition is used only at FAIL 3 of a card and only with the owner's approval in chat. No card starts there.",
        '',
      ]
    : [];
  return [
    '# Agent definitions',
    '',
    ...noteLines(method),
    '| File | Role | Model |',
    '| ---- | ---- | ----- |',
    ...rows,
    '',
    ...escalation,
  ].join('\n');
}

/** Whether the package writes the `agents/` folder: only for Claude Code and Codex (Q-E, RF-642). */
// RF-642, P6-30
export function writesAgentFolder(given: BuildMethod | undefined): boolean {
  const kind = given?.aiAssisted === true ? given.agentTool?.kind : undefined;
  return kind === 'claude-code' || kind === 'codex';
}

/**
 * The files of the `agents/` folder by path inside the package, or none when people build or the
 * tool is neither Claude Code nor Codex (Q-E).
 */
// RF-642
export function agentFiles(
  handoff: HandoffPackage,
  esc: MarkdownEscaper,
  masker: TextMasker,
): Record<string, string> {
  if (!writesAgentFolder(handoff.brief.buildMethod)) return {};
  const method = resolveBuildMethod(handoff.brief.buildMethod, handoff.agentModels);
  const kind = method.agentTool?.kind;
  const roles = rolesOf(method, kind === 'claude-code' && method.models?.escalation !== undefined);
  const files: Record<string, string> = {
    [`${FOLDER}/README.md`]: readmeFile(method, roles, esc),
  };
  for (const role of roles) {
    files[`${FOLDER}/${role.file}`] =
      kind === 'claude-code'
        ? claudeCodeFile(role, modelOf(method, role), masker)
        : promptFile(role);
  }
  return files;
}
