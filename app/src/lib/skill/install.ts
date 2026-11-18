// Installing the Oversay skill from the plugin marketplace in this repository (ADR 0048): the
// address a person adds, and the install prompts that tell an AI app to add it. The marketplace file
// is written by `make skills`. Every prompt holds commands, never skill content.
//
// The address is not pinned to this app's version: a marketplace added at a tag stays at that tag,
// so it could never auto-update. The plugin's own version (pinned to the app's by `make check`)
// is what moves people, and only when a release bumps it.

export const MARKETPLACE_REPO = 'oversayapp/oversay'
/** The marketplace's own name (`name` in .claude-plugin/marketplace.json), as in `oversay@oversay`. */
export const MARKETPLACE_NAME = 'oversay'

export const marketplaceAddress = (): string => MARKETPLACE_REPO

/** For Claude Code: the two commands, then auto-update (off by default for this marketplace). */
export const claudeCodeInstallPrompt = (): string =>
  `Install the Oversay skill for me. Run these two commands, then tell me whether each worked:

claude plugin marketplace add ${MARKETPLACE_REPO}
claude plugin install oversay@${MARKETPLACE_NAME}

Then turn on auto-update for the "${MARKETPLACE_NAME}" marketplace (in /plugin, under Marketplaces), so a new Oversay release reaches me, and tell me to start a new session so the skill loads.`

/** For Codex, which reads the same marketplace file. */
export const codexInstallPrompt = (): string =>
  `Install the Oversay skill for me. Run these two commands, then tell me whether each worked:

codex plugin marketplace add ${MARKETPLACE_REPO}
codex plugin add oversay@${MARKETPLACE_NAME}

Then tell me to start a new Codex session so the skill loads. To update it later: codex plugin marketplace upgrade.`
