//! Edit > Undo and Redo in the Mac menu bar (ADR 0052). While the deck editor says its own
//! history takes undo, they are greyed by that history and sent to the editor; otherwise they
//! stay enabled and undo what the focused field holds, as the standard items do. Windows has no
//! menu bar, so only the keys undo there.

use std::sync::Mutex;

use serde::Deserialize;
use tauri::{AppHandle, Emitter};

/// The items' ids. The tray's menu handler hears them too, and knows nothing by these names.
pub(crate) const UNDO_ID: &str = "edit-undo";
pub(crate) const REDO_ID: &str = "edit-redo";

/// Sent to the manager when an item is chosen while the deck's history takes it, with
/// `"undo"` or `"redo"`. Same name as `EDIT_MENU_EVENT` in src/lib/notes/edit-menu.ts.
pub const EDIT_MENU_EVENT: &str = "edit-menu";

/// What the deck's history can do. Same shape as `DeckUndo` in src/lib/notes/edit-menu.ts.
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
pub struct DeckUndo {
    pub undo: bool,
    pub redo: bool,
}

/// As the manager last said: `None` while a field's own undo takes the items.
static DECK: Mutex<Option<DeckUndo>> = Mutex::new(None);

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Way {
    Undo,
    Redo,
}

impl Way {
    fn name(self) -> &'static str {
        match self {
            Way::Undo => "undo",
            Way::Redo => "redo",
        }
    }
}

fn way(id: &str) -> Option<Way> {
    match id {
        UNDO_ID => Some(Way::Undo),
        REDO_ID => Some(Way::Redo),
        _ => None,
    }
}

/// Whether Undo and Redo are enabled: by the deck's history while it takes them.
fn enabled(deck: Option<DeckUndo>) -> (bool, bool) {
    deck.map_or((true, true), |d| (d.undo, d.redo))
}

/// The manager's word on whose undo the items are, and what the deck's can do.
#[tauri::command]
pub async fn set_edit_menu(deck: Option<DeckUndo>) -> Result<(), String> {
    *DECK.lock().unwrap() = deck;
    let (undo, redo) = enabled(deck);
    log::debug!("menu.edit_state undo={undo} redo={redo} check=epic-043/V5");
    crate::platform::enable_edit_menu(undo, redo);
    Ok(())
}

/// A menu item was chosen; other menus' items are not ours.
pub fn chosen(app: &AppHandle, id: &str) {
    let Some(way) = way(id) else {
        return;
    };
    let deck = DECK.lock().unwrap().is_some();
    log::info!("action: menu {id} deck={deck}");
    if !deck {
        crate::platform::send_native_undo(app, way == Way::Redo);
    } else if let Err(e) = app.emit_to(crate::MANAGER_LABEL, EDIT_MENU_EVENT, way.name()) {
        log::warn!("menu {id}: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_its_own_items_are_undo_and_redo() {
        // The same names as edit-menu.test.ts hears.
        assert_eq!(EDIT_MENU_EVENT, "edit-menu");
        assert_eq!(way("edit-undo").map(Way::name), Some("undo"));
        assert_eq!(way("edit-redo").map(Way::name), Some("redo"));
        assert_eq!(way("quit"), None);
        assert_eq!(crate::tray_menu::choice(UNDO_ID), None);
        assert_eq!(crate::tray_menu::choice(REDO_ID), None);
    }

    #[test]
    fn the_decks_history_enables_the_items_and_otherwise_they_stay_enabled() {
        // The same cases as edit-menu.test.ts sends.
        let sent = |json: &str| serde_json::from_str::<Option<DeckUndo>>(json).unwrap();
        assert_eq!(
            enabled(sent(r#"{"undo":true,"redo":false}"#)),
            (true, false)
        );
        assert_eq!(
            enabled(sent(r#"{"undo":false,"redo":false}"#)),
            (false, false)
        );
        assert_eq!(enabled(sent("null")), (true, true));
    }
}
