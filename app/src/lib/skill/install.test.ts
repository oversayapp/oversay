import { describe, expect, it } from 'vitest'
import { claudeCodeInstallPrompt, codexInstallPrompt, marketplaceAddress, MARKETPLACE_NAME } from './install'

describe('installing the skill from the repository marketplace (ADR 0049)', () => {
  it('names the repository, unpinned, so the marketplace can auto-update', () => {
    expect(marketplaceAddress()).toBe('oversayapp/oversay')
    expect(marketplaceAddress()).not.toMatch(/[#\s]/)
  })

  it('gives Claude Code both commands, auto-update, and the new session', () => {
    const prompt = claudeCodeInstallPrompt()
    expect(prompt).toContain('claude plugin marketplace add oversayapp/oversay')
    expect(prompt).toContain(`claude plugin install oversay@${MARKETPLACE_NAME}`)
    expect(prompt).toMatch(/auto-update is off.*myself/i)
    expect(prompt).toMatch(/new session/i)
  })

  it('gives Codex the commands it accepted when tried (2026-11-18)', () => {
    const prompt = codexInstallPrompt()
    expect(prompt).toContain('codex plugin marketplace add oversayapp/oversay')
    expect(prompt).toContain(`codex plugin add oversay@${MARKETPLACE_NAME}`)
  })
})
