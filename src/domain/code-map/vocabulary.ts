// The closed vocabularies of the code map (data-model 3.4). One definition each: the language pack
// port, the universal scan and the code map schema all use these.

/** RF-110: what a language pack may report as a symbol. */
export type SymbolKind =
  'class' | 'enum' | 'function' | 'interface' | 'method' | 'property' | 'struct';

/** RF-103: the verb a recorded SQL statement starts with. */
export type SqlVerb = 'CREATE' | 'DELETE' | 'EXEC' | 'INSERT' | 'SELECT' | 'UPDATE';

/** RF-111: `code-behind` is a WebForms page to its code; `import` is a source file using another. */
export type LinkKind = 'code-behind' | 'import';
