//! The session's icon in the menu bar (Mac) or tray (Windows), which exists for the whole
//! session: its menu drives the session when every overlay is hidden and another app has focus,
//! and the manager sets the text beside it from the clock. (It was the Control Panel's home
//! until the panel was removed in epic 012: the Timeline has Start, Pause, Next and End.)

use std::collections::BTreeMap;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, Wry};

use crate::hotkeys;

const TRAY_ID: &str = "session";

/// Puts the session's icon in the menu bar (Mac) or tray (Windows), with its menu. The menu
/// shows each item's hotkey (`shortcuts`, action → accelerator) unless it is `unavailable`.
pub fn show_tray(app: &AppHandle, shortcuts: &BTreeMap<String, String>, unavailable: &[String]) {
    let handle = app.clone();
    let keys = menu_shortcuts(shortcuts, unavailable);
    // Status items belong to the main thread.
    let _ = app.run_on_main_thread(move || {
        let result = match handle.tray_by_id(TRAY_ID) {
            // Opened again while ready: the same icon, with this session's keys.
            Some(tray) => {
                crate::platform::refresh_tray_icon(&tray);
                build_menu(&handle, &keys).and_then(|menu| tray.set_menu(Some(menu)))
            }
            None => build_tray(&handle, &keys),
        };
        if let Err(e) = result {
            log::warn!("session icon not shown: {e}");
        }
    });
}

/// The hotkeys the menu shows: the session's registered ones.
fn menu_shortcuts(
    shortcuts: &BTreeMap<String, String>,
    unavailable: &[String],
) -> BTreeMap<String, String> {
    shortcuts
        .iter()
        .filter(|(action, _)| !unavailable.contains(action))
        .map(|(a, k)| (a.clone(), k.clone()))
        .collect()
}

fn build_menu(app: &AppHandle, keys: &BTreeMap<String, String>) -> tauri::Result<Menu<Wry>> {
    // Ids are the hotkey action names (hotkeys::ACTIONS), so both do the same thing, and the
    // item shows that hotkey. Shown only: the hotkey itself is registered globally.
    let item = |id: &str, text: &str| {
        let key = keys.get(id).map(String::as_str);
        MenuItem::with_id(app, id, text, true, key).or_else(|e| {
            log::warn!("menu {id}: shortcut {key:?} not shown: {e}");
            MenuItem::with_id(app, id, text, true, None::<&str>)
        })
    };
    Menu::with_items(
        app,
        &[
            // Starting a session puts the main window away (ADR 0018); this brings it back,
            // for changing a setting (the Timeline's style, say) in the middle of a run.
            // The control panel first: the look and the run in one place (ADR 0028).
            &item("panel", "Control panel")?,
            &item("show", "Open Oversay window")?,
            &item("style", "Next Timeline style")?,
            &PredefinedMenuItem::separator(app)?,
            &item("next", "Start / Next")?,
            &item("previous", "Previous")?,
            &item("pause", "Pause / Resume")?,
            &PredefinedMenuItem::separator(app)?,
            &item("end", "End session")?,
        ],
    )
}

fn build_tray(app: &AppHandle, keys: &BTreeMap<String, String>) -> tauri::Result<()> {
    build_menu_tray(app, build_menu(app, keys))
}

fn build_menu_tray(app: &AppHandle, menu: tauri::Result<Menu<Wry>>) -> tauri::Result<()> {
    let menu = menu?;
    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip("Oversay session")
        .on_menu_event(|app, event| {
            if let Some(action) = hotkeys::action_for(event.id().as_ref()) {
                log::info!("menu {action:?}");
                if let Err(e) = crate::session::act(app, action) {
                    log::warn!("menu {action:?}: {e}");
                }
            }
        });
    match crate::platform::tray_icon() {
        Ok(icon) => tray = tray.icon(icon).icon_as_template(true),
        Err(e) => {
            log::warn!("one-colour icon not loaded: {e}");
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
        }
    }
    tray.build(app)?;
    Ok(())
}

/// Brings the main window back, large, from minimised or hidden; the user can minimise it again.
pub fn show_manager(app: &AppHandle) {
    let Some(window) = app.get_webview_window(crate::MANAGER_LABEL) else {
        return;
    };
    let result = window
        .unminimize()
        .and_then(|()| window.show())
        .and_then(|()| window.maximize())
        .and_then(|()| window.set_focus());
    if let Err(e) = result {
        log::warn!("main window not shown: {e}");
    }
}

/// The icon with nothing running (ADR 0028): no time beside it, and a menu to open the control
/// panel or the main window. It stays for the life of the app.
pub fn show_idle(app: &AppHandle) {
    let handle = app.clone();
    let keys: BTreeMap<String, String> = crate::hotkeys::panel_key()
        .map(|k| BTreeMap::from([("panel".to_string(), k)]))
        .unwrap_or_default();
    let _ = app.run_on_main_thread(move || {
        let result = match handle.tray_by_id(TRAY_ID) {
            Some(tray) => build_idle_menu(&handle, &keys).and_then(|menu| {
                crate::platform::refresh_tray_icon(&tray);
                crate::platform::set_tray_text(&tray, "");
                tray.set_menu(Some(menu))
            }),
            None => build_menu_tray(&handle, build_idle_menu(&handle, &keys)),
        };
        if let Err(e) = result {
            log::warn!("icon not shown: {e}");
        }
    });
}

fn build_idle_menu(app: &AppHandle, keys: &BTreeMap<String, String>) -> tauri::Result<Menu<Wry>> {
    let panel_key = keys.get("panel").map(String::as_str);
    let panel = MenuItem::with_id(app, "panel", "Control panel", true, panel_key)
        .or_else(|_| MenuItem::with_id(app, "panel", "Control panel", true, None::<&str>))?;
    Menu::with_items(
        app,
        &[
            &panel,
            &MenuItem::with_id(app, "show", "Open Oversay window", true, None::<&str>)?,
        ],
    )
}

/// The text beside the session icon (`platform::set_tray_text`).
/// The manager sets it every second from the session's clock.
#[tauri::command]
pub async fn set_tray_title(app: AppHandle, title: String) -> Result<(), String> {
    let handle = app.clone();
    app.run_on_main_thread(move || {
        if let Some(tray) = handle.tray_by_id(TRAY_ID) {
            crate::platform::set_tray_text(&tray, &title);
        }
    })
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    #[test]
    fn the_menu_shows_only_registered_shortcuts() {
        let shortcuts = BTreeMap::from([
            ("next".to_string(), "Control+Alt+ArrowRight".to_string()),
            ("end".to_string(), "Control+Alt+KeyE".to_string()),
        ]);
        let shown = super::menu_shortcuts(&shortcuts, &["end".to_string()]);
        assert_eq!(shown.keys().collect::<Vec<_>>(), ["next"]);
    }
}
