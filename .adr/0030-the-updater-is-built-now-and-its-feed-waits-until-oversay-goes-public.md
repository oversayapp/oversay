---
status: proposed; its feed decision is superseded by 0044
date: 2026-10-21
---

# The updater is built now, and its feed waits until Oversay goes public

Oversay is to find and install its own updates. Tauri's updater plugin reads a small `latest.json` (the version, notes, and per platform a package URL and its signature) from an HTTPS address, downloads the package, checks its signature against a public key compiled into the app, and replaces the app. This is the spike; nothing is built here.

An installed copy can only read that file from somewhere open to anyone, or from somewhere guarded by a token that ships inside the app, where anyone with a copy could dig it out. John ruled out anything public on 16 Oct: Oversay is not to be public or publicly available in any shape or form yet. That rules out the first draft of this ADR, a public releases-only repository.

## Decision

- **The updater is built now, with no feed.** The plugin, the update key, the screens in the update mockup, the versions and the release job below are built and tested in this epic. Where `latest.json` lives is decided when Oversay goes public, as its own task.
- **No build handed out before then checks for updates.**
  - The feed address and public key are not in `tauri.conf.json`. A build is given them from CI settings, and merges them in as the updater's config (`scripts/build-config.mjs`, `tauri build --config`; `docs/releasing.md` lists the settings).
  - The app registers the updater only when that config is there. A build without it never makes a request, and Settings has no Updates section.
  - Testers keep installing new versions by hand, as today. Copies built before the feed exists never learn of it: their testers install once more by hand when it does.
- **Tested against a feed on John's own machine or network.** `latest.json` and the packages are served over HTTPS from a local folder, and a test build points at it. Nothing is hosted anywhere.
- **No token in the app.** A private repository read through a token compiled into every copy was considered and not chosen: the token could be dug out of any copy, and GitHub tokens expire, which would leave every installed copy unable to update until reinstalled by hand.

### Choices left for the feed, when Oversay goes public

Recorded so the later task starts from them; none is chosen.

1. **A public repository that holds only releases** (for example `oversayapp/oversay-releases`). Free, no bandwidth limit on release files, and a public release page that installs which can't update themselves can link to. CI needs a token that can write to it.
2. **`oversayapp/oversay` made public.** Free, the simplest pipeline, and Actions become free for the repository. It publishes the whole history, every ticket and two personal email addresses in commit authors; the history needs a secret scan first.
3. **A bucket on a domain of our own** (S3 or Cloudflare R2 at, say, `updates.oversay.app`). An account, a domain and a CI secret to keep; in return the host can change later without any installed copy noticing.

The address is compiled into every copy, so moving it later costs one release at the old address, kept alive for copies that update late.

### Versions

- **Semantic versions, set in one place: `app/package.json`.**
  - `tauri.conf.json` reads it (`"version": "../package.json"`, which Tauri v2 supports). It is the version About shows and the updater compares.
  - `Cargo.toml` can't read another file, so `make check` fails when its `version` differs from `package.json`.
  - One small script bumps both: `scripts/version.mjs 0.2.0`.
- **A release is a tag `vX.Y.Z` on `main`** whose number equals `package.json`; the release job fails if they differ.
  - The first release is **0.2.0**, newer than every `0.1.0` build already handed out.
  - Until 1.0: the minor number for new features, the patch number for fixes only.
- **What changed** is written once, as the tag's message, and becomes `latest.json`'s `notes`. The app shows it as plain text lines, as the mockup does.
- **Releases stay in the private repository** until the feed exists: the release job publishes each tagged build as a private release there, for John to hand out.

### Only tagged releases are offered

- `main` builds are never offered as updates.
  - They all carry the same version until someone bumps it, and the updater installs only a strictly greater version.
  - Giving each a version of its own would need a pre-release or build number per commit, which the Windows `.msi` version format doesn't accept as text.
- The rolling `latest` pre-release of `main` stays as it is, for John's own testing.
- A beta channel, if ever wanted, is a second file (`beta.json`) and a setting.

### The update key

