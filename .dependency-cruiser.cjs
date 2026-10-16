/**
 * Layer rules of docs/architecture.md section 3 and docs/conventions.md section 10
 * (ADR-009, ADR-011, RNF-013).
 */
const sdkPackages = '(openai|@anthropic-ai/sdk|web-tree-sitter|tree-sitter-c-sharp|yazl|pg)';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-imports-only-domain',
      comment: 'domain imports nothing outside domain (ADR-009)',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { path: '^(src/(?!domain/)|tests/|web/)' },
    },
    {
      name: 'domain-no-third-party',
      comment: 'domain imports no third-party package',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { dependencyTypes: ['npm', 'npm-dev', 'npm-optional', 'npm-peer', 'npm-bundled'] },
    },
    {
      name: 'application-imports-domain-only',
      comment: 'application imports only domain and application',
      severity: 'error',
      from: { path: '^src/application/' },
      to: { path: '^(src/(infrastructure|presentation)/|tests/|web/)' },
    },
    {
      name: 'domain-no-node-builtins',
      comment: 'domain imports no Node built-in module (architecture section 3)',
      severity: 'error',
      from: { path: '^src/domain/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'node-io-only-in-infrastructure',
      comment: 'node:fs and node:crypto appear only in src/infrastructure (architecture section 3)',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/infrastructure/' },
      to: { dependencyTypes: ['core'], path: '^(node:)?(fs|crypto)(/|$)' },
    },
    {
      name: 'fastify-only-in-presentation-web',
      comment:
        'fastify and its plugins appear only in src/presentation/web/ (architecture section 3)',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/presentation/web/' },
      to: { path: '^(fastify|@fastify/)|node_modules/(fastify|@fastify/)' },
    },
    {
      name: 'infrastructure-not-presentation',
      comment: 'infrastructure may not import presentation',
      severity: 'error',
      from: { path: '^src/infrastructure/' },
      to: { path: '^src/presentation/' },
    },
    {
      name: 'src-not-tests',
      comment: 'nothing in src imports tests',
      severity: 'error',
      from: { path: '^src/' },
      to: { path: '^tests/' },
    },
    {
      name: 'fake-server-registry-test-only',
      comment:
        'only fake-server-ports.ts (a reader) imports the fake server port registry from src; writers live in tests/support (RNF-005, ADR-008)',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/infrastructure/providers/fake-server-ports[.]ts$' },
      to: { path: '^src/infrastructure/providers/fake-server-port-registry[.]ts$' },
    },
    {
      name: 'sdks-only-in-infrastructure',
      comment: 'provider SDKs, web-tree-sitter, yazl and pg only from src/infrastructure',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/infrastructure/' },
      to: { path: `node_modules/${sdkPackages}/` },
    },
    {
      name: 'openai-sdk-only-in-openai-adapter',
      comment: 'the openai package only from src/infrastructure/providers/openai/ (ADR-003)',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/infrastructure/providers/openai/' },
      to: { path: '^openai(/|$)|node_modules/openai/' },
    },
    {
      name: 'anthropic-sdk-only-in-anthropic-adapter',
      comment:
        'the @anthropic-ai/sdk package only from src/infrastructure/providers/anthropic/ (ADR-003)',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/infrastructure/providers/anthropic/' },
      to: { path: '^@anthropic-ai/sdk(/|$)|node_modules/@anthropic-ai/sdk/' },
    },
    {
      name: 'adapters-only-via-adapter-builder',
      comment:
        'the Ollama, OpenAI, OpenAI-compatible, Anthropic and fake adapters are imported only by the adapter builder of the provider factory, so every provider is wrapped in the guards (ADR-003, ADR-006, ADR-007)',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/infrastructure/providers/adapter-builder\\.ts$' },
      to: {
        path: '^src/infrastructure/providers/(ollama/ollama-provider|openai/openai-provider|openai/openai-compatible-provider|anthropic/anthropic-provider|fake/fake-provider)\\.ts$',
      },
    },
    {
      name: 'adapter-builder-only-in-compose-providers',
      comment:
        'the adapter builder returns adapters without the guards; only the provider composition imports it and hands it to the provider factory, which wraps every adapter (ADR-003, ADR-006, ADR-007)',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/presentation/compose-providers\\.ts$' },
      to: { path: '^src/infrastructure/providers/adapter-builder\\.ts$' },
    },
    {
      name: 'tree-sitter-only-in-packs',
      comment:
        'web-tree-sitter and its grammars only from src/infrastructure/scan/packs/ (ADR-004, DEC-11)',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/infrastructure/scan/packs/' },
      to: {
        path: '^(web-tree-sitter|tree-sitter-c-sharp)(/|$)|node_modules/(web-tree-sitter|tree-sitter-c-sharp)/',
      },
    },
    {
      name: 'tar-only-in-github',
      comment: 'tar only from src/infrastructure/github/ (ADR-019)',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/infrastructure/github/' },
      to: { path: 'node_modules/tar/' },
    },
    {
      name: 'ignore-only-in-files',
      comment: 'ignore only from src/infrastructure/files/ (ADR-019)',
      severity: 'error',
      from: { path: '^src/', pathNot: '^src/infrastructure/files/' },
      to: { path: 'node_modules/ignore/' },
    },
    {
      name: 'web-imports-contracts-only',
      comment: 'web/ may import from src/ only src/application/contracts/ (DEC-112)',
      severity: 'error',
      from: { path: '^web/' },
      to: { path: '^src/', pathNot: '^src/application/contracts/' },
    },
    {
      name: 'no-circular',
      comment: 'no cycles anywhere',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-non-package-json',
      comment: 'no dependency missing from package.json',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
    },
  },
};
