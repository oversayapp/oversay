//! App-wide settings in `settings.json` in the config folder. The frontend owns the
//! format (`src/lib/settings.ts`) and saves changes; Rust only reads the appearance at
//! startup so the first window already has the chosen theme (no flash of the other one).

use std::fs;

use tauri::{AppHandle, Theme};

use crate::files::config_path;

pub const SETTINGS_FILE: &str = "settings.json";

/// The theme saved in the settings text, or None to follow the system.
fn saved_theme(text: &str) -> Option<Theme> {
    let settings: serde_json::Value = serde_json::from_str(text).ok()?;
    match settings.get("appearance")?.as_str()? {
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        _ => None,
    }
}

/// Applies the saved appearance to the whole app. Missing or unreadable settings mean System.
pub fn apply_saved_appearance(app: &AppHandle) {
    let theme = config_path(app, SETTINGS_FILE)
        .ok()
        .and_then(|path| fs::read_to_string(path).ok())
        .and_then(|text| saved_theme(&text));
    log::debug!("startup appearance: {theme:?}");
    app.set_theme(theme);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_light_and_dark() {
        assert_eq!(saved_theme(r#"{"appearance":"light"}"#), Some(Theme::Light));
        assert_eq!(
            saved_theme(r#"{"appearance":"dark","other":1}"#),
            Some(Theme::Dark)
        );
    }

    #[test]
    fn anything_else_follows_the_system() {
        assert_eq!(saved_theme(r#"{"appearance":"system"}"#), None);
        assert_eq!(saved_theme(r#"{"appearance":"purple"}"#), None);
        assert_eq!(saved_theme(r#"{}"#), None);
        assert_eq!(saved_theme("not json"), None);
    }
}
