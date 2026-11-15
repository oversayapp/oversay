import { SCHEMA_VERSION, type Project } from './types'
import { validateProject } from './schema'

/** A problem with a project file, phrased for the person who opened it. */
export class ProjectFileError extends Error {
  constructor(path: string, problem: string) {
    super(`${path}\n${problem}`)
    this.name = 'ProjectFileError'
  }
}

/** Upgrades a file one version at a time: `migrations[n]` turns a version n file into n + 1. */
export type Migrations = Record<number, (data: Record<string, unknown>) => Record<string, unknown>>

// No migrations yet: version 1 is the first schema.
export const MIGRATIONS: Migrations = {}

const MAX_PROBLEMS = 5

/** Reads, migrates and validates a project file's text. Throws `ProjectFileError`. */
export function loadProject(text: string, path: string, migrations: Migrations = MIGRATIONS): Project {
  const fail = (problem: string) => new ProjectFileError(path, problem)

  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (e) {
    throw fail(`This file is not valid JSON: ${e instanceof Error ? e.message : e}`)
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw fail('This is not an Oversay project file (expected a JSON object).')
  }

  let doc = data as Record<string, unknown>
  let version = doc.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
    throw fail('This is not an Oversay project file: "schemaVersion" is missing or not a whole number.')
  }
  if (version > SCHEMA_VERSION) {
    throw fail(
      `This file was saved by a newer version of Oversay (file format ${version}; this version reads up to ${SCHEMA_VERSION}). Update Oversay to open it.`,
    )
  }
  while (version < SCHEMA_VERSION) {
    const migrate = migrations[version]
    if (!migrate) {
      throw fail(`This file uses an old format (${version}) that cannot be upgraded: no migration exists.`)
    }
    doc = migrate(doc)
    version = doc.schemaVersion
    if (typeof version !== 'number') {
      throw fail('Upgrading this file from an older format failed: the result has no "schemaVersion".')
    }
  }

  const result = validateProject(doc)
  if (!result.ok) {
    const shown = result.errors.slice(0, MAX_PROBLEMS)
    const more = result.errors.length - shown.length
    const lines = shown.map((e) => `• ${e}`)
    if (more > 0) lines.push(`• …and ${more} more`)
    throw fail(`This file does not look like a valid project:\n${lines.join('\n')}`)
  }
  return doc as unknown as Project
}
