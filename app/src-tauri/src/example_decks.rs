//! The example deck: "Welcome to Oversay", what Oversay can do, put in Decks on first run as the demo
//! project is put in Projects, and put back from Settings. Built into the app from
//! src/lib/decks/examples/. It is made as a new deck (ADR 0037), with an id and its name as its
//! title; one whose name a deck in Decks already has is left alone, so it is never written over
//! or added twice. (The skill's own examples are for testing the skill, not for people: John,
//! 25 Oct.)

use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::quick::{create_deck_in, deck_names, decks_dir, today};
use crate::workspaces::{make_unless_named, root};

/// Each example deck's name and text.
const EXAMPLES: [(&str, &str); 4] = [
    (
        "Welcome to Oversay",
        include_str!("../../src/lib/decks/examples/Welcome to Oversay.md"),
    ),
    (
        "Notes on screen, not in your way",
        include_str!("../../src/lib/decks/examples/Notes on screen, not in your way.md"),
    ),
    (
        "Why bees matter",
        include_str!("../../src/lib/decks/examples/Why bees matter.md"),
    ),
    (
        "Interview talking points",
        include_str!("../../src/lib/decks/examples/Interview talking points.md"),
    ),
];

/// The example workspaces: name, tag, description and the ids of their decks, which the examples
/// carry in their front matter so a workspace can list them before they are made. "Oversay talk"
/// holds two decks; "Biology seminar" one; the interview deck is in none, so Unsorted shows.
const WORKSPACES: [(&str, &str, &str, &[&str]); 2] = [
    (
        "Oversay talk",
        "Talks",
        "The Oversay conference talk, and the welcome deck that shows what it does.",
        &["d_exconf", "d_exwelcome"],
    ),
    (
        "Biology seminar",
        "Study",
        "This term's seminar on bees: the talk, and notes for the questions.",
        &["d_exsemin"],
    ),
];

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

/// Makes each example workspace `root` has none of the name of; returns how many were made.
fn install_workspaces_in(root: &Path) -> Result<usize, String> {
    let mut made = 0;
    for (name, tag, notes, decks) in WORKSPACES {
        if make_unless_named(root, name, tag, notes, decks)? {
            made += 1;
        }
    }
    Ok(made)
}

/// The example decks Decks doesn't have, by name.
#[tauri::command]
pub async fn missing_example_decks(app: AppHandle) -> Result<Vec<String>, String> {
    Ok(missing_in(&decks_dir(&app)?)
        .into_iter()
        .map(String::from)
        .collect())
}

/// Puts the missing example decks in Decks, and the missing example workspaces in Workspaces; returns
/// the decks' paths.
#[tauri::command]
pub async fn install_example_decks(app: AppHandle) -> Result<Vec<String>, String> {
    let made = install_in(&decks_dir(&app)?, &today())?;
    let spaces = install_workspaces_in(&root(&app)?)?;
    log::debug!("{} example decks and {spaces} workspaces added", made.len());
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

    /// The examples carry the ids their workspaces list, and every workspace deck is an example.
    #[test]
    fn the_workspaces_list_the_ids_the_examples_carry() {
        let ids: Vec<String> = EXAMPLES
            .iter()
            .map(|(_, text)| {
                let line = text.lines().find(|l| l.starts_with("id: ")).expect("an id");
                line["id: ".len()..].trim().to_string()
            })
            .collect();
        assert_eq!(ids.len(), 4);
        for (name, _, _, decks) in WORKSPACES {
            assert!(!decks.is_empty(), "{name}");
            for id in decks {
                assert!(ids.iter().any(|i| i == id), "{name}: {id}");
            }
        }
        // The interview deck is in no workspace, so Unsorted shows on a first run.
        let interview = ids.last().unwrap();
        assert!(
            WORKSPACES
                .iter()
                .all(|(_, _, _, d)| !d.contains(&interview.as_str()))
        );
        // "Oversay talk" holds two decks: the talk and the welcome.
        assert_eq!(WORKSPACES[0].3.len(), 2);
    }

    #[test]
    fn the_example_workspaces_are_made_once_with_their_decks() {
        let dir = temp_dir("workspaces");
        assert_eq!(install_workspaces_in(&dir).unwrap(), 2);
        assert_eq!(install_workspaces_in(&dir).unwrap(), 0);
        let text = fs::read_to_string(dir.join("Oversay talk").join("workspace.json")).unwrap();
        assert!(
            text.contains("d_exconf") && text.contains("d_exwelcome"),
            "{text}"
        );
        assert!(text.contains("Talks"), "{text}");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_example_is_made_as_a_new_deck_once() {
        let dir = temp_dir("install");
        let made = install_in(&dir, "2026-10-25").unwrap();
        let intro = dir.join("Welcome to Oversay 2026-10-25").join("deck.md");
        assert_eq!(made.len(), 4);
        assert!(made.contains(&intro));
        let text = fs::read_to_string(&intro).unwrap();
        assert!(
            text.starts_with("---\nid: d_exwelcome\naudience: Anyone trying Oversay\n"),
            "{text}"
        );
        assert!(text.contains("\ntitle: Welcome to Oversay\n"), "{text}");
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