- Tauri's updater needs its own minisign key pair, separate from any Apple or Microsoft code signing. Signing can't be turned off.
  - The private key signs each update package; the public key, compiled into the app, checks it. A package that fails the check is thrown away.
  - It is what stops anyone who could change the files on the feed from shipping their own program to every copy.
  - Each signature also carries the version it was signed for (Tauri's CLI records it), and the app is built with `requireSignedVersion`, so a tampered `latest.json` can't pass an older, genuinely signed release off as a newer one.
- **The release key is made when the feed is chosen**, by John, with `npx tauri signer generate` and a password.
  - The private key and its password become GitHub Actions secrets (`TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`); only the release job reads them.
  - The public key goes in `tauri.conf.json` (`plugins.updater.pubkey`).
  - It is backed up in two places the maintainer controls, never in a repository: a password manager and an offline copy. An Actions secret can't be read back, so it is not a backup.
  - If it is lost, installed copies can never update again. If it leaks, a release signed with the old key carries a new public key.
- **Until then, the hands-on update test uses a throwaway key pair** made on the test machine and never committed. Its public key goes into the test build only, through the same build-time route as the feed address.

### Windows: an NSIS installer for the current user, the `.msi` kept

- **The main Windows download is Tauri's NSIS installer** (bundle target `nsis`, `Oversay_x.y.z_x64-setup.exe`) with `installMode: "currentUser"`.
  - It installs into the person's own profile, so installing and every update need no administrator rights.
  - It installs WebView2 if it is missing, as the `.msi` does.
- **The `.msi` is still built**, for anyone whose IT deploys software centrally or blocks programs installed in a user's profile. It installs for all users, so its updates need administrator rights.
- **Each updates in its own format.** Each installer marks its executable with its kind; the updater looks up `windows-x86_64-nsis` or `windows-x86_64-msi` from that, so `latest.json` lists both.
- **Why now:** nobody has Oversay installed from either yet. After the first release, moving people from one to the other would mean uninstalling and reinstalling.
- **Known risk:** unsigned NSIS installers are sometimes flagged by antivirus, because malware uses NSIS too. The hands-on test checks it; signing the Windows build (not part of this epic) is the lasting fix.

### What the updater does on each kind of install

Read from the updater plugin's source (`plugins-workspace`, branch `v2`) and Tauri's documentation; none of it has been tried on our builds yet.

- **macOS universal `.app` (from the `.dmg`).**
  - `createUpdaterArtifacts: true` makes `Oversay.app.tar.gz` and its `.sig`.
  - The app looks up `darwin-aarch64` or `darwin-x86_64`. There is no `darwin-universal` lookup, so `latest.json` lists the one universal archive under both.
  - Installing swaps the new bundle in for the old one, keeping the old one until the swap succeeds. If `/Applications` isn't writable by the user it asks for an administrator password.
  - The running app carries on until it restarts.
- **Windows NSIS `.exe`.** The app looks up `windows-x86_64-nsis`, then `windows-x86_64`. Installing runs the downloaded setup in passive mode (a small progress window, no questions) and **the app exits at once**; the installer starts Oversay again afterwards.
- **Windows `.msi`.** The app looks up `windows-x86_64-msi`, then `windows-x86_64`. Installing runs `msiexec` in passive mode and the app exits at once. Tauri's `.msi` installs for all users, so each update likely shows a UAC prompt (unverified).
- **Windows portable `.exe`.**
  - The bundler marks the executable inside each installer with its kind and puts the unmarked one back after bundling. The `target/release/oversay.exe` CI publishes as the portable build so reports no bundle type (`tauri::utils::platform::bundle_type()` is `None`).
  - That is how the update check tells it can't install: no bundle type on Windows means link only, as for anything else it doesn't recognise.
  - The update check reads the version from `latest.json` itself, since no `windows-x86_64` package is listed. Its link to a release page is the feed's optional `release_page` field (`scripts/latest-json.mjs --page`); it waits for the feed, like the rest.
- **Unsigned builds.**
  - Whether an updated, unsigned app opens without Gatekeeper or SmartScreen asking again is **unverified**. The app downloads the package itself, so it should carry no quarantine attribute or Mark of the Web, which is what those checks look for.
  - On macOS, an app that was never moved out of Downloads runs from a translocated read-only path and probably can't replace itself.
  - The hands-on test checks both on real machines.

## Consequences

- **The update build:**
  - `createUpdaterArtifacts`, with the feed address and public key read at build time;
  - the NSIS bundle target with `installMode: "currentUser"` beside the `.msi`;
  - a tag-triggered release job that checks the tag against `package.json`, builds, and publishes a private release in this repository with the installers, the update packages and a `latest.json` with `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64-nsis` and `windows-x86_64-msi` entries;
  - the version script and its check;
  - the written steps for cutting a release.
- **The hands-on test** runs updates against a local feed with a throwaway key, never a hosted one.
- **Until Oversay goes public**, no copy updates itself, and testers install each version by hand.
- **Going public needs one more task:** choose the feed, make the release key and back it up, and point the release job at the feed. Copies installed before then are reinstalled by hand once.
- **Checking for updates sends a request to the feed**, which sees the address it comes from; nothing else about the person is sent. Settings says so.
