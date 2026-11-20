//! The real `Library`: the Decks folder (ADR 0037). Only `deck.md` and `sessions.json` are read;
//! `resources/`, `transcripts/` and `reviews/` are never opened here.

use std::fs;
use std::path::PathBuf;

use super::{Library, LocalDeck, RemoteDeck};
use crate::files::write_atomically;
use crate::quick::{DECK_SESSIONS, create_deck_in, deck_files_in, deck_id, front_value, today};

/// What a deck with no `sessions.json` yet is saved with: the API wants JSON text, and two
/// computers that both have no sessions then hold the same bytes.
pub const NO_SESSIONS: &str = "{\"version\":1,\"sessions\":[]}\n";

/// The cloud takes a body of at most 2 MB (web-api's README); a deck that couldn't be saved is
/// skipped rather than tried.
const LARGEST_FILE: usize = 1_900_000;

pub struct FolderLibrary(pub PathBuf);

impl Library for FolderLibrary {
    fn decks(&self) -> Result<Vec<LocalDeck>, String> {
        let mut found = Vec::new();
        for (file, sessions) in deck_files_in(&self.0) {
            let Ok(deck_md) = fs::read_to_string(&file) else {
                log::warn!("sync.deck_skipped reason=unreadable");
                continue;
            };
            let Some(id) = deck_id(&deck_md) else {
                continue;
            };
            let sessions_json = match fs::read_to_string(&sessions) {
                Ok(text) if text.trim().is_empty() => NO_SESSIONS.to_string(),
                Ok(text) => text,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => NO_SESSIONS.to_string(),
                Err(_) => {
                    log::warn!("sync.deck_skipped id={id} reason=sessions_unreadable");
                    continue;
                }
            };
            if serde_json::from_str::<serde_json::Value>(&sessions_json).is_err() {
                log::warn!("sync.deck_skipped id={id} reason=sessions_not_json");
                continue;
            }
            if deck_md.len() + sessions_json.len() > LARGEST_FILE {
                log::warn!("sync.deck_skipped id={id} reason=too_large");
                continue;
            }
            found.push(LocalDeck {
                id,
                deck_md,
                sessions_json,
            });
        }
        Ok(found)
    }

    fn add(&self, deck: &RemoteDeck) -> Result<(), String> {
        // The id in the file is the deck's identity (ADR 0037): a deck whose own text says another
        // id isn't made, so it can't land under the wrong one.
        if deck_id(&deck.deck_md).as_deref() != Some(deck.id.as_str()) {
            return Err("its deck.md doesn't carry its id".into());
        }
        let title = front_value(&deck.deck_md, "title").unwrap_or_default();
        // A folder named as a new deck's is (`<title> <day>`, numbered when taken).
        let file = create_deck_in(&self.0, &title, &deck.deck_md, &today())?;
        let sessions = file.with_file_name(DECK_SESSIONS);
        write_atomically(&sessions, &deck.sessions_json).map_err(|e| {
            let _ = fs::remove_dir_all(file.parent().unwrap_or(&self.0));
            format!("Could not save its sessions: {e}")
        })
    }
}
