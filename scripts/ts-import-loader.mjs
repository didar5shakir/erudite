// Test-only ESM resolver: lets `node` import the project's src/*.ts modules (which use
// extensionless relative imports) by resolving './x' → './x.ts'. Node then strips types.
// Usage: node --loader ./scripts/ts-import-loader.mjs scripts/test_region_sampling.mjs
import { existsSync } from 'node:fs';
export function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.\w+$/.test(specifier)) {
    const cand = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(cand)) return next(specifier + '.ts', context);
  }
  return next(specifier, context);
}
