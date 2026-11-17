---
status: accepted
date: 2026-11-17
---

# The update feed is a redirect to the public repository's latest release

Supersedes the feed part of [ADR 0030](0030-the-updater-is-built-now-and-its-feed-waits-until-oversay-goes-public.md): its decision that the feed waits until Oversay goes public, and its "Choices left for the feed". The rest of 0030 stands: the updater is built with no token in the app, a version is set once in `package.json`, and only tagged releases are offered.

## Decision

- **Releases live in `oversayapp/oversay`, which is made public.** The history scan was done on 2026-11-11 and the full history is kept. A tagged release is a normal release, not a pre-release, so it is what the repository's "latest release" address resolves to. The rolling `latest` build of `main` stays a pre-release and is never offered.
- **The feed address is `https://updates.oversay.app/latest.json`.** It is compiled into every build through the `OVERSAY_UPDATE_FEED` variable, together with the public key in `OVERSAY_UPDATE_PUBKEY`.
- **It is served by a redirect.** A Cloudflare rule sends exactly that path (302) to `https://github.com/oversayapp/oversay/releases/latest/download/latest.json`, on `updates.oversay.app` with the proxy on. `OVERSAY_UPDATE_FILES` stays unset, so `latest.json` names the packages on the same release.
- **The update key is made by John on his own Mac**, with the password in the password manager and an offline copy. Only the public half is committed to CI settings; the private half and its password are the CI secrets `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Nothing else holds it.
- **The portable `.exe` reads the feed itself and follows up to five redirects, over https only.**
- **The first release is `v0.4.0`**, the version at the time of this decision, not the `0.2.0` that 0030 named. It only has to be newer than every `0.1.0` build handed out.

## Why

The simplest pipeline that costs nothing: the release job already publishes a release with `latest.json` and the signed packages, and a public repository needs no token, no bucket and no second place to push to. The address under our own domain is what makes this cheap to change: it is compiled into every copy and cannot move, but what stands behind it can. Moving later to a bucket or another repository means editing the redirect rule, with no installed copy noticing.

## Considered options

- **A separate public releases repository** (`oversayapp/oversay-releases`). Keeps the code private, but CI needs a token that can write to a second repository, and the release job gains a second place to publish. Not worth it once the history scan was done and the full history kept.
- **A bucket on our domain** (Cloudflare R2 at `updates.oversay.app`). Works with a private code repository, and the host is independent of GitHub. It needs a bucket, an API token as a CI secret and an upload step. It can still be adopted later behind the same address.
- **A private repository read through a token inside the app.** Ruled out in 0030: anyone with a copy can dig the token out, and a token that expires leaves every installed copy unable to update.

## Consequences

- **Going public publishes the repository's history and issues.** The 2026-11-11 scan found what needed fixing before this; whatever it kept is public from the day the repository is.
- **Releases are public.** The tag-triggered release job's "private release" becomes a public one, so the notes and the files are public the moment a tag is pushed.
- **Builds from the release that carries the settings check for updates.** Copies installed before it never learn of the feed, so their testers install once more by hand, as 0030 said.
- **The feed depends on Cloudflare's redirect and on GitHub keeping its `releases/latest/download` address.** Installed builds go through the updater plugin, which follows redirects; the portable `.exe` read follows them too (the same change).
- **Not verified yet:** a real redirect from the Cloudflare rule to GitHub, read by an installed build. The first release checks it.
- **The release key is never replaced silently.** If it is lost, installed copies can never update again.
