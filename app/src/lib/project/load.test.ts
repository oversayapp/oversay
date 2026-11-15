import { describe, expect, it } from 'vitest'
import { specExample } from './example'
import { loadProject, ProjectFileError } from './load'

const PATH = '/talks/launch.oversay.json'
const text = (v: unknown) => JSON.stringify(v)
const clone = () => JSON.parse(JSON.stringify(specExample))

function failure(input: string, migrations?: Parameters<typeof loadProject>[2]): string {
  try {
    loadProject(input, PATH, migrations)
  } catch (e) {
    expect(e).toBeInstanceOf(ProjectFileError)
    return (e as Error).message
  }
  throw new Error('expected loadProject to throw')
}

describe('loadProject', () => {
  it('loads a valid file', () => {
    expect(loadProject(text(specExample), PATH)).toEqual(specExample)
  })

  it('names the file and says the JSON is malformed', () => {
    const msg = failure('{ "schemaVersion": 1,')
    expect(msg).toContain(PATH)
    expect(msg).toMatch(/not valid JSON/i)
  })

  it('rejects JSON that is not a project object', () => {
    expect(failure('[1,2]')).toMatch(/not an Oversay project/i)
    expect(failure('"hi"')).toMatch(/not an Oversay project/i)
  })

  it('rejects a missing or non-numeric schemaVersion', () => {
    const noVersion = clone()
    delete noVersion.schemaVersion
    expect(failure(text(noVersion))).toMatch(/schemaVersion/)
    expect(failure(text({ ...clone(), schemaVersion: 'one' }))).toMatch(/schemaVersion/)
  })

  it('says a too-new file needs a newer Oversay', () => {
    const msg = failure(text({ ...clone(), schemaVersion: 2 }))
    expect(msg).toContain(PATH)
    expect(msg).toMatch(/newer version of Oversay/i)
    expect(msg).toContain('2')
  })

  it('reports wrong types with where they are', () => {
    const bad = clone()
    bad.talks[0].segments[1].plannedSeconds = 'ninety'
    const msg = failure(text(bad))
    expect(msg).toContain(PATH)
    expect(msg).toContain('talks[0].segments[1].plannedSeconds')
    expect(msg).toMatch(/integer/)
  })

  it('reports a missing field', () => {
    const bad = clone()
    delete bad.talks[0].name
    expect(failure(text(bad))).toMatch(/talks\[0\].*name/)
  })

  it('caps a long list of problems', () => {
    const bad = clone()
    bad.talks[0].segments = Array.from({ length: 20 }, () => ({ nope: true }))
    const msg = failure(text(bad))
    expect(msg).toMatch(/and \d+ more/)
  })
})

describe('schema migration', () => {
  const fakeV0 = { schemaVersion: 0, id: 'p_old', title: 'Old name', talks: [] }

  it('runs the migration for each older version, in order, before validating', () => {
    const calls: number[] = []
    const migrations = {
      0: (d: any) => {
        calls.push(0)
        const { title, ...rest } = d
        return { ...rest, name: title, schemaVersion: 1 }
      },
    }
    const project = loadProject(text(fakeV0), PATH, migrations)
    expect(calls).toEqual([0])
    expect(project.name).toBe('Old name')
    expect(project.schemaVersion).toBe(1)
  })

  it('reports an older file with no migration path', () => {
    expect(failure(text(fakeV0), {})).toMatch(/cannot be upgraded|no migration/i)
  })

  it('still validates the migrated result', () => {
    const msg = failure(text(fakeV0), { 0: (d: any) => ({ ...d, schemaVersion: 1 }) })
    expect(msg).toMatch(/name/)
  })
})
