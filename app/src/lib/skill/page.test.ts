import { describe, expect, it } from 'vitest'
import { addedChatApps, addedVersions, chatAppsToUpdate, planAiPage } from './page'
import type { SkillTargets, TargetInfo } from './targets'

const target = (id: TargetInfo['id'], found: boolean, installedVersion: string | null = null): TargetInfo => ({ id, found, dir: `/h/${id}`, installedVersion })
const info = (targets: TargetInfo[], desktop = { claude: false, chatgpt: false, gemini: false }): SkillTargets => ({
  bundledVersion: '0.2.0',
  bundledDir: '/b',
  targets,
  desktopApps: desktop,
  updated: [],
})

describe('the AI page plan', () => {
  it('puts apps on this computer first, and folds the ones not found', () => {
    const plan = planAiPage(info([target('claude-code', true), target('codex', false), target('gemini-cli', false)]), [])
    expect(plan.chatFirst).toBe(false)
    expect(plan.here).toEqual(['claude-code'])
    expect(plan.away).toEqual(['codex', 'gemini-cli'])
    expect(plan.noAiFound).toBe(false)
    expect(plan.ready).toEqual([])
  })

  it('says no AI app was found, and puts the chat apps first, when nothing is here', () => {
    const plan = planAiPage(info([target('claude-code', false), target('codex', false), target('gemini-cli', false)]), [])
    expect(plan.noAiFound).toBe(true)
    expect(plan.chatFirst).toBe(true)
    expect(plan.away).toEqual(['claude-code', 'codex', 'gemini-cli'])
  })

  it('puts the chat apps first for someone with only a desktop chat app, without the notice', () => {
    const plan = planAiPage(info([target('claude-code', false), target('codex', false)], { claude: true, chatgpt: false, gemini: false }), [])
    expect(plan.noAiFound).toBe(false)
    expect(plan.chatFirst).toBe(true)
  })

  it('counts a copy of the skill as here, even where the app looks gone', () => {
    const plan = planAiPage(info([target('claude-code', false, '0.1.0'), target('codex', false)]), [])
    expect(plan.here).toEqual(['claude-code'])
    expect(plan.ready).toEqual(['claude-code'])
    expect(plan.chatFirst).toBe(false)
  })

  it('leaves an app out of Codex’s copy when it isn’t here', () => {
    const targets = [target('claude-code', false), target('codex', true, '0.2.0'), { ...target('gemini-cli', false, '0.2.0'), dir: '/h/codex' }]
    const plan = planAiPage(info(targets), [])
    expect(plan.ready).toEqual(['codex'])
    expect(plan.away).toEqual(['claude-code', 'gemini-cli'])
  })

  it('makes an app Ready once installed, or once the person says they added it', () => {
    const plan = planAiPage(info([target('claude-code', true), target('codex', true, '0.2.0'), target('gemini-cli', false, '0.2.0')]), ['chatgpt', 'gemini-app'])
    expect(plan.ready).toEqual(['codex', 'gemini-cli', 'gemini-app', 'chatgpt'])
    expect(plan.noAiFound).toBe(false)
  })
})

describe('chat apps marked added', () => {
  it('keeps only the ids it knows', () => {
    expect(addedChatApps(['chatgpt', 'nope', 3, 'gemini-app'])).toEqual(['gemini-app', 'chatgpt'])
    expect(addedChatApps('chatgpt')).toEqual([])
    expect(addedChatApps(undefined)).toEqual([])
  })
})

describe('chat apps added, with their versions', () => {
  it('reads the list an earlier version saved as added with an unknown version', () => {
    expect(addedVersions(['claude-app', 'nonsense'])).toEqual({ 'claude-app': '' })
    expect(addedChatApps(['chatgpt'])).toEqual(['chatgpt'])
  })

  it('reads versions, and ignores anything else', () => {
    expect(addedVersions({ 'gemini-app': '0.1.0', other: '1.0.0', chatgpt: 3 })).toEqual({ 'gemini-app': '0.1.0', chatgpt: '' })
    expect(addedVersions(null)).toEqual({})
    expect(addedVersions('claude-app')).toEqual({})
  })

  it('finds the ones given an older skill, but not an unknown one', () => {
    const saved = { 'claude-app': '0.1.0', 'gemini-app': '0.2.0', chatgpt: '' }
    expect(chatAppsToUpdate(saved, '0.2.0')).toEqual(['claude-app'])
    expect(chatAppsToUpdate(saved, '0.1.0')).toEqual([])
  })
})
