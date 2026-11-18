// What the AI page shows, and in what order:
// one row per app, one app at a time. The chat and desktop apps always come first, the ones found
// on this computer at the top, because most people use one of them; the terminal tools follow,
// folded into one line until one has the skill or the person shows them. A notice says so when no
// AI app at all is here. Once an app is Ready, Try it moves to the top.

import { compareVersions, sharing, SKILL_TARGETS, type SkillTarget, type SkillTargets, type TargetInfo } from './targets'

/** Apps Oversay can't install into: the person adds the skill themselves and says so. */
export const CHAT_APPS = ['claude-app', 'gemini-app', 'chatgpt'] as const
export type ChatApp = (typeof CHAT_APPS)[number]
export type AiApp = SkillTarget | ChatApp

export interface AiPagePlan {
  /** No command-line app, no desktop chat app, nothing added: the page says to get an AI first. */
  noAiFound: boolean
  /** The chat apps, those with a desktop app found here first. */
  chatApps: ChatApp[]
  /** Command-line apps found here, or holding a copy of the skill: a row each. */
  here: SkillTarget[]
  /** The rest, folded into one line until shown. */
  away: SkillTarget[]
  /** Apps with the skill: installed (current or not), or added by the person. */
  ready: AiApp[]
}

export function planAiPage(info: SkillTargets, added: readonly ChatApp[]): AiPagePlan {
  // A copy counts for an app not found here only when no app that is found reads it: Codex's
  // copy is also Gemini CLI's, which isn't Ready on a computer without Gemini CLI.
  const hasCopy = (t: TargetInfo) => t.installedVersion !== null && (t.found || !info.targets.some((o) => o.found && sharing(info.targets, t.id).includes(o.id)))
  const isHere = (id: SkillTarget) => info.targets.some((t) => t.id === id && (t.found || hasCopy(t)))
  const here = SKILL_TARGETS.filter(isHere)
  const desktop = Object.values(info.desktopApps).some(Boolean)
  const hasDesktop: Record<ChatApp, boolean> = { 'claude-app': info.desktopApps.claude, 'gemini-app': info.desktopApps.gemini, chatgpt: info.desktopApps.chatgpt }
  const ready = [...info.targets.filter(hasCopy).map((t) => t.id), ...CHAT_APPS.filter((id) => added.includes(id))]
  return {
    noAiFound: here.length === 0 && !desktop && added.length === 0,
    chatApps: [...CHAT_APPS.filter((id) => hasDesktop[id]), ...CHAT_APPS.filter((id) => !hasDesktop[id])],
    here,
    away: SKILL_TARGETS.filter((id) => !isHere(id)),
    ready,
  }
}

/**
 * The chat apps marked added, with the version of the skill each was given, read from
 * settings: `{ "claude-app": "0.2.0" }`. A list of ids, as an earlier version saved it, counts as added with an
 * unknown version (''); anything else there is ignored.
 */
export function addedVersions(value: unknown): Partial<Record<ChatApp, string>> {
  if (Array.isArray(value)) return Object.fromEntries(CHAT_APPS.filter((id) => value.includes(id)).map((id) => [id, '']))
  if (!value || typeof value !== 'object') return {}
  const saved = value as Record<string, unknown>
  return Object.fromEntries(CHAT_APPS.filter((id) => id in saved).map((id) => [id, typeof saved[id] === 'string' ? saved[id] : '']))
}

/** Reads the chat apps marked added from settings. */
export function addedChatApps(value: unknown): ChatApp[] {
  return Object.keys(addedVersions(value)) as ChatApp[]
}

/**
 * Chat apps given an older skill than this Oversay carries: Oversay can't update a skill in a
 * Claude, Gemini or ChatGPT account, so the person saves it again. An unknown version isn't
 * counted; a note from that skill tells (staleSkill).
 */
export function chatAppsToUpdate(value: unknown, bundledVersion: string): ChatApp[] {
  const added = addedVersions(value)
  return CHAT_APPS.filter((id) => added[id] && compareVersions(added[id]!, bundledVersion) < 0)
}
