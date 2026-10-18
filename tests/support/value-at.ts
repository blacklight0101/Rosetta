// RF-624: reads a parsed document (YAML or JSON) without casts: the value at a path of own keys, or
// undefined when the path leaves the document.

export function valueAt(value: unknown, ...keys: string[]): unknown {
  let current = value;
  for (const key of keys) {
    if (typeof current !== 'object' || current === null || !Object.hasOwn(current, key))
      return undefined;
    current = Object.getOwnPropertyDescriptor(current, key)?.value;
  }
  return current;
}

/** The own keys of the object at this path; empty when it is not an object. */
export function keysAt(value: unknown, ...keys: string[]): string[] {
  const found = valueAt(value, ...keys);
  return typeof found === 'object' && found !== null ? Object.keys(found) : [];
}
