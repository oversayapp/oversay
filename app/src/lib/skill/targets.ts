// The AI apps Oversay installs its skill into (ADR 0033), and what their AI page row says.
// Rust (skill.rs) finds each app's skills folder and copies the skill bundled in Oversay there;
// this decides the row's state from what it found.

import { invoke } from '@tauri-apps/api/core'

/** Same ids as `Target` in skill.rs; both sides test them. */
export const SKILL_TARGETS = ['claude-code', 'codex', 'gemini-cli'] as const
export type SkillTarget = (typeof SKILL_TARGETS)[number]

export interface TargetInfo {
  id: SkillTarget
  /** The app's own folder (`~/.claude`, `~/.codex`) is there: it looks installed on this computer. */
  found: boolean
  /** Where the skill goes, for showing. */
  dir: string
  /** The version of the copy there, or null when there is none. */
  installedVersion: string | null
}

export interface SkillTargets {
  /** The skill Oversay carries: always the app's own version. */
  bundledVersion: string
  /** Where it is inside Oversay, for doing it by hand when Install fails. */
  bundledDir: string
  targets: TargetInfo[]
  /** The chat apps' desktop apps found here; a chat in a browser can't be seen. */
  desktopApps: { claude: boolean; chatgpt: boolean; gemini: boolean }
  /** Targets whose copy Oversay updated when it started this time. */
  updated: SkillTarget[]
}

/**
 * - `no-app`: the AI app doesn't seem to be on this computer (Install still works);
 * - `not-installed`, `installed`;
 * - `update`: the copy is older than the skill this Oversay carries.
 */
export type SkillState = 'no-app' | 'not-installed' | 'installed' | 'update'

/** Compares `X.Y.Z` versions; anything unreadable counts as oldest. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : [-1, -1, -1])
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]
  return 0
}

export function skillState(target: Pick<TargetInfo, 'found' | 'installedVersion'>, bundledVersion: string): SkillState {
  if (target.installedVersion !== null) return compareVersions(target.installedVersion, bundledVersion) < 0 ? 'update' : 'installed'
  return target.found ? 'not-installed' : 'no-app'
}

export const TARGET_LABELS: Record<SkillTarget, { name: string; where: string; abbr: string }> = {
  'claude-code': { name: 'Claude Code', where: 'The terminal, the Claude desktop app’s Code tab, VS Code and JetBrains', abbr: 'CC' },
  codex: { name: 'Codex', where: 'Codex CLI, the IDE extension, and Codex in the ChatGPT desktop app', abbr: 'CX' },
  'gemini-cli': { name: 'Gemini CLI', where: 'Gemini CLI, and Antigravity CLI (agy), which replaced it for personal Google accounts in June 2026', abbr: '>_' },
}

/** The other targets reading the same copy of the skill (Codex and Gemini CLI share `~/.agents/skills`). */
export function sharing(targets: readonly Pick<TargetInfo, 'id' | 'dir'>[], id: SkillTarget): SkillTarget[] {
  const dir = targets.find((t) => t.id === id)?.dir
  return targets.filter((t) => t.id !== id && t.dir === dir).map((t) => t.id)
}

export const skillTargets = () => invoke<SkillTargets>('skill_targets')
/** Copies the skill into the app's folder (replacing a copy there) and returns where. */
export const installSkill = (target: SkillTarget) => invoke<string>('install_skill', { target })
/** Moves the app's copy to the Trash. */
export const removeSkill = (target: SkillTarget) => invoke<void>('remove_skill', { target })
/** Shows the app's copy in Finder or Explorer. */
export const revealSkill = (target: SkillTarget) => invoke<void>('reveal_skill', { target })

/** What Save… writes. Same names as `ZipKind` in skill.rs; both sides test them. */
export const ZIP_KINDS = ['claude-plugin', 'skill'] as const
export type ZipKind = (typeof ZIP_KINDS)[number]

/** Writes the skill as `kind` to `path` (a .zip from the save dialog) and shows it. */
export const saveSkillZip = (kind: ZipKind, path: string) => invoke<void>('save_skill_zip', { kind, path })
