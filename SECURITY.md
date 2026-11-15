# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately, either way:

- Use GitHub's **Report a vulnerability** button on this repository's Security tab.
- Or email **support@oversay.app** with "Security" in the subject.

Say what you found, how to reproduce it, and which version or commit you tried. You will get a reply within a few days. Oversay is maintained by one person, so a fix may take longer; you will be told where it stands.

## Supported versions

Oversay has not had a public release yet. Until it does, only the latest commit on `main` is supported. After 0.2.0, only the latest release is.

## What is in scope

The desktop app in `app/`, the `oversay://` link handler, the skill in `skills/oversay`, the build and release workflow in `.github/`, and the installers it produces.

Previous reviews and what came of them are in [`docs/security/`](docs/security/).

## A known limitation

Hiding overlays from screen sharing relies on operating-system features that some sharing apps ignore, especially on recent macOS. Treat it as a convenience, not a guarantee. See [`docs/platform/`](docs/platform/).
