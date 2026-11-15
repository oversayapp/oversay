// Set by `define` in vite.config.ts at build time.
declare const __BUILD_COMMIT__: string
declare const __BUILD_DATE__: string

// The project file's validator, compiled at build time (vite.config.ts).
declare module 'virtual:project-validator' {
  import type { ValidateFunction } from 'ajv'
  const validate: ValidateFunction
  export default validate
}
