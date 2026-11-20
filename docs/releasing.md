# Releasing Oversay

How versions are numbered, how a release is cut, and what each build does about updates. The decisions are in [ADR 0030](../.adr/0030-the-updater-is-built-now-and-its-feed-waits-until-oversay-goes-public.md) (versions, tagged releases, no token in the app) and [ADR 0044](../.adr/0044-the-update-feed-is-a-redirect-to-the-public-repositorys-latest-release.md) (where the feed lives). Until the settings below are set, no build checks for updates, and releases stay private while this repository is.

## Versions

- The version is set in one place, `app/package.json`. `tauri.conf.json` reads it; `make check` fails when `Cargo.toml` differs.
- Change it only with the script, which sets `package.json`, `package-lock.json`, `Cargo.toml` and `Cargo.lock` together and then runs `make skills`, because the Oversay skill's files embed the version (`SKILL.md`, and the plugin in `plugins/oversay/` and the marketplace in `.claude-plugin/marketplace.json`, both written by `make skills` from `skills/oversay`). `make check` and the release job fail when any of them differs, or when a hand edit has changed a generated file (ADR 0049):

  ```bash
  node scripts/version.mjs 0.2.0
  ```

- Plain `X.Y.Z` only: the Windows `.msi` takes no pre-release text such as `-beta.1`.
- Until 1.0: the minor number for new features, the patch number for fixes only. The first release is 0.2.0, newer than every 0.1.0 build already handed out.

## The skill's release files

A tagged release carries `oversay-skill.zip` and `oversay-plugin.zip`, made by the built macOS app (`Oversay --package-skill skills/oversay <folder>`), the code behind the AI page's Save… buttons, so they cannot differ from the app's. The release job runs `node scripts/version.mjs --zips release` and fails before publishing when either zip does not carry the release's version. People who add this repository as a marketplace get the plugin from `main`, whose version moves only when a release commit bumps it.

## What CI builds

- **Every push and PR:** the checks only (`make check`), on Linux. A newer push to the same branch cancels the older run.
- **A version tag:** the checks, the Windows and macOS installers, and a release (below; private while this repository is). The macOS build is **signed and notarized** ([macOS signing](platform/macos-signing.md)).
- **By hand:** Actions › Build › Run workflow, on any branch, builds the installers. On `main`, it also replaces the rolling `latest` pre-release, for John's own testing. Tick **sign** to sign and notarize the macOS build; unticked, it is unsigned. The `latest` pre-release's notes say whether its macOS build is signed.

Merging to `main` no longer builds installers (22 Oct). On the free plan, a Windows minute counts twice and a macOS minute ten times against the monthly allowance. Building on every merge used up October's allowance.

## Cutting a release

1. On a branch, bump the version with the script and merge it to `main` through a PR, as for any change.
2. **Security audit**. On the merged `main`, ask the agent for a security audit of the repository.
   - **Output stays outside the repo:** keep the raw output of the run outside the repo; only its summary is recorded (below).
   - **A confirmed finding blocks the tag** until it is fixed through a PR, or until John accepts it, with the reason written in the tag's message.
   - **Unconfirmed leads** (suspected but not proven) go to John to decide on.
   - **Record the run:** add its summary to `docs/security/` through a PR, before tagging.
3. On the merged `main`, tag that commit with what changed as the tag's message. The message becomes the release notes and, once there is a feed, the notes the app shows:

   ```bash
   git switch main && git pull
   git tag -a v0.2.0 -m "Overlay opacity: a slider in Settings › Overlays
   The Edge strip keeps to the bottom edge
   Fixed: bold inside italic in talking points"
   git push origin v0.2.0
   ```

4. CI's Build workflow runs for the tag:
   - **checks** fails at once if the tag isn't `v` plus `package.json`'s version;
   - **windows** and **macos** build the installers;
   - **tagged-release** makes a release named after the tag (private while this repository is, public once it is), in this repository, with the files below.
   - **homebrew** then points the Homebrew cask at the new `.dmg` (below).
5. Hand the installers out as before.

What the release holds:

| File | What it is |
| --- | --- |
| `Oversay_X.Y.Z_x64-setup.exe` | Windows installer for the current user (NSIS); no administrator rights to install or update |
| `Oversay_X.Y.Z_x64_en-US.msi` | Windows installer for all users, for IT departments |
| `Oversay_portable_x64.exe` | Windows, nothing installed; can't update itself |
| `Oversay_X.Y.Z_universal.dmg` | macOS, Apple silicon and Intel |
| `Oversay.app.tar.gz`, `*.sig`, `latest.json` | The update packages, their signatures, and the file the updater reads. Only when the signing key secret exists |

A wrong tag can be deleted and pushed again (`git push --delete origin v0.2.0`) as long as nobody has installed from it. A version number is never reused once something has been handed out.

## Homebrew

