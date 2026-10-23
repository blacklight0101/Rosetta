/** RF-102: the kind of a file that tells an agent where behaviour starts or what it depends on. */
export type ArtefactKind =
  | 'configuration'
  | 'controller'
  | 'database-script'
  | 'deployment'
  | 'entry-point'
  | 'manifest'
  | 'page';
