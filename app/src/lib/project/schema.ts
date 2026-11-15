import type { ErrorObject } from 'ajv'
// Compiled from project-schema.ts when the app is built (vite.config.ts), not at run time: Ajv's
// run-time compile needs eval, which the Content Security Policy forbids.
import validate from 'virtual:project-validator'

export { projectSchema } from './project-schema'

export type ValidationResult = { ok: true } | { ok: false; errors: string[] }

/** `/talks/0/segments/1/kind` becomes `talks[0].segments[1].kind`. */
function describePath(instancePath: string): string {
  return instancePath
    .split('/')
    .filter(Boolean)
    .reduce((out, part) => (/^\d+$/.test(part) ? `${out}[${part}]` : out ? `${out}.${part}` : part), '')
}

function describeError(e: ErrorObject): string {
  const where = describePath(e.instancePath) || 'the file'
  if (e.keyword === 'required') return `${where} is missing "${e.params.missingProperty}"`
  if (e.keyword === 'enum') return `${where} must be one of: ${e.params.allowedValues.join(', ')}`
  return `${where} ${e.message}`
}

export function validateProject(data: unknown): ValidationResult {
  if (validate(data)) return { ok: true }
  return { ok: false, errors: (validate.errors ?? []).map(describeError) }
}
