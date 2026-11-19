//! `oversay://` links (ADR 0032): an AI that has written a note opens Oversay on it, or shows it.
//! The system hands a link to the deep-link plugin: at launch on any platform, from a second launch
//! on Windows (through the single instance, `platform::single_instance`), and to the running app on
//! a Mac. Rust only keeps the link until the manager takes it and brings the manager forward; the
//! manager reads the link and decides what it may do (src/lib/links.ts).

use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;

/// Same name as `LINK_EVENT` in src/lib/links.ts; both sides test it. It carries nothing: the
/// manager takes the links waiting with `take_links`, so none is handled twice or lost before the
/// manager listens.
pub const LINK_EVENT: &str = "oversay-link";

/// Links that arrived and the manager hasn't taken yet.
#[derive(Default)]
pub struct PendingLinks(Mutex<Vec<String>>);

/// Only our own scheme is passed on; anything else a launch was given is ignored.
fn is_oversay_link(url: &str) -> bool {
    url.get(..10)
        .is_some_and(|s| s.eq_ignore_ascii_case("oversay://"))
}

fn receive(app: &AppHandle, url: String) {
    if !is_oversay_link(&url) {
        return;
    }
    // The link itself names a note, so it isn't logged; the manager logs what it does.
    log::info!("link received");
    // A sign-in coming back (ADR 0050) goes to the account, never to the manager: it holds a code.
    if crate::account::is_auth_link(&url) {
        crate::account::commands::receive_link(app, url);
        return;
    }
    app.state::<PendingLinks>().0.lock().unwrap().push(url);
    // Not over someone's slides: during a session the manager stays where it is.
    if !crate::session::holds_keys(app) {
        crate::tray::show_manager(app);
    }
    let _ = app.emit_to(crate::MANAGER_LABEL, LINK_EVENT, ());
}

/// Listens for links, and takes the one this launch was started with.
pub fn init(app: &AppHandle) {
    app.manage(PendingLinks::default());
    let handle = app.clone();
    app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            receive(&handle, url.to_string());
        }
    });
    match app.deep_link().get_current() {
        Ok(Some(urls)) => urls
            .into_iter()
            .for_each(|url| receive(app, url.to_string())),
        Ok(None) => {}
        Err(e) => log::warn!("launch link not read: {e}"),
    }
}

/// The links waiting, oldest first; the manager calls it at start and on `LINK_EVENT`.
#[tauri::command]
pub fn take_links(pending: State<'_, PendingLinks>) -> Vec<String> {
    let links = std::mem::take(&mut *pending.0.lock().unwrap());
    log::debug!("links taken by the manager: {}", links.len());
    links
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_link_event_has_the_frontends_name() {
        assert_eq!(LINK_EVENT, "oversay-link");
    }

    #[test]
    fn only_oversay_links_are_passed_on() {
        assert!(is_oversay_link("oversay://notes/Standup"));
        assert!(is_oversay_link("OVERSAY://notes"));
        assert!(!is_oversay_link("https://example.com"));
        assert!(!is_oversay_link("--control-panel"));
        assert!(!is_oversay_link("oversay:"));
    }
}
