// P1-13: the module resolve hook registered by register-ts.mjs. A relative import that ends in
// ".js" and finds no file is retried with ".ts".
const relativeJs = /^\.{1,2}\/.*\.js$/u;

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const missing =
      error instanceof Error && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND';
    if (!missing || !relativeJs.test(specifier)) throw error;
    return await nextResolve(`${specifier.slice(0, -'.js'.length)}.ts`, context);
  }
}
