//! The example deck: "Welcome to Oversay", what Oversay can do, put in Decks on first run as the demo
//! project is put in Projects, and put back from Settings. Built into the app from
//! src/lib/decks/examples/. It is made as a new deck (ADR 0037), with an id and its name as its
//! title; one whose name a deck in Decks already has is left alone, so it is never written over
//! or added twice. (The skill's own examples are for testing the skill, not for people: John,
//! 25 Oct.)

use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::quick::{create_deck_in, deck_names, decks_dir, today};

/// Each example deck's name and text.
const EXAMPLES: [(&str, &str); 1] = [(
    "Welcome to Oversay",
    include_str!("../../src/lib/decks/examples/Welcome to Oversay.md"),
)];

/// The examples no deck in `dir` has the name of.
fn missing_in(dir: &Path) -> Vec<&'static str> {
    let names = deck_names(dir);
    EXAMPLES
        .iter()
        .map(|(name, _)| *name)
        .filter(|name| !names.iter().any(|n| n == name))
        .collect()
}

/// Makes each missing example in `dir`; returns the decks made.
fn install_in(dir: &Path, today: &str) -> Result<Vec<PathBuf>, String> {
    let missing = missing_in(dir);
    EXAMPLES
        .iter()
        .filter(|(name, _)| missing.contains(name))
        .map(|(name, text)| create_deck_in(dir, name, text, today))
        .collect()
}

/// The example decks Decks doesn't have, by name.
#[tauri::command]
pub async fn missing_example_decks(app: AppHandle) -> Result<Vec<String>, String> {
    Ok(missing_in(&decks_dir(&app)?)
        .into_iter()
        .map(String::from)
        .collect())
}

/// Puts the missing example decks in Decks; returns their paths.
#[tauri::command]
pub async fn install_example_decks(app: AppHandle) -> Result<Vec<String>, String> {
    let made = install_in(&decks_dir(&app)?, &today())?;
    log::debug!("{} example decks added", made.len());
    Ok(made
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("oversay-examples-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// Shown as written: `Oversay --check` finds nothing to say about it.
    #[test]
    fn the_examples_are_decks_oversay_reads_as_written() {
        for (name, text) in EXAMPLES {
            assert!(crate::note_lint::lint(text, true).is_empty(), "{name}");
        }
    }

    #[test]
    fn the_example_is_made_as_a_new_deck_once() {
        let dir = temp_dir("install");
        let made = install_in(&dir, "2026-10-25").unwrap();
        let intro = dir.join("Welcome to Oversay 2026-10-25").join("deck.md");
        assert_eq!(made, vec![intro.clone()]);
        let text = fs::read_to_string(&intro).unwrap();
        assert!(
            text.starts_with("---\naudience: Anyone trying Oversay\n"),
            "{text}"
        );
        assert!(
            text.contains("\nid: d_") && text.contains("\ntitle: Welcome to Oversay\n"),
            "{text}"
        );
        // A second start, and an example the person changed: nothing made, nothing written over.
        fs::write(&intro, "## Mine\n").unwrap();
        assert!(install_in(&dir, "2026-10-26").unwrap().is_empty());
        assert_eq!(fs::read_to_string(&intro).unwrap(), "## Mine\n");
        // Deleted: it comes back, once.
        fs::remove_dir_all(intro.parent().unwrap()).unwrap();
        assert_eq!(missing_in(&dir), vec!["Welcome to Oversay"]);
        let back = install_in(&dir, "2026-10-26").unwrap();
        assert_eq!(
            back,
            vec![dir.join("Welcome to Oversay 2026-10-26").join("deck.md")]
        );
        assert!(missing_in(&dir).is_empty());
        fs::remove_dir_all(&dir).unwrap();
    }
}
