# Privacy

The full policy is at **[oversay.app/privacy](https://oversay.app/privacy/)**. This is a summary of it.

- **No ads, no analytics, no crash reports, no tracking.** The app has no telemetry of any kind.
- **Without an account, nothing about your decks leaves your computer.** Decks, sessions, notes, transcripts and reviews are files in your Documents folder.
- **Recording is your own microphone only.** It is transcribed on your computer and then moved to the Trash, unless you keep recordings in Settings › Recordings. Audio is never uploaded.
- **Without an account, the app makes two kinds of request:** a check for updates when it starts (at `updates.oversay.app`, which redirects to this repository's releases; turn it off in Settings › Updates), and the one-time speech model download from Hugging Face, made only after you say yes.
- **The account is optional.** With one, Oversay stores your email address (and the id Google or Apple gives you, if you sign in with them). With **Save decks to the cloud** on, it also stores each deck's `deck.md` and `sessions.json` and each workspace's `workspace.json`. Recordings, transcripts, reviews, resources and settings stay on your computer.
- **Where:** Amazon Web Services in Ireland (eu-west-1) for sign-in (Cognito), the API and logs; Neon Postgres in Frankfurt (eu-central-1) for saved decks. Server logs keep no IP address, email or deck content, and are deleted after 3 months.
- **Delete account** in Settings › Account removes your account and everything of yours in the cloud. Your local decks are not touched.

Questions about your data: <!-- TODO(owner): privacy contact email --> **[privacy contact email]**.

The code behind each of these points is in this repository: `app/src-tauri/src/account/`, `app/src-tauri/src/sync/`, `recorder.rs`, `transcriber.rs`, `updates.rs`, and §14 of [docs/spec.md](docs/spec.md). The server is in oversayapp/web-api.
