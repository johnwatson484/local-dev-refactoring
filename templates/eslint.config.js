// Canonical eslint.config.js for Defra Node services.
//
// Rules enforced across all repos:
//   - neostandard as the base config
//   - curly: ['error', 'all']  -> every if/else/for/while body MUST use braces,
//     even single-line statements (this is NOT neostandard's default)
//
// SSR/frontend repos (those that build client assets with Vite) MUST also ignore
// the build output directory `.public/**` so lint doesn't scan bundled files.
// API-only repos (no Vite build) can omit the `ignores` option.
//
// Choose ONE of the two variants below.

// ---------------------------------------------------------------------------
// Variant A — API-only repo (no Vite / no .public build output)
// ---------------------------------------------------------------------------
import neostandard from 'neostandard'

export default [
  ...neostandard(),
  {
    rules: {
      curly: ['error', 'all']
    }
  }
]

// ---------------------------------------------------------------------------
// Variant B — SSR/frontend repo (Vite builds to .public)
// Replace the export above with this:
// ---------------------------------------------------------------------------
// import neostandard from 'neostandard'
//
// export default [
//   ...neostandard({
//     ignores: ['.public/**']
//   }),
//   {
//     rules: {
//       curly: ['error', 'all']
//     }
//   }
// ]
