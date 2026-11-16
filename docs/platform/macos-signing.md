# macOS signing and notarization

A signed and notarized Oversay opens on a Mac with no Gatekeeper warning beyond the usual "downloaded from the Internet" prompt. An unsigned build needs the user to go to System Settings › Privacy & Security › Open Anyway.

## What a signed build is

- The `.app` is signed with a **Developer ID Application** certificate, the **hardened runtime** on and a secure timestamp, then **notarized** by Apple and **stapled**, so it also verifies offline.
- The `.dmg` is signed, notarized and stapled too. Tauri signs the DMG but doesn't notarize it, so the build workflow does that step itself.
- It is a **universal** build (Apple silicon and Intel), minimum macOS 11.0.
- The update package (`Oversay.app.tar.gz`) is made from the notarized app. Its signature is the separate **updater key** of [ADR 0030](../../.adr/0030-the-updater-is-built-now-and-its-feed-waits-until-oversay-goes-public.md), unrelated to Apple signing.

## Entitlements

`app/src-tauri/Entitlements.plist` holds one entitlement, `com.apple.security.device.audio-input`. The hardened runtime blocks the microphone without it, and macOS then never asks. Oversay isn't in the App Sandbox (it writes the AI skill into `~/.claude` and `~/.agents`, ADR 0033), so the sandbox's own microphone key isn't used. It needs no JIT, unsigned-memory, library-validation, network or file-access entitlements. Add one only with a reason, and `scripts/verify-macos.sh` fails the build if the list changes.

`Info.plist` holds the two usage strings macOS shows: `NSMicrophoneUsageDescription` and `NSDocumentsFolderUsageDescription` (decks live in `Documents/Oversay`).

macOS ties the microphone and Documents permissions to the app's signing identity and bundle identifier (`app.oversay`). Changing who signs, or the identifier, makes every user grant them again.

## Signing in CI

The `macos` job in `.github/workflows/build.yml` signs for a **version tag**, or a manual run with **sign** ticked. Those runs use the `release` environment, which holds the secrets; every other run uses the empty `unsigned` environment and builds as before, so a fork's pull request never sees a secret.

Secrets in the `release` environment (names only; values are never written down in the repository):

| Secret | What it is |
| --- | --- |
| `APPLE_CERTIFICATE` | The Developer ID Application certificate and its private key, exported as a `.p12` and base64 encoded |
| `APPLE_CERTIFICATE_PASSWORD` | The password the `.p12` was exported with |
| `APPLE_SIGNING_IDENTITY` | The certificate's full name, from `security find-identity -v -p codesigning` |
| `APPLE_API_KEY_P8` | The text of the App Store Connect API key file (`AuthKey_<id>.p8`) used to notarize |
| `APPLE_API_KEY` | That key's Key ID |
| `APPLE_API_ISSUER` | The Issuer ID shown on App Store Connect › Users and Access › Integrations |

The run fails at once, naming the secret, if one is missing. Tauri builds a temporary keychain from the certificate and deletes it when the build ends; the key file is written to the runner's temporary folder and deleted in the job's last step. After the build, the workflow notarizes and staples the DMG, then runs `scripts/verify-macos.sh`, which fails the run if the result isn't signed, notarized and stapled. Notarization normally takes a minute or two; the job stops after 75 minutes.

The updater key (`TAURI_SIGNING_PRIVATE_KEY` and its password) stays separate: see [Releasing](../releasing.md).

## Signing on your own Mac

With the certificate in your login keychain and the notarization key file saved where Tauri looks for it (`~/.appstoreconnect/private_keys/AuthKey_<id>.p8`):

```bash
cd app
export APPLE_SIGNING_IDENTITY="<the certificate's full name>"
export APPLE_API_KEY="<Key ID>" APPLE_API_ISSUER="<Issuer ID>"
npm run tauri -- build --target universal-apple-darwin --bundles app,dmg
```

Tauri signs and notarizes the app; the DMG is signed only, so notarize it too if you want a complete check:

```bash
xcrun notarytool submit <the .dmg> --key <the .p8> --key-id <Key ID> --issuer <Issuer ID> --wait
xcrun stapler staple <the .dmg>
```

Without the Apple variables, Tauri builds unsigned, which is all a contributor needs.

## Checking a build

```bash
make verify-mac                  # the universal build's folder
make verify-mac BUNDLE=<folder>  # a folder holding macos/Oversay.app and dmg/*.dmg
```

It checks the signature, hardened runtime, timestamp, the one entitlement, both architectures, that only system libraries are linked, the usage strings and link scheme, and that the app and DMG are stapled and accepted by Gatekeeper. A build made on your own Mac is never quarantined, so Gatekeeper doesn't check it at launch: for the real test, download the DMG from a release or artifact on another Mac, ideally with Wi-Fi off.

By hand, after a signed build, also check what the script can't: Record my voice (the microphone prompt, a recording, a transcript), the first Documents prompt, the global shortcuts while another app has focus, capture hiding in a screen share and recording, overlays over a full-screen app, and an `oversay://` link.

## Hands-on results

The first signed build from CI (a manual run of Build on `main` with **sign** ticked, 14 Nov 2026, version 0.1.0): the run took about 33 minutes, `scripts/verify-macos.sh` passed every check in its log, and the DMG was downloaded in a browser, so it was quarantined and Gatekeeper checked it. It was tried on one Mac, one that had run Oversay before, so it isn't a clean-Mac test.

Legend: ✅ pass · ⏳ not yet tested

| Check | Result | Notes |
| --- | --- | --- |
| Opens with only the usual "downloaded from the Internet" prompt | ✅ pass | No Open Anyway needed |
| Microphone prompt, a recording, a Whisper transcript | ✅ pass | The `audio-input` entitlement is enough under the hardened runtime |
| Documents folder: decks, sessions and transcripts are saved | ✅ pass | No prompt appeared: that Mac most likely already had the grant. To see the prompt, run `tccutil reset SystemPolicyDocumentsFolder app.oversay` and reopen the app |
| Global shortcuts while another app has focus | ✅ pass | No Accessibility or Input Monitoring prompt |
| Overlay over a full-screen app | ✅ pass | The app wasn't recorded |
| Hidden from a macOS screen recording (⇧⌘5) | ✅ pass | Overlay visible locally, missing from the video |
| `oversay://` link opens the app | ✅ pass | |
| Zoom or Teams screen share | ⏳ | Needs a second device or a meeting to share into |
| With Wi-Fi off (the stapled ticket) | ⏳ | |
| A Mac that has never run Oversay (a clean Documents and microphone grant) | ⏳ | |
| The Intel slice under Rosetta | ⏳ | `verify-macos.sh` confirms it is in the binary, not that it runs |

## When the certificate expires

Apps already signed with a secure timestamp keep verifying after the certificate expires, but new builds need a new certificate: create it, export a new `.p12`, and replace `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD` and `APPLE_SIGNING_IDENTITY` in the environment.