Mac users install with `brew install oversayapp/tap/oversay`. The cask, `Casks/oversay.rb` in [oversayapp/homebrew-tap](https://github.com/oversayapp/homebrew-tap), names the release's `Oversay_X.Y.Z_universal.dmg` and its sha256. The app updates itself (`auto_updates true`); the cask has to be current for new installs and for `brew upgrade`.

After **tagged-release**, the **homebrew** job runs `scripts/homebrew-cask.mjs` on the `.dmg` the macOS job built, which sets `version` and `sha256` in the cask, then commits and pushes it to the tap. It pushes with `HOMEBREW_TAP_TOKEN`, a secret in the `release` environment: a fine-grained token with **Contents: read and write** on `oversayapp/homebrew-tap` only. When the token expires, make a new one and replace the secret. If the job fails, the release is still published; re-run the job, or update the cask by hand:

```bash
gh repo clone oversayapp/homebrew-tap /tmp/homebrew-tap
gh release download v0.5.0 -p 'Oversay_0.5.0_universal.dmg' -D /tmp
node scripts/homebrew-cask.mjs --cask /tmp/homebrew-tap/Casks/oversay.rb --version 0.5.0 --dmg /tmp/Oversay_0.5.0_universal.dmg
git -C /tmp/homebrew-tap commit -am "Oversay 0.5.0" && git -C /tmp/homebrew-tap push
```

Check it with `brew update && brew upgrade oversay` on a Mac that has it, and `brew audit --cask --online oversayapp/tap/oversay` (Homebrew asks you to trust the tap first; `brew install oversayapp/tap/oversay` does that). `--new` also fails until Oversay is popular enough for Homebrew's own list, which is a later step.

## What a build does about updates

Nothing about updates is in `tauri.conf.json`. Each build writes the extra config it merges in with `scripts/build-config.mjs`, from these settings in the repository (Settings › Secrets and variables › Actions):

| Setting | Kind | Effect |
| --- | --- | --- |
| `OVERSAY_UPDATE_FEED` | variable | The `https://` address of `latest.json`. With `OVERSAY_UPDATE_PUBKEY`, the build checks for updates there. |
| `OVERSAY_UPDATE_PUBKEY` | variable | The public half of the update key, which every update package must be signed with. |
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | secrets | The build also makes signed update packages. |
| `OVERSAY_UPDATE_FILES` | variable | Where `latest.json` says the packages are downloaded from. Unset, it names this repository's release, which the app can read once the repository is public (ADR 0044). |

None of them is set yet; setting them is the first step of the first release (ADR 0044). Until then a build never checks for updates: the app doesn't even register the updater, so it makes no request. `make dev` and local builds don't either.

## Test builds for the hands-on checks

The updater is tested against a feed on John's own machine or network, never a hosted one:

1. Make a throwaway key on the test machine, never committed:
   `npx tauri signer generate -w ~/oversay-test.key`
   Put the private key and its password in the two signing secrets. Builds then also make update packages signed with it; the release key replaces them with the release key.
2. On a branch with the older version, run the Build workflow by hand (Actions › Build › Run workflow), with **feed** set to the local `latest.json` address and **pubkey** set to the contents of `~/oversay-test.key.pub`. A build with a feed never replaces the rolling `latest` pre-release. Install what it builds.
3. Bump the version, run it again the same way, then write `latest.json` for the newer files and serve the folder over HTTPS:
   `node scripts/latest-json.mjs --dir <folder> --version 0.2.1 --base https://<address>/`
4. Start the older install and let it find the newer one.

Pass `--page https://<where the release can be read>` to `latest-json.mjs` too: it becomes `release_page`, the link the portable `.exe` shows in place of an install button. Without it, that build says an update exists and shows no link. The release job passes the tag's release page; v0.4.0's `latest.json` was made before it did, so it has none.

## What the app does with an update

- **Start-up:** with automatic checking on (Settings › Updates; default on), the app asks the feed every time it starts (decided and final: the maintainer, 2026-11-17). `updates.everyHours` in `settings.json` can set a least time between checks; 0, the default, is every start. A start-up check that finds nothing, or can't reach the feed, shows nothing.
- **Found:** an Update item appears in the rail and a pill in the header; both open Settings › Updates, which shows the version and notes and the **Update and restart** button (macOS app, Windows NSIS and `.msi`). The portable `.exe` shows **Open the release page** instead.
- **Check for updates** works with automatic checking off, and says plainly when it is up to date or the feed can't be reached.
- **During a session** (a session open, started or not) Rust refuses to check or install: no request, nothing changes on screen, no restart.
- **A build with no feed** has no Updates section and never asks (the updater plugin isn't registered).

**On a Mac, `scripts/update-test.sh` does steps 1 to 4 locally** with no CI and no repository secret: `brew install mkcert` and `mkcert -install` once, then `setup` (a throwaway key and a certificate in `out/update-test/`, never committed), `build 0.0.1`, `build 0.0.2`, `serve 0.0.2`. Install `out/update-test/builds/0.0.1/Oversay.app` into `/Applications` and start it while the feed is served. The version is a build-time override, so no tracked file changes. Windows still goes through CI or a Windows machine.

The updater accepts only `https://` addresses with a certificate the test machine trusts. A local certificate authority such as mkcert, installed on each test machine, or Tailscale's `tailscale serve`, gives one without publishing anything.

## The update key

The release key is made by John on his own Mac before the first release, with its password in the password manager and an offline copy: see ADR 0044. If it is lost, installed copies can never update again.
