import { svelte } from '@sveltejs/vite-plugin-svelte'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { Ajv } from 'ajv'
import standalone from 'ajv/dist/standalone/index.js'
import { defineConfig, type Plugin } from 'vitest/config'
import { projectSchema } from './src/lib/project/project-schema.ts'

// The build's commit and its date, for About (013/03): a tester can say exactly which build they have.
// "-dirty" marks a build with uncommitted changes to tracked files (untracked files do not count,
// or a stray local folder would mark every build). Outside a git checkout both are "unknown".
function git(...args: string[]): string {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}
const commit = git('rev-parse', '--short', 'HEAD')
const dirty = git('status', '--porcelain', '--untracked-files=no') !== ''

// Tauri expects a fixed dev port and needs to see Rust errors in the terminal.
// `make dev PORT=…` sets OVERSAY_DEV_PORT so several worktrees can run at once.
const port = Number(process.env.OVERSAY_DEV_PORT ?? 1420)

// The project file's validator, compiled here as plain code (`virtual:project-validator`): compiling
// it in the app would need eval, which the Content Security Policy forbids.
function projectValidator(): Plugin {
  const id = 'virtual:project-validator'
  return {
    name: 'project-validator',
    resolveId: (source) => (source === id ? '\0' + id : undefined),
    load(resolved) {
      if (resolved !== '\0' + id) return
      const ajv = new Ajv({ allErrors: true, code: { source: true, esm: true } })
      const code = standalone.default(ajv, ajv.compile(projectSchema))
      // Ajv still writes its one helper as a require; a string's length in code points does the same.
      const out = code.replace('require("ajv/dist/runtime/ucs2length").default', '((s) => [...s].length)')
      if (out.includes('require(')) throw new Error('project-validator: the compiled schema needs another Ajv helper')
      return out
    },
  }
}

// The dev server sends the dev Content Security Policy from tauri.conf.json as a header, so
// `make dev` and `make shots` load every page under the policy a built app has.
function devCsp(): Plugin {
  const conf = JSON.parse(readFileSync(new URL('./src-tauri/tauri.conf.json', import.meta.url), 'utf8'))
  const header = Object.entries<string>(conf.app.security.devCsp)
    .map(([directive, sources]) => `${directive} ${sources}`)
    .join('; ')
  return {
    name: 'dev-csp',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Content-Security-Policy', header)
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [svelte(), projectValidator(), devCsp()],
  define: {
    __BUILD_COMMIT__: JSON.stringify(commit ? commit + (dirty ? '-dirty' : '') : 'unknown'),
    __BUILD_DATE__: JSON.stringify(git('log', '-1', '--format=%cs') || 'unknown'),
  },
  clearScreen: false,
  server: {
    port,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
