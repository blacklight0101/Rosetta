import { describe, expect, it } from 'vitest';
import { detectLanguage } from '../../../../../src/infrastructure/scan/universal/language-detect.js';

describe('language by extension', () => {
  it.each([
    ['src/App.cs', 'csharp'],
    ['Default.aspx.cs', 'csharp'],
    ['Default.aspx', 'aspnet'],
    ['Site.master', 'aspnet'],
    ['Global.asax', 'aspnet'],
    ['page.asp', 'asp'],
    ['page.jsp', 'jsp'],
    ['index.php', 'php'],
    ['Main.java', 'java'],
    ['app.vb', 'vb'],
    ['Module1.bas', 'vb6'],
    ['main.go', 'go'],
    ['lib.rs', 'rust'],
    ['tool.py', 'python'],
    ['build.rb', 'ruby'],
    ['app.js', 'javascript'],
    ['index.TS', 'typescript'],
    ['widget.tsx', 'typescript'],
    ['run.sh', 'shell'],
    ['deploy.ps1', 'powershell'],
    ['go.bat', 'batch'],
    ['schema.sql', 'sql'],
    ['page.html', 'html'],
    ['site.css', 'css'],
    ['Web.config', 'xml'],
    ['Shop.csproj', 'xml'],
    ['data.json', 'json'],
    ['ci.yml', 'yaml'],
    ['settings.ini', 'ini'],
    ['app.properties', 'properties'],
    ['README.md', 'markdown'],
    ['notes.txt', 'text'],
    ['LEDGER.cbl', 'cobol'],
    ['ACCOUNT.cpy', 'cobol'],
    ['Dockerfile', 'dockerfile'],
    ['docker/Dockerfile', 'dockerfile'],
    ['Makefile', 'makefile'],
  ])('RF-101 %s is %s', (path, language) => {
    expect(detectLanguage(path)).toBe(language);
  });

  it.each(['notes.xyz', 'LICENSE', 'src/noextension', 'archive.weird'])(
    'RF-101 %s has an unknown language, which is a valid value',
    (path) => {
      expect(detectLanguage(path)).toBe('unknown');
    },
  );
});

describe('language by content', () => {
  it.each([
    ['bin/run', '#!/usr/bin/env python3\nprint(1)\n', 'python'],
    ['bin/run', '#!/bin/bash\necho 1\n', 'shell'],
    ['bin/run', '#!/usr/bin/env node\n', 'javascript'],
    ['bin/run', '#!/usr/bin/php\n', 'php'],
    ['lib/old.inc', '<?php echo 1;', 'php'],
    ['lib/old.inc', 'just text', 'unknown'],
    ['data', '<?xml version="1.0"?><a/>', 'xml'],
    ['page', '<%@ Page Language="C#" %>', 'aspnet'],
    ['include/a.h', '#include <iostream>\nclass A {};\n', 'cpp'],
    ['include/a.h', '#include <stdio.h>\nint main(void);\n', 'c'],
  ])('RF-101 %s starting with %j is %s', (path, head, language) => {
    expect(detectLanguage(path, head)).toBe(language);
  });

  it('RF-101 the extension wins over the content', () => {
    expect(detectLanguage('a.cs', '#!/bin/bash\n')).toBe('csharp');
  });

  it('RF-101 without content only the extension is used', () => {
    expect(detectLanguage('bin/run')).toBe('unknown');
  });
});
