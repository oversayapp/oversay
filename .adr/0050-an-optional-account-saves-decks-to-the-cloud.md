---
status: accepted
date: 2026-11-18
---

# An optional account saves decks to the cloud

ADR 0033 decided that nothing is hosted, and a deck is a folder on one computer (ADR 0037). John wants the same decks on a second computer, and later on an iPhone app being designed in `oversayapp/design`, without taking anything away from someone who never signs in (epic oversayapp/web-api#1; John's answers on 18 Nov 2026).

## Decision

- **An account is optional.** Signed out, Oversay is exactly what it was: it makes no request to the API and nothing prompts for an account. In Settings › Account a person creates an account or signs in, then turns on **Save decks to the cloud**.
- **The local `Documents/Oversay/Decks/` folder stays the source of truth.** The cloud holds a copy kept in step with it. A signed-in person works offline as before; edits upload when the network is back. Signing out stops syncing and leaves every local deck.
- **What is stored**, per account:
  - for each deck, its `deck.md` (with its `id`) and its `sessions.json`, byte for byte, with a revision number that goes up on every write;
  - for each workspace, its `workspace.json` (a later slice of the same epic);
  - in Cognito, the account's email address and what Cognito keeps to sign it in.
- **What is never stored:** audio and recordings. A deck's `transcripts/`, `reviews/` and `resources/` stay on the computer too, as do Settings and `oversay-local.json`. Any of these going to the cloud needs a decision of its own.
- **The service** is the private repository `oversayapp/web-api`: an Amazon Cognito user pool, an API Gateway HTTP API whose JWT authorizer checks Cognito's tokens before any code runs, AWS Lambda, and Neon Postgres, all as infra as code (SST) with `dev` and `prod` stages. Each row belongs to one Cognito user (`sub`); another user's deck is 404, so its id is never confirmed. Deleting the account removes the Cognito user and every row of theirs.
- **Signing in** uses Cognito's hosted page in the system browser, with the authorization code flow and PKCE (RFC 8252). Oversay never sees the password. The refresh token is kept only in the OS keychain (Keychain on a Mac, Credential Manager on Windows), never in a file or the settings JSON.
- **Sign-in comes back through `oversay://auth`**, an exception to ADR 0032's "a link never writes". This link stores a sign-in, so it is guarded:
  - When Oversay opens the hosted page it makes a PKCE verifier and a random `state`, kept in memory for that one attempt only, and only for a few minutes.
  - `oversay://auth?code=…&state=…` is accepted only when its `state` matches the attempt in progress. Oversay then trades the code, with the verifier, for tokens, and the attempt is used up.
  - A link Oversay did not start (no attempt in progress, a different or reused `state`, or an error from Cognito) is refused: nothing is stored, the manager says sign-in did not finish, and the log records the refusal without the link's query. A stolen code is useless without the verifier, which never leaves the app.
  - The link changes nothing on screen, so it does not ask "Show … on screen?", and it works during a session without interrupting it.

## Why

- **The deck's own files, not a model of them.** Storing `deck.md` and `sessions.json` as they are means the server never has to understand the deck format, the local file stays the truth, and a deck that comes down is the same deck. The revision number is what lets a later sync see that both computers changed a deck and keep both versions.
- **Only what moving a deck needs.** A deck and its sessions are small and are what a second computer needs to show and run it. Audio is large and holds other people's voices; transcripts and reviews come from it. Keeping them local keeps the account's data small and the privacy question narrow.
- **A hosted page with PKCE in the system browser** is the current best practice for a desktop app (RFC 8252): the person types their password only to Cognito, in a browser they trust, and nothing secret is built into the app.
- **AWS and Neon:** Cognito is on AWS, so its JWT authorizer, API Gateway and Lambda need no glue, and John had no hosting preference. Neon gives Postgres that costs nothing at rest and a throwaway database branch per test run.

## Considered options

- **A loopback redirect** (`http://127.0.0.1:<port>`, RFC 8252 §7.3). It needs no link exception, but it opens a listening port, can trip a firewall prompt on Windows, and needs a page shown in the browser afterwards. Oversay already registers `oversay://` (ADR 0032), and PKCE plus `state` close the gap a custom scheme leaves (another app claiming it). John chose the link (18 Nov).
- **Sync through the person's own cloud drive** (iCloud Drive, Dropbox, OneDrive holding `Decks/`). No account, but it reaches no iPhone app, gives no way to tell a conflict from an edit, and the drive's own conflict copies land inside deck folders.
- **Storing each deck's cards as rows.** A web or iPhone editor could query cards, but every change to the deck format would need a server change and a migration, and the cloud copy could drift from the file. Nothing needs it yet.
- **Syncing audio, transcripts and reviews too.** Ruled out for now (Q1): size and other people's voices. Not synced without a separate decision.

## Consequences

- ADR 0033's "nothing is hosted" no longer holds for decks: the skill is still not hosted, but a person's own decks can be. ADR 0033 gets a line saying so.
- ADR 0037: a deck's `id` is also its key in the cloud, within one account. Oversay gives a copied folder a new id before it uploads it (ADR 0037's rule), so one account never has two decks with one id. Two accounts can hold the same id.
- ADR 0032: `oversay://auth` is the one link that writes, guarded as above. ADR 0032 gets a line saying so.
- Email addresses and deck contents are personal data on a hosted service. Before the account ships, oversay.app needs a privacy policy and the app a line before sign-up; it is on the launch checklist in `operations/`.
- The iPhone app will read the same decks with its own Cognito app client and redirect.
