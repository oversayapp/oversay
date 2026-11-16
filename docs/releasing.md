# Releasing Oversay

How versions are numbered, how a release is cut, and what each build does about updates. The decisions are in [ADR 0030](../.adr/0030-the-updater-is-built-now-and-its-feed-waits-until-oversay-goes-public.md): nothing is public yet, so releases are private and no build handed out checks for updates.

## Versions

- The version is set in one place, `app/package.json`. `tauri.conf.json` reads it; `make check` fails when `Cargo.toml` differs.
- Change it only with the script, which sets `package.json`, `package-lock.json`, `Cargo.toml` and `Cargo.lock` together:

  ```bash
  node scripts/version.mjs 0.2.0
  ```

- Plain `X.Y.Z` only: the Windows `.msi` takes no pre-release text such as `-beta.1`.
- Until 1.0: the minor number for new features, the patch number for fixes only. The first release is 0.2.0, newer than every 0.1.0 build already handed out.

## What CI builds

- **Every push and PR:** the checks only (`make check`), on Linux. A newer push to the same branch cancels the older run.
- **A version tag:** the checks, the Windows and macOS installers, and a private release (below). The macOS build is **signed and notarized** ([macOS signing](platform/macos-signing.md)).
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
   - **tagged-release** makes a **private** release named after the tag, in this repository, with the files below.
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

## What a build does about updates

Nothing about updates is in `tauri.conf.json`. Each build writes the extra config it merges in with `scripts/build-config.mjs`, from these settings in the repository (Settings › Secrets and variables › Actions):

| Setting | Kind | Effect |
| --- | --- | --- |
| `OVERSAY_UPDATE_FEED` | variable | The `https://` address of `latest.json`. With `OVERSAY_UPDATE_PUBKEY`, the build checks for updates there. |
| `OVERSAY_UPDATE_PUBKEY` | variable | The public half of the update key, which every update package must be signed with. |
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | secrets | The build also makes signed update packages. |
| `OVERSAY_UPDATE_FILES` | variable | Where `latest.json` says the packages are downloaded from. Unset, it names the private release, which the app can't read. |

None of them is set until Oversay goes public. So today a build never checks for updates: the app doesn't even register the updater, so it makes no request. `make dev` and local builds don't either.

## Test builds for the hands-on checks

The updater is tested against a feed on John's own machine or network, never a hosted one:

1. Make a throwaway key on the test machine, never committed:
   `npx tauri signer generate -w ~/oversay-test.key`
   Put the private key and its password in the two signing secrets. Builds then also make update packages signed with it; the release key replaces them with the release key.
2. On a branch with the older version, run the Build workflow by hand (Actions › Build › Run workflow), with **feed** set to the local `latest.json` address and **pubkey** set to the contents of `~/oversay-test.key.pub`. A build with a feed never replaces the rolling `latest` pre-release. Install what it builds.
3. Bump the version, run it again the same way, then write `latest.json` for the newer files and serve the folder over HTTPS:
   `node scripts/latest-json.mjs --dir <folder> --version 0.2.1 --base https://<address>/`
4. Start the older install and let it find the newer one.

Pass `--page https://<where the release can be read>` to `latest-json.mjs` too: it becomes `release_page`, the link the portable `.exe` shows in place of an install button. Without it, that build says an update exists and shows no link.

## What the app does with an update

- **Start-up:** with automatic checking on (Settings › Updates; default on), the app asks the feed every time it starts (the maintainer's answer, 2026-11-16). `updates.everyHours` in `settings.json` can set a least time between checks; 0, the default, is every start. A start-up check that finds nothing, or can't reach the feed, shows nothing.
- **Found:** an Update item appears in the rail and a pill in the header; both open Settings › Updates, which shows the version and notes and the **Update and restart** button (macOS app, Windows NSIS and `.msi`). The portable `.exe` shows **Open the release page** instead.
- **Check for updates** works with automatic checking off, and says plainly when it is up to date or the feed can't be reached.
- **During a session** (a session open, started or not) Rust refuses to check or install: no request, nothing changes on screen, no restart.
- **A build with no feed** has no Updates section and never asks (the updater plugin isn't registered).

The updater accepts only `https://` addresses with a certificate the test machine trusts. A local certificate authority such as mkcert, installed on each test machine, or Tailscale's `tailscale serve`, gives one without publishing anything.

## The update key

The release key is made with the feed when Oversay goes public, never before: see ADR 0030 for how it is made and backed up. If it is lost, installed copies can never update again.
