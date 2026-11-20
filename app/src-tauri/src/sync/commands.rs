//! The sync module's Tauri side: whether Save decks to the cloud is on (kept in `sync.json` in the
//! config folder, never in settings.json or the keychain) and the commands Settings › Account
//! calls. Signed out, nothing here makes a request (V5), and signing out turns it off.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{DebounceEventResult, Debouncer, new_debouncer};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use super::cloud::{AccountTransport, ApiCloud};
use super::library::FolderLibrary;
use super::saver::{Activity, Saver};
use super::{CloudError, FirstSync, State, Sync};
use crate::account::{Account, commands::account_of};
use crate::files::{config_path, write_atomically};

const FILE: &str = "sync.json";
/// What the last round agreed with the cloud (revisions and hashes, no deck content).
const STATE_FILE: &str = "sync-state.json";
/// Same name as `SYNC_CHANGED_EVENT` in src/lib/account/sync.ts; its payload is a `SyncStatus`.
pub const SYNC_CHANGED_EVENT: &str = "sync-changed";
/// A save is several writes: the folder must be quiet this long before the saver is told.
const QUIET: Duration = Duration::from_millis(250);

/// What Settings › Account shows about saving decks.
#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub on: bool,
    /// The first upload and download is running.
    pub working: bool,
    /// What turning it on did, until it is turned off.
    pub last: Option<Outcome>,
    pub problem: Option<String>,
    /// Saving while an edit waits to go up, Saved once it has.
    pub activity: Activity,
    /// Titles of the conflict copies made, newest last: decks changed on both computers, both
    /// versions kept. Shown to the user, never logged.
    pub conflicts: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub uploaded: usize,
    pub downloaded: usize,
    /// Decks the cloud and this computer both have, with different contents: left as they are.
    pub left_alone: usize,
    pub failed: usize,
}

impl From<&FirstSync> for Outcome {
    fn from(r: &FirstSync) -> Self {
        Outcome {
            uploaded: r.uploaded,
            downloaded: r.downloaded,
            left_alone: r.left_alone.len(),
            failed: r.failed,
        }
    }
}

pub struct SyncState(Mutex<SyncStatus>);

/// What the folder watcher, the window and Settings tell the worker; it takes them at its next look.
#[derive(Default)]
struct Inbox {
    edited: Option<Instant>,
    focused: bool,
    /// Start from this state (just turned on).
    install: Option<State>,
    /// Forget everything (turned off, signed out).
    reset: bool,
}

struct Shared(Mutex<Inbox>);

/// Keeps the Decks watcher alive while the app runs.
struct DeckWatcher(#[allow(dead_code)] Mutex<Option<Debouncer<RecommendedWatcher>>>);

fn inbox(app: &AppHandle) -> std::sync::MutexGuard<'_, Inbox> {
    app.state::<Shared>()
        .inner()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

/// Whether a changed path in the Decks folder `dir` is one of the two files that are saved (a
/// deck's Markdown or its sessions.json, in the deck's own folder or loose before it is tidied
/// into one). Resources, transcripts, reviews and hidden temporary files are not.
pub(crate) fn is_synced_path(dir: &Path, path: &Path) -> bool {
    let Ok(inside) = path.strip_prefix(dir) else {
        return false;
    };
    let parts: Vec<_> = inside.iter().map(|p| p.to_string_lossy()).collect();
    let saved = |file: &str| {
        !file.starts_with('.') && (file.ends_with(".md") || file == crate::quick::DECK_SESSIONS)
    };
    match parts.as_slice() {
        // A deck's folder appearing or going (moved to the Trash) is a change too; a file there
        // that isn't Markdown is not.
        [entry] => !entry.starts_with('.') && (entry.ends_with(".md") || !entry.contains('.')),
        [folder, file] => !folder.starts_with('.') && saved(file),
        _ => false,
    }
}

/// Whether sync.json says it is on. Anything unreadable is off.
pub fn parse_switch(text: Option<&str>) -> bool {
    text.and_then(|t| serde_json::from_str::<serde_json::Value>(t).ok())
        .and_then(|v| v.get("on").and_then(serde_json::Value::as_bool))
        .unwrap_or(false)
}

fn switch_text(on: bool) -> String {
    format!("{{\"version\":1,\"on\":{on}}}\n")
}

fn save_switch(app: &AppHandle, on: bool) {
    let result = config_path(app, FILE).and_then(|path| {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        write_atomically(&path, &switch_text(on)).map_err(|e| e.to_string())
    });
    if let Err(e) = result {
        log::warn!("sync.switch_not_saved error={e}");
    }
}

pub fn init(app: &AppHandle) {
    let on = config_path(app, FILE)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .is_some_and(|t| parse_switch(Some(&t)));
    app.manage(SyncState(Mutex::new(SyncStatus {
        on,
        ..SyncStatus::default()
    })));
    app.manage(Shared(Mutex::new(Inbox::default())));
    let watcher = match watch_decks(app) {
        Ok(w) => Some(w),
        Err(e) => {
            log::warn!("sync.not_watching error={e}");
            None
        }
    };
    app.manage(DeckWatcher(Mutex::new(watcher)));
    let app = app.clone();
    std::thread::spawn(move || worker(app));
}

/// Tells the worker a deck file changed. Off or signed out, nothing is noted and nothing is sent.
fn watch_decks(app: &AppHandle) -> Result<Debouncer<RecommendedWatcher>, String> {
    let dir = crate::quick::decks_dir(app)?;
    // Events may name the folder by its real path (`/private/var/…` for `/var/…`).
    let roots = [
        dir.clone(),
        dir.canonicalize().unwrap_or_else(|_| dir.clone()),
    ];
    let handle = app.clone();
    let mut debouncer = new_debouncer(QUIET, move |result: DebounceEventResult| match result {
        Ok(events)
            if events
                .iter()
                .any(|e| roots.iter().any(|r| is_synced_path(r, &e.path))) =>
        {
            if lock(&handle).on {
                inbox(&handle).edited = Some(Instant::now());
            }
        }
        Ok(_) => {}
        Err(e) => log::warn!("sync.watch_error error={e}"),
    })
    .map_err(|e| e.to_string())?;
    debouncer
        .watcher()
        .watch(&dir, RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    Ok(debouncer)
}

/// The window came to the front: pull at the next look (launch pulls too: a new saver starts with
/// one).
pub fn focused(app: &AppHandle) {
    if let Some(shared) = app.try_state::<Shared>()
        && lock_if_ready(app).is_some_and(|s| s.on)
    {
        shared.0.lock().unwrap_or_else(|e| e.into_inner()).focused = true;
    }
}

fn lock_if_ready(app: &AppHandle) -> Option<std::sync::MutexGuard<'_, SyncStatus>> {
    app.try_state::<SyncState>().map(|_| lock(app))
}

fn read_state(app: &AppHandle) -> State {
    config_path(app, STATE_FILE)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str(&t).ok())
        .unwrap_or_default()
}

