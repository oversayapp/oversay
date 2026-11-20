//! The sync module's Tauri side: whether Save decks to the cloud is on (kept in `sync.json` in the
//! config folder, never in settings.json or the keychain) and the commands Settings › Account
//! calls. Signed out, nothing here makes a request (V5), and signing out turns it off.

use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use super::cloud::{AccountTransport, ApiCloud};
use super::library::FolderLibrary;
use super::{FirstSync, Sync};
use crate::account::{Account, commands::account_of};
use crate::files::{config_path, write_atomically};

const FILE: &str = "sync.json";

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
    let result =
        tauri::async_runtime::spawn_blocking(move || first_sync(account, dir.clone())).await;
    let mut status = lock(&app);
    status.working = false;
    match result.map_err(|e| e.to_string())? {
        Ok(report) => {
            status.on = true;
            status.last = Some((&report).into());
            drop(status);
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

fn first_sync(
    account: Arc<Account>,
    dir: std::path::PathBuf,
) -> Result<FirstSync, super::CloudError> {
    Sync::new(ApiCloud(AccountTransport(account)), FolderLibrary(dir)).first_sync()
}

#[tauri::command]
pub fn sync_turn_off(app: AppHandle) -> SyncStatus {
    *lock(&app) = SyncStatus::default();
    save_switch(&app, false);
    log::debug!("sync.stopped reason=turned_off");
    SyncStatus::default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_switch_is_off_unless_the_file_says_on() {
        assert!(!parse_switch(None));
        assert!(!parse_switch(Some("not json")));
        assert!(!parse_switch(Some("{}")));
        assert!(parse_switch(Some(&switch_text(true))));
        assert!(!parse_switch(Some(&switch_text(false))));
    }
}
