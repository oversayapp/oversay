import { describe, expect, it } from 'vitest'
import { buildLabel, OVERSAY_LICENCE, platformLabel } from './about'
import pkg from '../../../package.json'
import cargoToml from '../../../src-tauri/Cargo.toml?raw'
import licenceFile from '../../../../LICENSE?raw'

describe('platform label', () => {
  it('names the operating system and architecture in words', () => {
    expect(platformLabel('macos', 'aarch64')).toBe('macOS · Apple silicon (arm64)')
    expect(platformLabel('macos', 'x86_64')).toBe('macOS · Intel (x86-64)')
    expect(platformLabel('windows', 'x86_64')).toBe('Windows · x86-64')
    expect(platformLabel('windows', 'aarch64')).toBe('Windows · arm64')
  })

  it('passes through anything it does not know', () => {
    expect(platformLabel('linux', 'riscv64')).toBe('linux · riscv64')
  })
})

describe('build label', () => {
  it('shows the commit and its date', () => {
    expect(buildLabel('a1b2c3d', '2026-10-13')).toBe('a1b2c3d · 2026-10-13')
  })

  it('says so when the build has no git information', () => {
    expect(buildLabel('unknown', 'unknown')).toBe('unknown')
  })
})

describe('the licence', () => {
  // The file, the packages and About must agree (013/03).
  it('is the one in package.json and Cargo.toml', () => {
    expect(pkg.license).toBe(OVERSAY_LICENCE.id)
    expect(cargoToml).toMatch(new RegExp(`^license = "${OVERSAY_LICENCE.id}"$`, 'm'))
  })

  it('is the text in the LICENSE file', () => {
    expect(licenceFile).toContain('GNU GENERAL PUBLIC LICENSE')
    expect(licenceFile).toContain('Version 3, 29 June 2007')
  })
})