fn write_state(app: &AppHandle, state: &State) {
    let result = config_path(app, STATE_FILE).and_then(|path| {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let text = serde_json::to_string(state).map_err(|e| e.to_string())?;
        write_atomically(&path, &text).map_err(|e| e.to_string())
    });
    if let Err(e) = result {
        log::warn!("sync.state_not_saved error={e}");
    }
}

fn forget(app: &AppHandle) {
    if let Ok(path) = config_path(app, STATE_FILE) {
        let _ = std::fs::remove_file(path);
    }
    if let Some(shared) = app.try_state::<Shared>() {
        let mut inbox = shared.0.lock().unwrap_or_else(|e| e.into_inner());
        *inbox = Inbox {
            reset: true,
            ..Inbox::default()
        };
    }
}

/// The one thread that talks to the cloud for decks: looks every half second whether a round is
/// due. Off, or signed out, it does nothing, and so makes no request (V5).
fn worker(app: AppHandle) {
    let mut saver: Option<Saver> = None;
    loop {
        std::thread::sleep(Duration::from_millis(500));
        let (edited, focused, install, reset) = {
            let mut i = inbox(&app);
            (
                i.edited.take(),
                std::mem::take(&mut i.focused),
                i.install.take(),
                std::mem::take(&mut i.reset),
            )
        };
        if reset || !lock(&app).on {
            saver = None;
            continue;
        }
        let Some(account) = account_of(&app).filter(|a| a.is_signed_in()) else {
            continue;
        };
        let Ok(dir) = crate::quick::decks_dir(&app) else {
            continue;
        };
        let now = Instant::now();
        if let Some(state) = install {
            saver = Some(Saver::new(state, now));
        }
        let saver = saver.get_or_insert_with(|| Saver::new(read_state(&app), now));
        if let Some(at) = edited {
            saver.edited(at);
            publish(&app, saver, None);
        }
        if focused {
            saver.focused();
        }
        let sync = Sync::new(ApiCloud(AccountTransport(account)), FolderLibrary(dir));
        let Some(result) = saver.run_due(Instant::now(), &sync) else {
            continue;
        };
        write_state(&app, saver.state());
        let problem = match result {
            Ok(round) => {
                note_conflicts(&app, round.copies);
                None
            }
            // Offline shows as the activity, not as a problem.
            Err(CloudError::SignedOut | CloudError::Unreachable(_)) => None,
            Err(e) => {
                log::warn!("sync.round_failed error={e}");
                Some("Your decks couldn't be saved just now. Oversay will try again.".to_string())
            }
        };
        publish(&app, saver, Some(problem));
    }
}

/// Remembers the conflict copies a round made, for Settings to name (the last few).
fn note_conflicts(app: &AppHandle, copies: Vec<String>) {
    const KEEP: usize = 20;
    let mut status = lock(app);
    status.conflicts.extend(copies);
    let extra = status.conflicts.len().saturating_sub(KEEP);
    status.conflicts.drain(..extra);
}

