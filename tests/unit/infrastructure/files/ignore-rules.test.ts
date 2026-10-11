import { describe, expect, it } from 'vitest';
import {
  builtInDenyPatterns,
  IgnoreRules,
} from '../../../../src/infrastructure/files/ignore-rules.js';

function rules(settingsRules = '', repositoryRules = '', allowDenied: string[] = []): IgnoreRules {
  return new IgnoreRules({ settingsRules, repositoryRules, allowDenied });
}

describe('ignore rules from the project setting', () => {
  it('RF-140 a pattern in scan.ignoreRules ignores the matching paths and nothing else', () => {
    const subject = rules('bin/\n*.log\n/docs/private.md\n');

    expect(subject.verdict('bin/app.dll')).toBe('ignored');
    expect(subject.verdict('src/bin/tool.exe')).toBe('ignored');
    expect(subject.verdict('logs/today.log')).toBe('ignored');
    expect(subject.verdict('docs/private.md')).toBe('ignored');
    expect(subject.verdict('src/docs/private.md')).toBe('allowed');
    expect(subject.verdict('src/main.ts')).toBe('allowed');
  });

  it('RF-140 a negation inside the setting works within the setting', () => {
    const subject = rules('*.log\n!keep.log\n');

    expect(subject.verdict('a.log')).toBe('ignored');
    expect(subject.verdict('keep.log')).toBe('allowed');
  });

  it('RF-140 matching ignores case so a differently cased name is not a way round a rule', () => {
    expect(rules('*.secret\n').verdict('Vault.SECRET')).toBe('ignored');
  });
});

describe('ignore rules from a committed .rosettaignore', () => {
  it('RF-140 a .rosettaignore pattern adds an exclusion', () => {
    const subject = rules('', 'fixtures/\n');

    expect(subject.verdict('fixtures/data.json')).toBe('ignored');
    expect(subject.verdict('src/main.ts')).toBe('allowed');
  });

  it("RF-140 a negated .rosettaignore pattern never lifts the project's rules", () => {
    const subject = rules('secrets/\n*.log\n', '!secrets/\n!*.log\n!secrets/readme.md\n');

    expect(subject.verdict('secrets/readme.md')).toBe('ignored');
    expect(subject.verdict('app.log')).toBe('ignored');
  });

  it('RF-140 a negated .rosettaignore pattern never lifts the built-in deny list', () => {
    const subject = rules('', '!.env\n!*.pem\n');

    expect(subject.verdict('.env')).toBe('denied');
    expect(subject.verdict('certs/server.pem')).toBe('denied');
  });
});

describe('built-in deny list', () => {
  it('RF-147 the deny list holds exactly the patterns of the requirement', () => {
    expect(builtInDenyPatterns).toEqual([
      '.env',
      '.env.*',
      '*.pem',
      '*.key',
      '*.pfx',
      '*.p12',
      'id_rsa*',
      '*.kdbx',
    ]);
  });

  it.each([
    '.env',
    'config/.env',
    '.env.production',
    'deploy/.env.local',
    'certs/server.pem',
    'keys/signing.key',
    'cert.pfx',
    'store.p12',
    'id_rsa',
    'home/.ssh/id_rsa.pub',
    'vault.kdbx',
    'CONFIG/.ENV',
    'Server.PEM',
  ])('RF-147 %s is denied without any ignore rule', (path) => {
    expect(rules().verdict(path)).toBe('denied');
  });

  it.each(['env.md', 'src/environment.ts', 'keyboard.ts', 'monkey.txt', 'pem.md'])(
    'RF-147 %s is not denied',
    (path) => {
      expect(rules().verdict(path)).toBe('allowed');
    },
  );
});

describe('scan.allowDenied', () => {
  it('RF-147 the deny list wins over the ignore rules when both match', () => {
    expect(rules('*.pem\n').verdict('a.pem')).toBe('denied');
  });

  it('RF-147 an explicit scan.allowDenied entry lifts that pattern only and is recorded', () => {
    const subject = rules('', '', ['*.pem']);

    expect(subject.verdict('certs/server.pem')).toBe('allowed');
    expect(subject.verdict('keys/signing.key')).toBe('denied');
    expect(subject.liftedDenyPatterns).toEqual(['*.pem']);
  });

  it('RF-147 a lifted pattern is still excluded when an ignore rule matches it', () => {
    expect(rules('*.pem\n', '', ['*.pem']).verdict('a.pem')).toBe('ignored');
  });

  it('RF-147 nothing is lifted by default, and an entry that is not a built-in pattern lifts nothing', () => {
    expect(rules().liftedDenyPatterns).toEqual([]);

    const subject = rules('', '', ['*', '.env*', 'secrets/']);

    expect(subject.liftedDenyPatterns).toEqual([]);
    expect(subject.verdict('.env')).toBe('denied');
    expect(subject.verdict('.env.local')).toBe('denied');
  });

  it('RF-147 lifted patterns are recorded in the order of the deny list, once each', () => {
    expect(rules('', '', ['*.kdbx', '.env', '*.kdbx']).liftedDenyPatterns).toEqual([
      '.env',
      '*.kdbx',
    ]);
  });
});
