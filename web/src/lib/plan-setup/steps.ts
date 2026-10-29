// RF-605, RF-608, RF-609, RF-610, RF-611, RF-612, design-system.md section 14 (Plan setup): the six
// steps of the interview, the questions each one answers (the ids the planning brief lists in
// `defaulted`, data-model.md section 3.20), the seven layers of the stack and the words each step
// uses to say why it matters.

export const STEP_IDS = [
  'principles',
  'architecture',
  'migration',
  'stack',
  'context',
  'method',
] as const;

export type StepId = (typeof STEP_IDS)[number];

export const STEP_NAMES: Readonly<Record<StepId, string>> = {
  principles: 'Principles',
  architecture: 'Architecture',
  migration: 'Migration',
  stack: 'Stack',
  context: 'Project context',
  method: 'Build method',
};

/** RF-609: the layers of the target stack, in the order the brief keeps them. */
export const STACK_LAYERS = [
  { id: 'language-runtime', name: 'Language and runtime' },
  { id: 'backend-framework', name: 'Back-end framework' },
  { id: 'front-end', name: 'Front end' },
  { id: 'database', name: 'Database' },
  { id: 'data-access', name: 'Data access' },
  { id: 'testing', name: 'Testing' },
  { id: 'hosting', name: 'Hosting' },
] as const;

/** RF-611: the optional project questions, in the order the page asks them. */
export const CONTEXT_FIELDS = [
  'teamSize',
  'experience',
  'deadline',
  'keepIntegrations',
  'dataMigration',
] as const;

export type ContextField = (typeof CONTEXT_FIELDS)[number];

/** The question ids a step answers; saving the step records them as answered. */
export function questionsOf(step: StepId): readonly string[] {
  switch (step) {
    case 'principles':
      return ['principles'];
    case 'architecture':
      return ['architecture'];
    case 'migration':
      return ['migration'];
    case 'stack':
      return STACK_LAYERS.map((layer) => `stack.${layer.id}`);
    case 'context':
      return CONTEXT_FIELDS.map((field) => `context.${field}`);
    case 'method':
      return ['buildMethod'];
  }
}

/** The title and the reason of each step: why the question matters to the package (RF-605). */
export const STEP_TEXT: Readonly<Record<StepId, { readonly title: string; readonly why: string }>> =
  {
    principles: {
      title: 'Which principles should the package apply?',
      why: "Each one you keep becomes rules in the package's conventions and checks on its task cards.",
    },
    architecture: {
      title: 'Which architecture should the new system follow?',
      why: 'It shapes the target architecture, an ADR in the package and the layout every task card builds into. Rosetta recommends two styles from what it found in the code.',
    },
    migration: {
      title: 'How should the team move from the legacy system to the new one?',
      why: "It decides the order of the roadmap's phases and gets an ADR in the package. Strangler Fig is the default.",
    },
    stack: {
      title: 'Which technology for each layer?',
      why: 'Two proposals per layer, derived from the legacy stack (the first stays closest to it), keeping the legacy technology, or your own. Each layer you choose becomes an ADR, and task cards use these technologies.',
    },
    context: {
      title: 'What should the roadmap know about your team and constraints?',
      why: 'All of these are optional. What you answer shapes the size and order of the roadmap; what you leave blank is listed as an open question in the package.',
    },
    method: {
      title: 'Will agents or people build the new system?',
      why: 'Your answer decides whether the package carries the working method for agents: a start-here file, a build protocol, agent definitions and the model of each task card. There is no default; leave it unanswered and the package assumes people will build and lists the question as open.',
    },
  };

/** The catalogue groups of the principles step, in the order the catalogue lists them (RF-606). */
export const GROUP_NAMES: Readonly<Record<string, string>> = {
  'design-principles': 'Design principles',
  method: 'Method',
  modernisation: 'Modernisation path',
  'quality-gates': 'Quality gates',
  documentation: 'Documentation',
  security: 'Security',
  delivery: 'Delivery',
  'ai-assisted-build': 'AI-assisted build',
};

/** The group of the architecture styles: listed by the architecture step, not as a principle. */
export const STYLE_GROUP = 'architecture-styles';
