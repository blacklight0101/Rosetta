// Like `Required<T>` all the way down: every optional field of every nested object and array
// element is required too, so a fixture typed with it must fill a field added to any nested type.
export type DeepRequired<T> = T extends readonly (infer Item)[]
  ? readonly DeepRequired<Item>[]
  : T extends object
    ? { readonly [Key in keyof T]-?: DeepRequired<NonNullable<T[Key]>> }
    : T;
