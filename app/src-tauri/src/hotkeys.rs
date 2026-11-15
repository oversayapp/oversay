//! Session hotkeys (spec §5, 006/03): global shortcuts that drive the session while another
//! app (slides, a browser, Zoom) has focus. They are registered only while a session is open and
//! call the engine directly, so they work with every Oversay window hidden.
//!
//! The frontend owns which keys are chosen (settings.json, `src/lib/session/shortcuts.ts`) and
//! passes them when a session opens, as action → accelerator, e.g. `next` → `Control+Alt+ArrowRight`.

use std::collections::BTreeMap;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::session::Action;

/// The actions a shortcut can be set for, by name. Same names, in the same order, as
/// `SHORTCUT_ACTIONS` in shortcuts.ts; the session icon's menu items use them as ids.
pub const ACTIONS: [(&str, Action); 9] = [
    ("next", Action::Next),
    ("previous", Action::Previous),
    ("pause", Action::TogglePause),
    ("end", Action::End),
    ("show", Action::ShowManager),
    ("style", Action::CycleStyle),
    ("darker", Action::Darker),
    ("lighter", Action::Lighter),
    ("panel", Action::TogglePanel),
];

pub fn action_for(name: &str) -> Option<Action> {
    ACTIONS.iter().find(|(n, _)| *n == name).map(|(_, a)| *a)
}

/// Registers the session's shortcuts and returns the actions whose shortcut couldn't be (taken
/// by another app or the system, or not a valid shortcut).
///
/// Never call this or `unregister_all` from a hotkey handler: the plugin holds its lock while a
/// handler runs (see `session::Engine::apply`).
pub fn register(app: &AppHandle, shortcuts: &BTreeMap<String, String>) -> Vec<String> {
    unregister_all(app);
    let mut unavailable = vec![];
    for (name, accelerator) in shortcuts {
        let Some(action) = action_for(name) else {
            log::warn!("unknown hotkey action {name}");
            continue;
        };
        let registered =
            app.global_shortcut()
                .on_shortcut(accelerator.as_str(), move |app, _, event| {
                    if event.state != ShortcutState::Pressed {
                        return;
                    }
                    log::info!("hotkey {action:?}");
                    if let Err(e) = crate::session::act(app, action) {
                        log::warn!("hotkey {action:?}: {e}");
                    }
                });
        if let Err(e) = registered {
            log::warn!("hotkey {name} ({accelerator}) not registered: {e}");
            unavailable.push(name.clone());
        }
    }
    unavailable
}

/// The control panel's key, kept while no session is open so the panel opens any time (ADR 0028).
static PANEL_KEY: Mutex<Option<String>> = Mutex::new(None);

/// The control panel's key, for the icon's menu while no session is open.
pub fn panel_key() -> Option<String> {
    PANEL_KEY.lock().unwrap().clone()
}

/// With no session open, only the control panel's key is registered.
pub fn register_idle(app: &AppHandle) {
    let shortcuts: BTreeMap<String, String> = panel_key()
        .map(|key| BTreeMap::from([("panel".to_string(), key)]))
        .unwrap_or_default();
    register(app, &shortcuts);
}

/// The manager says which key opens the control panel (settings.json, or the default); it is
/// registered now unless a session (not the panel's preview) has registered its own keys, this
/// one among them.
#[tauri::command]
pub async fn set_panel_shortcut(app: AppHandle, accelerator: String) -> Result<(), String> {
    let changed = PANEL_KEY.lock().unwrap().replace(accelerator.clone()) != Some(accelerator);
    if changed && !crate::session::holds_keys(&app) {
        register_idle(&app);
        crate::tray::show_idle(&app);
    }
    Ok(())
}

/// The control panel's key, shown on the panel.
#[tauri::command]
pub async fn panel_shortcut() -> Option<String> {
    panel_key()
}

pub fn unregister_all(app: &AppHandle) {
    if let Err(e) = app.global_shortcut().unregister_all() {
        log::warn!("hotkeys not unregistered: {e}");
    }
}

/// Whether `accelerator` is a shortcut that can be registered now: tried, then released.
/// Settings uses it when you change a shortcut, so a clash shows straight away.
#[tauri::command]
pub async fn check_shortcut(app: AppHandle, accelerator: String) -> Result<(), String> {
    let shortcut: Shortcut = accelerator
        .parse()
        .map_err(|e| format!("{accelerator} isn't a shortcut Oversay can use: {e}"))?;
    let shortcuts = app.global_shortcut();
    if shortcuts.is_registered(shortcut) {
        return Ok(()); // already ours, during a session
    }
    shortcuts
        .register(shortcut)
        .map_err(|_| format!("{accelerator} is already used by another app or the system"))?;
    let _ = shortcuts.unregister(shortcut);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_default_shortcuts_parse() {
        // Same defaults as DEFAULT_SHORTCUTS in src/lib/session/shortcuts.ts.
        for accelerator in [
            "Control+Alt+ArrowRight",
            "Control+Alt+ArrowLeft",
            "Control+Alt+Space",
            "Control+Alt+KeyE",
            "Control+Alt+KeyO",
            "Control+Alt+KeyT",
            "Control+Alt+ArrowUp",
            "Control+Alt+ArrowDown",
            "Control+Alt+KeyP",
            "Control+Alt+Shift+ArrowRight",
            "Control+Alt+Shift+ArrowLeft",
            "Control+Alt+Shift+Space",
            "Control+Alt+Shift+KeyE",
            "Control+Alt+Shift+KeyO",
            "Control+Alt+Shift+KeyT",
            "Control+Alt+Shift+ArrowUp",
            "Control+Alt+Shift+ArrowDown",
            "Control+Alt+Shift+KeyP",
        ] {
            assert!(accelerator.parse::<Shortcut>().is_ok(), "{accelerator}");
        }
    }

    #[test]
    fn action_names_match_the_frontend() {
        // Same list as the SHORTCUT_ACTIONS test in src/lib/session/shortcuts.test.ts.
        let names: Vec<&str> = ACTIONS.iter().map(|(n, _)| *n).collect();
        assert_eq!(
            names,
            [
                "next", "previous", "pause", "end", "show", "style", "darker", "lighter", "panel"
            ]
        );
        assert!(matches!(action_for("pause"), Some(Action::TogglePause)));
        assert!(matches!(action_for("panel"), Some(Action::TogglePanel)));
        assert!(action_for("other").is_none());
    }
}
