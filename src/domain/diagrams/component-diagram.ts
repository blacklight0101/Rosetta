// RF-601, RF-603, RF-508: the component diagram of the target architecture (not built yet).

export interface DiagramComponent {
  readonly name: string;
  readonly dependsOn: readonly string[];
}

// RF-601
export const componentDiagram: (components: readonly DiagramComponent[]) => string = () => '';
