// Canonical vite.config.js for an SSR/frontend Defra Node service.
//
// Replaces webpack. Builds `src/client` into `.public/` with a manifest
// (`assets-manifest.json`). The Nunjucks context reads that manifest to resolve
// hashed asset filenames (see the Webpack -> Vite migration section of the playbook).
//
// Canonical asset folder naming is `javascripts/` (plural). Some older repos used
// `javascript/` (singular) with `src/client/javascript/` — standardise to plural.
//
// SCSS uses sass's NodePackageImporter so `@use "govuk-frontend"` resolves from
// node_modules. The copy-static-assets plugin copies govuk-frontend fonts/images
// and your own images into `.public/assets` at build time.
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { cp } from 'node:fs/promises'
import { defineConfig } from 'vite'
import { NodePackageImporter } from 'sass'

const dirname = import.meta.dirname

const govukFrontendPath = path.dirname(
  fileURLToPath(import.meta.resolve('govuk-frontend/package.json'))
)

export default defineConfig(({ mode }) => ({
  root: path.resolve(dirname, 'src/client'),
  build: {
    outDir: path.resolve(dirname, '.public'),
    emptyOutDir: true,
    manifest: 'assets-manifest.json',
    sourcemap: mode === 'production' ? true : 'inline',
    rollupOptions: {
      input: {
        application: path.resolve(dirname, 'src/client/javascripts/application.js')
      },
      output: {
        entryFileNames: mode === 'production'
          ? 'javascripts/[name].[hash:7].min.js'
          : 'javascripts/[name].js',
        chunkFileNames: mode === 'production'
          ? 'javascripts/[name].[hash:7].min.js'
          : 'javascripts/[name].js',
        assetFileNames: ({ names }) => {
          const name = names[0] ?? ''
          if (/\.css$/.test(name)) {
            return mode === 'production'
              ? 'stylesheets/[name].[hash:7].min.css'
              : 'stylesheets/[name].css'
          }
          if (/\.(woff2?|eot|ttf|otf)$/.test(name)) {
            return 'assets/fonts/[name][extname]'
          }
          return 'assets/images/[name][extname]'
        }
      }
    }
  },
  css: {
    lightningcss: {
      errorRecovery: true
    },
    preprocessorOptions: {
      scss: {
        importers: [new NodePackageImporter()],
        loadPaths: [
          path.resolve(dirname, 'src/client/stylesheets'),
          path.resolve(dirname, 'src/views/macros')
        ],
        quietDeps: true,
        sourceMapIncludeSources: true
      }
    }
  },
  plugins: [
    {
      name: 'copy-static-assets',
      apply: 'build',
      async writeBundle () {
        await cp(
          path.join(govukFrontendPath, 'dist/govuk/assets'),
          path.resolve(dirname, '.public/assets'),
          { recursive: true }
        )
        await cp(
          path.resolve(dirname, 'src/client/images'),
          path.resolve(dirname, '.public/assets/images'),
          { recursive: true }
        )
      }
    }
  ]
}))
