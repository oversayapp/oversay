# Dependency audit, October 2026

Run on 2026-10-24: the first `cargo audit` of the Rust dependencies, and `npm audit` of the frontend's. From now on `make check` runs `cargo audit`, and Dependabot alerts and security updates are on for npm, Cargo and GitHub Actions.

## cargo audit 0.22.2: 612 crates

**Vulnerabilities: 3, all accepted** in `app/src-tauri/.cargo/audit.toml`.

| Advisory | Crate | What | Why accepted |
|---|---|---|---|
| RUSTSEC-2026-0367 | zip 4.6.1 | SUID/SGID bits kept when extracting | See below |
| RUSTSEC-2026-0368 | zip 4.6.1 | `extract` makes symlinks whose targets are outside the folder | See below |
| RUSTSEC-2026-0369 | zip 4.6.1 | Permissions applied through symlinks when extracting | See below |

Only `tauri-plugin-updater` 2.14.0 uses zip 4.6.1. Oversay's own zip 9 is not affected. The updater requires zip "4" and the fix is in 9 and later, so it can't be bumped from here. The updater calls `ZipArchive::extract` only on Windows, and only after it has checked the package's signature against Oversay's update key. A hostile archive would need that key, and with the key an attacker could ship a hostile installer anyway. The same feature unpacks the macOS `.tar.gz` updates, so it can't be switched off. **Look again** when `tauri-plugin-updater` moves to zip 9 or later.

**Warnings: 6.** These don't fail the check.

- Unmaintained: `proc-macro-error` 1.0.4, `zbus_names` 4.3.4, `zvariant` 5.15.0, `zvariant_derive` 5.15.0. They come in through Tauri, and the `z*` crates on Linux only.
- Unsound: `glib` 0.18.5, which is Linux only, and `tokio` 1.53.2 (`AsyncFd::new`). Oversay calls neither directly.
- Yanked: `clipboard-win` 5.4.1, now updated to 5.4.3 (Windows only).

## npm audit

**0 vulnerabilities**, after `fast-uri` was moved from 3.1.8 to 3.1.9 earlier on this branch (4 moderate advisories, which came in through ajv).

## Update, 2026-11-15 (before the repository goes public)

`cargo update` moved `rustix` 1.1.5 to 1.1.6 (RUSTSEC-2026-0486), `tokio` 1.53.2 to 1.54.1 (RUSTSEC-2026-0386) and `async-executor` 1.14.0 to 1.14.1 (no longer yanked). `cargo audit` now reports **0 vulnerabilities** and 5 warnings, none with a fix to take:

- Unmaintained: `proc-macro-error` 1.0.4 (RUSTSEC-2024-0370), `zbus_names` 4.3.4 (RUSTSEC-2026-0371), `zvariant` 5.15.0 (RUSTSEC-2026-0370) and `zvariant_derive` 5.15.0 (RUSTSEC-2026-0372). They come in through Tauri, and the `z*` crates on Linux only.
- Unsound: `glib` 0.18.5 (RUSTSEC-2024-0429), Linux only, through Tauri's GTK bindings.

Warnings don't fail `make check`, so none is ignored in `audit.toml`. **Look again** when Tauri moves to newer GTK bindings or drops these crates.

`npm audit`: 2 low advisories, no fix available: `deepmerge` (GHSA-gcqx-w48m-w2h4, prototype poisoning in `mergeObject`) through `@sveltejs/vite-plugin-svelte`. It is a build-time dev dependency and is not shipped in the app.

## Running it again

```sh
cd app/src-tauri && mise exec -- cargo audit     # make check runs this
cd app && npm audit
```