/// Shows the saver's state in Settings: its activity, and (after a round) whether it had a problem.
fn publish(app: &AppHandle, saver: &Saver, problem: Option<Option<String>>) {
    let status = {
        let mut status = lock(app);
        if !status.on {
            return;
        }
        status.activity = saver.activity();
        if let Some(problem) = problem {
            status.problem = problem;
        }
        status.clone()
    };
    let _ = app.emit(SYNC_CHANGED_EVENT, status);
}

fn lock(app: &AppHandle) -> std::sync::MutexGuard<'_, SyncStatus> {
    app.state::<SyncState>()
        .inner()
        .0
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

/// Signing out stops syncing (V6); the decks stay.
pub fn signed_out(app: &AppHandle) {
    let mut status = lock(app);
    if status.on || status.last.is_some() {
        *status = SyncStatus::default();
        drop(status);
        save_switch(app, false);
        forget(app);
        log::debug!("sync.stopped reason=signed_out");
    }
}

#[tauri::command]
pub fn sync_status(app: AppHandle) -> SyncStatus {
    let account = account_of(&app);
    // On, but the account is gone (signed out elsewhere, or a refused refresh): off.
    if account.as_ref().is_none_or(|a| !a.is_signed_in()) && lock(&app).on {
        signed_out(&app);
    }
    lock(&app).clone()
}

/// Turns Save decks to the cloud on: the first upload and download. Off until it finishes without
/// a problem that stops it; a deck that couldn't be saved is counted, not fatal.
#[tauri::command]
pub async fn sync_turn_on(app: AppHandle) -> Result<SyncStatus, String> {
    let account = account_of(&app).ok_or("This build of Oversay has no account.")?;
    if !account.is_signed_in() {
        return Err("Sign in first.".into());
    }
    {
        let mut status = lock(&app);
        if status.working {
            return Ok(status.clone());
        }
        *status = SyncStatus {
            working: true,
            ..SyncStatus::default()
        };
    }
    let dir = crate::quick::decks_dir(&app)?;
    let still = account.clone();
    let result = tauri::async_runtime::spawn_blocking(move || first_sync(account, dir)).await;
    let mut status = lock(&app);
    status.working = false;
    match result.map_err(|e| e.to_string())? {
        // Signed out while it ran: sign-out already turned it off, and it stays off.
        Ok(_) if !still.is_signed_in() => {}
        Ok((report, state)) => {
            status.on = true;
            status.activity = Activity::Saved;
            status.last = Some((&report).into());
            drop(status);
            write_state(&app, &state);
            inbox(&app).install = Some(state);
            save_switch(&app, true);
        }
        Err(e) => {
            log::warn!("sync.turn_on_failed error={e}");
            status.problem = Some(match e {
                super::CloudError::SignedOut => "You were signed out. Sign in again.".to_string(),
                other => format!("Your decks weren't saved to the cloud: {other}"),
            });
        }
    }
    Ok(lock(&app).clone())
}

fn first_sync(account: Arc<Account>, dir: PathBuf) -> Result<(FirstSync, State), CloudError> {
    let mut state = State::default();
    Sync::new(ApiCloud(AccountTransport(account)), FolderLibrary(dir))
        .first_sync(&mut state)
        .map(|report| (report, state))
}

#[tauri::command]
pub fn sync_turn_off(app: AppHandle) -> SyncStatus {
    *lock(&app) = SyncStatus::default();
    save_switch(&app, false);
    forget(&app);
    log::debug!("sync.stopped reason=turned_off");
    SyncStatus::default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_two_saved_files_are_watched() {
        let dir = Path::new("/d/Decks");
        let yes = |p: &str| is_synced_path(dir, Path::new(p));
        assert!(yes("/d/Decks/Standup 2026-11-20/deck.md"));
        assert!(yes("/d/Decks/Standup 2026-11-20/sessions.json"));
        assert!(yes("/d/Decks/Loose.md"));
        // A deck folder moved away (to the Trash) is a change; a stray file or hidden entry is not.
        assert!(yes("/d/Decks/Standup 2026-11-20"));
        assert!(!yes("/d/Decks/notes.txt"));
        assert!(!yes("/d/Decks/.DS_Store"));
        assert!(!yes("/d/Decks/Standup 2026-11-20/resources/a.md"));
        assert!(!yes("/d/Decks/Standup 2026-11-20/transcripts/t.md"));
        assert!(!yes("/d/Decks/Standup 2026-11-20/reviews/r.json"));
        assert!(!yes("/d/Decks/Standup 2026-11-20/.deck.md.tmp"));
        assert!(!yes("/d/Decks/.hidden/deck.md"));
        assert!(!yes("/elsewhere/deck.md"));
    }

    #[test]
    fn the_switch_is_off_unless_the_file_says_on() {
        assert!(!parse_switch(None));
        assert!(!parse_switch(Some("not json")));
        assert!(!parse_switch(Some("{}")));
        assert!(parse_switch(Some(&switch_text(true))));
        assert!(!parse_switch(Some(&switch_text(false))));
    }
}
