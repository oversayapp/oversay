# Contributing

Thanks for your interest in Oversay.

## Before you start

- **Bugs:** open an issue with the steps to reproduce, your operating system and the app version.
- **Ideas and larger changes:** open an issue first and wait for a reply. Oversay is a small project with a defined scope ([`docs/spec.md`](docs/spec.md)), and a pull request for something that was not agreed may not be merged.
- **Security problems:** do not use an issue; see [SECURITY.md](SECURITY.md).

## Making a change

1. Fork the repository and make a branch from `main`.
2. Set up the tools: `make setup` once (macOS; it installs the tools, the app's packages and the git hooks, and `make doctor` checks them). On another system install [mise](https://mise.jdx.dev), then run `mise install`, `npm ci` in `app/` and `make hooks`. Each commit is then checked for secrets and linted.
3. Follow [`CODING_STANDARDS.md`](CODING_STANDARDS.md), which is also what a review checks against.
4. Run `make check` and make sure it exits 0. Before opening the pull request run `make pr-checks`, which adds a secrets scan of your commits and `npm audit`.
5. Open a pull request against `main`, explain what changed and why, and link the issue.

`main` changes only through reviewed pull requests.

## Decisions

Choices that are hard to reverse are recorded in [`.adr/`](.adr/). If your change contradicts one, say so in the issue.

## Licence

Oversay is licensed under [GPL-3.0-only](LICENSE). By contributing, you agree that your contribution is licensed the same way.

## Conduct

Be kind and assume good faith. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
