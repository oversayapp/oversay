//! The account's Tauri side: its state, the commands Settings › Account calls, and the
//! `oversay://auth` links links.rs hands over. Each change is announced to the manager with
//! `ACCOUNT_EVENT`, which carries nothing: the manager asks `account_status`.

use std::sync::Arc;
use std::time::Instant;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use super::{Account, LinkOutcome, Screen, Status};

/// Same name as `ACCOUNT_EVENT` in src/lib/account/account.ts.
pub const ACCOUNT_EVENT: &str = "oversay-account";

/// The account, or none in a build with no account stage.
pub struct AccountState(Option<Arc<Account>>);

fn changed(app: &AppHandle) {
    let _ = app.emit_to(crate::MANAGER_LABEL, ACCOUNT_EVENT, ());
}

/// At launch: the account is restored from the keychain off the main thread (the keychain can
/// take a moment, or ask), then the manager is told.
pub fn init(app: &AppHandle) {
    let account = super::built_stage().map(|stage| Arc::new(Account::for_stage(stage)));
    app.manage(AccountState(account.clone()));
    let Some(account) = account else {
        log::info!("account: this build has no account stage");
        return;
    };
    let app = app.clone();
    std::thread::spawn(move || {
        account.restore();
        changed(&app);
    });
}

/// An `oversay://auth` link (links.rs): followed off the main thread, since it may call Cognito.
pub fn receive_link(app: &AppHandle, url: String) {
    let Some(account) = app.state::<AccountState>().0.clone() else {
        log::warn!("account.link_refused reason=no_account_stage");
        return;
    };
    let app = app.clone();
    std::thread::spawn(move || {
        if account.handle_link(&url, Instant::now()) == LinkOutcome::SignedIn
            // Bring the manager forward, showing the email, but not over someone's slides.
            && !crate::session::holds_keys(&app)
        {
            crate::tray::show_manager(&app);
        }
        changed(&app);
    });
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
    let url = account.start_sign_in(screen, Instant::now());
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

/// Signs out (keychain item deleted, token revoked; decks untouched), then opens the hosted page's
/// sign-out so the browser doesn't sign straight back in next time.
#[tauri::command]
pub async fn account_sign_out(
    app: AppHandle,
    state: State<'_, AccountState>,
) -> Result<Status, String> {
    let account = account(&state)?;
    let worker = account.clone();
    let logout = tauri::async_runtime::spawn_blocking(move || worker.sign_out())
        .await
        .map_err(|e| e.to_string())?;
    if let Some(url) = logout
        && let Err(e) = app.opener().open_url(url, None::<&str>)
    {
        log::warn!("account.browser_not_opened error={e}");
    }
    changed(&app);
    Ok(account.status())
}

/// Developer tools: `GET /decks` with the account's token. Signed out, no request is made.
#[tauri::command]
pub async fn account_check_api(
    app: AppHandle,
    state: State<'_, AccountState>,
) -> Result<String, String> {
    let account = account(&state)?;
    let result = tauri::async_runtime::spawn_blocking(move || account.call_api(Instant::now()))
        .await
        .map_err(|e| e.to_string())?;
    // A refused refresh token signs the app out: Settings shows it.
    changed(&app);
    result.map_err(|e| e.to_string())
}
