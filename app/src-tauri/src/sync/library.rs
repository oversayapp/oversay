//! The real `Library`: the Decks folder (ADR 0037). Only `deck.md` and `sessions.json` are read;
//! `resources/`, `transcripts/` and `reviews/` are never opened here.

use std::fs;
use std::path::PathBuf;

use super::{Library, LocalDeck, RemoteDeck, Scan};
use crate::files::write_atomically;
use crate::quick::{DECK_SESSIONS, create_deck_in, deck_files_in, deck_id, front_value, today};

/// What a deck with no `sessions.json` yet is saved with: the API wants JSON text, and two
/// computers that both have no sessions then hold the same bytes.
pub const NO_SESSIONS: &str = "{\"version\":1,\"sessions\":[]}\n";

/// The cloud takes a body of at most 2 MB (web-api's README); a deck that couldn't be saved is
/// skipped rather than tried.
const LARGEST_FILE: usize = 1_900_000;

fn is_link(path: &std::path::Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|m| m.file_type().is_symlink())
}

pub struct FolderLibrary(pub PathBuf);

impl FolderLibrary {
    /// The files of the deck with this id.
    fn find(&self, id: &str) -> Result<(PathBuf, PathBuf), String> {
        deck_files_in(&self.0)
            .into_iter()
            .find(|(file, _)| {
                fs::read_to_string(file)
                    .ok()
                    .and_then(|t| deck_id(&t))
                    .as_deref()
                    == Some(id)
            })
            .ok_or_else(|| "the deck is no longer here".into())
    }

    /// The deck as its two files say it is now.
    fn read(
        &self,
        file: &std::path::Path,
        sessions: &std::path::Path,
    ) -> Result<LocalDeck, String> {
        let deck_md = fs::read_to_string(file).map_err(|e| e.to_string())?;
        let id = deck_id(&deck_md).ok_or("no id")?;
        let sessions_json = match fs::read_to_string(sessions) {
            Ok(text) if text.trim().is_empty() => NO_SESSIONS.to_string(),
            Ok(text) => text,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => NO_SESSIONS.to_string(),
            Err(e) => return Err(e.to_string()),
        };
        Ok(LocalDeck {
            id,
            deck_md,
            sessions_json,
        })
    }
}

impl Library for FolderLibrary {
    fn scan(&self) -> Result<Scan, String> {
        // A folder that can't be listed is not an empty Decks folder: nothing in it would
        // otherwise look trashed.
        let mut incomplete = fs::read_dir(&self.0).is_err();
        let mut found = Vec::new();
        let mut unsyncable = Vec::new();
        for (file, sessions) in deck_files_in(&self.0) {
            // A link to another file is never followed: it could point anywhere on the computer.
            if is_link(&file) || is_link(&sessions) {
                log::warn!("sync.deck_skipped reason=symlink");
                incomplete = true;
                continue;
            }
            let Ok(deck_md) = fs::read_to_string(&file) else {
                log::warn!("sync.deck_skipped reason=unreadable");
                incomplete = true;
                continue;
            };
            let Some(id) = deck_id(&deck_md) else {
                // A deck.md that lost its id: not a deck any more, and nothing to match.
                incomplete = true;
                continue;
            };
            let sessions_json = match fs::read_to_string(&sessions) {
                Ok(text) if text.trim().is_empty() => NO_SESSIONS.to_string(),
                Ok(text) => text,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => NO_SESSIONS.to_string(),
                Err(_) => {
                    log::warn!("sync.deck_skipped id={id} reason=sessions_unreadable");
                    unsyncable.push(id);
                    continue;
                }
            };
            if serde_json::from_str::<serde_json::Value>(&sessions_json).is_err() {
                log::warn!("sync.deck_skipped id={id} reason=sessions_not_json");
                unsyncable.push(id);
                continue;
            }
            if deck_md.len() + sessions_json.len() > LARGEST_FILE {
                log::warn!("sync.deck_skipped id={id} reason=too_large");
                unsyncable.push(id);
                continue;
            }
            found.push(LocalDeck {
                id,
                deck_md,
                sessions_json,
            });
        }
        Ok(Scan {
            decks: found,
            unsyncable,
            incomplete,
        })
    }

    fn trash(&self, expected: &LocalDeck) -> Result<(), String> {
        let (file, sessions) = self.find(&expected.id)?;
        if is_link(&file) || is_link(&sessions) {
            return Err("a link".into());
        }
        // Read again just before moving: an edit since the scan is never trashed.
        let now = self.read(&file, &sessions)?;
        if &now != expected {
            return Err("changed meanwhile".into());
        }
        // The deck lives in a folder of its own: the folder goes, with its resources and
        // transcripts, as when the deck is trashed from the app.
        let folder = file.parent().ok_or("no folder")?;
        crate::platform::move_to_trash(folder).map_err(|e| e.to_string())
    }

    fn replace(&self, expected: &LocalDeck, deck: &RemoteDeck) -> Result<(), String> {
        if deck_id(&deck.deck_md).as_deref() != Some(deck.id.as_str()) {
            return Err("its deck.md doesn't carry its id".into());
        }
        let (file, sessions) = self.find(&expected.id)?;
        if is_link(&file) || is_link(&sessions) {
            return Err("a link".into());
        }
        // Read again just before writing: an edit since the scan is never overwritten.
        if &self.read(&file, &sessions)? != expected {
            return Err("changed meanwhile".into());
        }
        write_atomically(&sessions, &deck.sessions_json).map_err(|e| e.to_string())?;
        write_atomically(&file, &deck.deck_md).map_err(|e| e.to_string())
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
        // create_deck_in adds a title to a deck that has none; the deck is kept byte for byte as the
        // cloud has it, so the next comparison finds it the same.
        write_atomically(&file, &deck.deck_md).map_err(|e| format!("Could not save it: {e}"))?;
        write_atomically(&sessions, &deck.sessions_json).map_err(|e| {
            let _ = fs::remove_dir_all(file.parent().unwrap_or(&self.0));
            format!("Could not save its sessions: {e}")
        })
    }
}
