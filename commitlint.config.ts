// Dependabot writes "<prefix>(deps|deps-dev): Bump ..." with a capital B and has no option to change
// it (.github/dependabot.yml sets the prefix); those exact titles skip the rules, nothing wider.
const dependabotTitle = /^(build|ci)\(deps(-dev)?\): Bump /u;

export default {
  extends: ['@commitlint/config-conventional'],
  ignores: [(message: string): boolean => dependabotTitle.test(message)],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'test', 'refactor', 'docs', 'chore', 'ci', 'build', 'perf'],
    ],
    'header-max-length': [2, 'always', 72],
  },
};
