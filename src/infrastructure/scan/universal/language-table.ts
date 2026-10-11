// RF-101: language ids by file extension and by whole file name. A table, not logic: adding a
// language is a line here. Ids are lower case; `unknown` is the value for everything else.

const groups: Readonly<Record<string, readonly string[]>> = {
  csharp: ['cs'],
  vb: ['vb'],
  vb6: ['bas', 'frm', 'vbp'],
  vbscript: ['vbs'],
  fsharp: ['fs', 'fsx'],
  aspnet: ['aspx', 'ascx', 'master', 'asax', 'ashx', 'asmx'],
  razor: ['cshtml', 'vbhtml', 'razor'],
  asp: ['asp'],
  jsp: ['jsp', 'jspx'],
  php: ['php', 'phtml'],
  java: ['java'],
  kotlin: ['kt', 'kts'],
  scala: ['scala'],
  groovy: ['groovy', 'gradle'],
  javascript: ['js', 'mjs', 'cjs', 'jsx'],
  typescript: ['ts', 'tsx', 'mts', 'cts'],
  python: ['py'],
  ruby: ['rb'],
  go: ['go'],
  rust: ['rs'],
  c: ['c', 'h'],
  cpp: ['cpp', 'cc', 'cxx', 'hpp', 'hh'],
  swift: ['swift'],
  perl: ['pl', 'pm'],
  lua: ['lua'],
  shell: ['sh', 'bash'],
  powershell: ['ps1', 'psm1'],
  batch: ['bat', 'cmd'],
  sql: ['sql'],
  html: ['html', 'htm'],
  css: ['css', 'scss', 'less'],
  xml: ['xml', 'config', 'csproj', 'vbproj', 'fsproj', 'resx', 'xsd', 'xsl', 'xslt', 'wsdl'],
  json: ['json'],
  yaml: ['yml', 'yaml'],
  toml: ['toml'],
  ini: ['ini'],
  properties: ['properties'],
  markdown: ['md', 'markdown'],
  text: ['txt'],
  cobol: ['cbl', 'cob', 'cpy'],
  fortran: ['f', 'f90', 'for'],
  pascal: ['pas', 'dpr'],
};

export const languageByExtension: ReadonlyMap<string, string> = new Map(
  Object.entries(groups).flatMap(([language, extensions]) =>
    extensions.map((extension) => [extension, language] as const),
  ),
);

/** Lower-case whole file names that carry a language without an extension. */
export const languageByName: ReadonlyMap<string, string> = new Map([
  ['dockerfile', 'dockerfile'],
  ['makefile', 'makefile'],
  ['gemfile', 'ruby'],
  ['rakefile', 'ruby'],
]);

/** The interpreter named in a `#!` line, by the start of its program name. */
export const languageByInterpreter: readonly (readonly [string, string])[] = [
  ['python', 'python'],
  ['node', 'javascript'],
  ['bash', 'shell'],
  ['sh', 'shell'],
  ['zsh', 'shell'],
  ['dash', 'shell'],
  ['ksh', 'shell'],
  ['php', 'php'],
  ['ruby', 'ruby'],
  ['perl', 'perl'],
  ['pwsh', 'powershell'],
];
