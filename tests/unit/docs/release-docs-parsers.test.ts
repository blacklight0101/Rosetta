import { describe, expect, it } from 'vitest';
import {
  fencedBlocks,
  hasIdRange,
  isPermittedLink,
  linksIn,
  matrixRows,
  normalize,
  requirementIds,
  section,
} from '../../support/release-docs.js';

const fence = '```';

describe('fencedBlocks', () => {
  it('RF-801 returns the language and the body of each block', () => {
    const text = `intro\n${fence}PowerShell\nCopy-Item a b\n${fence}\n\n${fence}bash\ncp a b\n${fence}\n`;

    expect(fencedBlocks(text)).toEqual([
      { lang: 'powershell', body: 'Copy-Item a b' },
      { lang: 'bash', body: 'cp a b' },
    ]);
  });

  it('RF-801 reads a block written with CRLF line endings', () => {
    const text = `${fence}bash\r\ncp a b\r\n${fence}\r\n`;

    expect(fencedBlocks(text)).toEqual([{ lang: 'bash', body: 'cp a b' }]);
  });

  it('RF-801 does not close a long fence with a shorter one', () => {
    const text = `~~~~bash\n${fence}\ninner\n${fence}\n~~~~\n`;

    expect(fencedBlocks(text)).toEqual([{ lang: 'bash', body: `${fence}\ninner\n${fence}` }]);
  });

  it('RF-801 ignores a block that never closes', () => {
    expect(fencedBlocks(`${fence}bash\ncp a b\n`)).toEqual([]);
  });

  it('RF-801 gives an empty language to a block without an info string', () => {
    expect(fencedBlocks(`${fence}\nx\n${fence}\n`)).toEqual([{ lang: '', body: 'x' }]);
  });
});

describe('section', () => {
  const doc = [
    '# Title',
    '## One',
    'first',
    `${fence}bash`,
    '# a comment, not a heading',
    fence,
    '### Inner',
    'inner text',
    '## Two',
    'second',
  ].join('\n');

  it('RF-801 returns the text up to the next heading of the same level', () => {
    expect(section(doc, '## One')).toBe(
      [
        'first',
        `${fence}bash`,
        '# a comment, not a heading',
        fence,
        '### Inner',
        'inner text',
      ].join('\n'),
    );
  });

  it('RF-801 runs to the end of the text for the last heading', () => {
    expect(section(doc, '## Two')).toBe('second');
  });

  it('RF-801 returns an empty text for a heading that is not there', () => {
    expect(section(doc, '## Three')).toBe('');
  });

  it('RF-801 finds a heading in a CRLF document', () => {
    expect(section(doc.replace(/\n/gu, '\r\n'), '## Two')).toBe('second');
  });
});

describe('requirementIds', () => {
  it('RF-801 finds ids in any case and with any hyphen, once each', () => {
    const text = 'rf-801, RF‑801, RNF–014 and RF-1301; not RF-80 or XRF-801y';

    expect(requirementIds(text)).toEqual(['RF-801', 'RNF-014', 'RF-1301']);
  });
});

describe('hasIdRange', () => {
  it.each([
    'RF-100..RF-112',
    'RF-100 – RF-112',
    'RF-100-RF-112',
    'RF-100-112',
    'RF-100 to RF-112',
    'RF-100 through 112',
    'RF-100…RF-112',
  ])('RF-801 flags the range %s', (text) => {
    expect(hasIdRange(text)).toBe(true);
  });

  it('RF-801 accepts a list of single ids', () => {
    expect(hasIdRange('RF-100, RF-101, RNF-014 and RF-1301')).toBe(false);
  });
});

describe('matrixRows', () => {
  const rows = [
    '| Id | Requirement | Priority | Tests | Example | Manual | State |',
    '|---|---|---|---|---|---|---|',
    '| RF-002 | Validate | Must | 1 / 2 / 3 | `a.ts:1` | - | Tests pass |',
    '| RF-801 | Quick start | Must | 0 / 0 / 0 | - | Gap: card | **Gap** |',
    '| RNF-014 | Secure | NFR | 1 / 3 / 0 | `b.ts:2` | Checked | Tests pass; checked here |',
    '| F-01 | MAJOR | not a requirement row |',
  ].join('\r\n');

  it('RF-801 returns the id and the last column of each requirement row', () => {
    expect(matrixRows(rows)).toEqual([
      { id: 'RF-002', state: 'Tests pass' },
      { id: 'RF-801', state: '**Gap**' },
      { id: 'RNF-014', state: 'Tests pass; checked here' },
    ]);
  });

  it('RF-801 skips a short row that only names an id', () => {
    expect(matrixRows('| RF-002 | Gap | pending |')).toEqual([]);
  });
});

describe('linksIn', () => {
  it('RF-801 finds links however they are written', () => {
    const text = [
      'see <https://Example.com/x>, [a](HTTP://b.dev/c).',
      'Also www.d.org and e.github.io/Rosetta/ and plain f.app.',
    ].join(' ');

    expect(linksIn(text)).toEqual([
      'https://Example.com/x',
      'HTTP://b.dev/c',
      'www.d.org',
      'e.github.io',
      'f.app',
    ]);
  });

  it('RF-801 finds nothing in text without links', () => {
    expect(linksIn('Run docker compose up and open 127.0.0.1:8080. [PENDIENTE: URL]')).toEqual([]);
  });
});

describe('isPermittedLink', () => {
  const allowed = {
    hosts: ['github.com'],
    prefixes: ['https://github.com/owner/repo', 'https://owner.github.io/repo'],
  };

  it.each([
    'github.com',
    'GitHub.com',
    'https://github.com/owner/repo',
    'https://GitHub.com/Owner/Repo/blob/main/x.md',
    'https://owner.github.io/repo/',
  ])('RF-801 permits %s', (link) => {
    expect(isPermittedLink(link, allowed)).toBe(true);
  });

  it.each([
    'github.com.evil.io',
    'https://github.com/owner/repo-evil',
    'https://github.com/owner/repository',
    'https://github.com/owner/repo@evil.com',
    'https://github.com/other/repo',
    'http://github.com/owner/repo',
    'https://evil.io/https://github.com/owner/repo',
    'https://owner.github.io.evil.io/repo',
    'www.github.com',
  ])('RF-801 refuses %s', (link) => {
    expect(isPermittedLink(link, allowed)).toBe(false);
  });
});

describe('section and fences together', () => {
  it('RF-801 does not take a heading-looking line inside a tilde fence as a heading', () => {
    const doc = ['## A', '~~~', '## B', '~~~', 'tail', '## C', 'c'].join('\n');

    expect(section(doc, '## B')).toBe('');
    expect(section(doc, '## A')).toBe(['~~~', '## B', '~~~', 'tail'].join('\n'));
  });

  it('RF-801 keeps a fence open until a marker at least as long closes it', () => {
    const doc = ['## A', '````', '```', '## B', '````', '## C', 'c'].join('\n');

    expect(section(doc, '## A')).toBe(['````', '```', '## B', '````'].join('\n'));
  });
});

describe('normalize', () => {
  it('RF-801 turns CR and CRLF into LF and look-alike hyphens into a hyphen', () => {
    expect(normalize('a\r\nb\rc‑d−e')).toBe('a\nb\nc-d-e');
  });
});
