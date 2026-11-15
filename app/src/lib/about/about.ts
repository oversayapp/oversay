// What About says about this build (013/03): the version (from the app itself, so it can't drift
// from the installer), the build's commit and date, and the platform.

import { getVersion } from '@tauri-apps/api/app'
import { invoke } from '@tauri-apps/api/core'

/**
 * The licence Oversay is released under, chosen by John on 2026-10-13: GPL-3.0 only, so a
 * company that changes and distributes it must share its source under the same licence.
 * `id` is the SPDX identifier and must match `license` in Cargo.toml and package.json and the
 * LICENSE file; a test checks that (013/03).
 */
export const OVERSAY_LICENCE = {
  id: 'GPL-3.0-only',
  name: 'GNU General Public License, version 3',
  copyright: 'Copyright © 2026 John Ryan',
} as const

export interface AboutInfo {
  name: string
  version: string
  build: string
  platform: string
}

const OS: Record<string, string> = { macos: 'macOS', windows: 'Windows' }

export function platformLabel(os: string, arch: string): string {
  const name = OS[os] ?? os
  if (os === 'macos') {
    if (arch === 'aarch64') return `${name} · Apple silicon (arm64)`
    if (arch === 'x86_64') return `${name} · Intel (x86-64)`
  }
  if (arch === 'aarch64') return `${name} · arm64`
  if (arch === 'x86_64') return `${name} · x86-64`
  return `${name} · ${arch}`
}

export function buildLabel(commit: string, date: string): string {
  return commit === 'unknown' && date === 'unknown' ? 'unknown' : `${commit} · ${date}`
}

export async function loadAbout(): Promise<AboutInfo> {
  const [version, platform] = await Promise.all([
    getVersion(),
    invoke<{ os: string; arch: string }>('platform_info'),
  ])
  return {
    name: 'Oversay',
    version,
    build: buildLabel(__BUILD_COMMIT__, __BUILD_DATE__),
    platform: platformLabel(platform.os, platform.arch),
  }
}
