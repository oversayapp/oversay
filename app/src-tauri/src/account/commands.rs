//! The account's Tauri side: its state, the commands Settings › Account calls, and the
//! `oversay://auth` links links.rs hands over. A change the manager didn't ask for (a link, a
//! refused refresh, the restore at launch) is announced with `ACCOUNT_EVENT`, which carries
//! nothing: the manager asks `account_status`. A command returns the status itself.

use std::sync::Arc;
use std::time::Instant;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use super::{Account, LinkOutcome, Screen, Status};

/// Same name as `ACCOUNT_EVENT` in src/lib/account/account.ts; both sides test it.
pub const ACCOUNT_EVENT: &str = "oversay-account";

/// The account, or none in a build with no account stage.
pub struct AccountState(Option<Arc<Account>>);

/// At launch: the account is restored from the keychain off the main thread (the keychain can
/// take a moment, or ask).
pub fn init(app: &AppHandle) {
    let account = super::built_stage().map(|stage| Arc::new(Account::for_stage(stage)));
    app.manage(AccountState(account.clone()));
    let Some(account) = account else {
        log::info!("account: this build has no account stage");
        return;
    };
    let handle = app.clone();
    account.on_change(move || {
        let _ = handle.emit_to(crate::MANAGER_LABEL, ACCOUNT_EVENT, ());
    });
    std::thread::spawn(move || account.restore());
}

/// An `oversay://auth` link (links.rs): followed off the main thread, since it may call Cognito.
pub fn receive_link(app: &AppHandle, url: String) {
    let Some(account) = app.try_state::<AccountState>().and_then(|s| s.0.clone()) else {
        log::warn!("account.link_refused reason=no_account");
        return;
    };
    let app = app.clone();
    std::thread::spawn(move || {
        if account.handle_link(&url, Instant::now()) == LinkOutcome::SignedIn {
            // Showing the email, but not over someone's slides.
            crate::links::bring_manager_forward(&app);
        }
    });
}

/// The account, for `sync`; None in a build with no account stage.
pub fn account_of(app: &AppHandle) -> Option<Arc<Account>> {
    app.try_state::<AccountState>().and_then(|s| s.0.clone())
}

fn account(state: &State<'_, AccountState>) -> Result<Arc<Account>, String> {
    state
        .0
        .clone()
        .ok_or_else(|| "This build of Oversay has no account.".into())
}

#[tauri::command]
pub fn account_status(state: State<'_, AccountState>) -> Status {
    state.0.as_ref().map_or(Status::Unavailable, |a| a.status())
}

/// Sign in or Create account: opens the hosted page in the system browser.
#[tauri::command]
pub fn account_sign_in(
    app: AppHandle,
    state: State<'_, AccountState>,
    screen: Screen,
) -> Result<Status, String> {
    let account = account(&state)?;
    let url = account
        .start_sign_in(screen, Instant::now())
        .map_err(|e| e.to_string())?;
    if let Err(e) = app.opener().open_url(url, None::<&str>) {
        account.cancel_sign_in();
        log::warn!("account.browser_not_opened error={e}");
        return Err("Oversay couldn't open your browser to sign in.".into());
    }
    Ok(account.status())
}

#[tauri::command]
pub fn account_cancel_sign_in(state: State<'_, AccountState>) -> Result<Status, String> {
    let account = account(&state)?;
    account.cancel_sign_in();
    Ok(account.status())
}

/// Signs out (keychain item deleted; decks untouched) and opens the hosted page's sign-out, so
/// the browser doesn't sign straight back in next time. The token is revoked afterwards, so the
/// button doesn't wait on the network.
#[tauri::command]
pub async fn account_sign_out(
    app: AppHandle,
    state: State<'_, AccountState>,
) -> Result<Status, String> {
    let account = account(&state)?;
    // Off the main thread: deleting the keychain item can wait on a keychain prompt.
    let worker = account.clone();
    let signed_out = tauri::async_runtime::spawn_blocking(move || worker.sign_out())
        .await
        .map_err(|e| e.to_string())?;
    // Syncing stops with the sign-in (epic 036 V6); the decks stay.
    crate::sync::commands::signed_out(&app);
    if let Some((logout, revocation)) = signed_out {
        if let Err(e) = app.opener().open_url(logout, None::<&str>) {
            log::warn!("account.browser_not_opened error={e}");
        }
        let worker = account.clone();
        tauri::async_runtime::spawn_blocking(move || worker.revoke(revocation));
    }
    Ok(account.status())
}

/// Delete account: the cloud account and everything saved under it go (the API), then the app is
/// signed out as Sign out does. Local decks stay. The status comes back; a failure is an error
/// message and the account stays signed in, so it can be tried again.
#[tauri::command]
pub async fn account_delete(
    app: AppHandle,
    state: State<'_, AccountState>,
) -> Result<Status, String> {
    let account = account(&state)?;
    let worker = account.clone();
    let logout =
        tauri::async_runtime::spawn_blocking(move || worker.delete_account(Instant::now()))
            .await
            .map_err(|e| e.to_string())?
            .map_err(|e| e.to_string())?;
    // Syncing stops with the account (epic 036 V6); the decks stay.
    crate::sync::commands::signed_out(&app);
    if let Err(e) = app.opener().open_url(logout, None::<&str>) {
        log::warn!("account.browser_not_opened error={e}");
    }
    Ok(account.status())
}

/// Developer tools: `GET /decks` with the account's token. Signed out, no request is made.
#[tauri::command]
pub async fn account_check_api(state: State<'_, AccountState>) -> Result<String, String> {
    let account = account(&state)?;
    tauri::async_runtime::spawn_blocking(move || account.call_api(Instant::now()))
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| e.to_string())
}
