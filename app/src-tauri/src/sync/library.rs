//! The real `Library`: the Decks folder (ADR 0037). Only `deck.md` and `sessions.json` are read;
//! `resources/`, `transcripts/` and `reviews/` are never opened here.

use std::fs;
use std::path::PathBuf;

use super::{Library, LocalDeck, RemoteDeck, Scan};
use crate::files::write_atomically;
use crate::quick::{DECK_SESSIONS, create_deck_in, deck_files_in, deck_id, front_value, today};
use crate::workspaces;

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

/// The Workspaces folder (ADR 0040), read as a library of one-file items (slice 8): a workspace's
/// `workspace.json` text is the `LocalDeck::deck_md`, and `sessions_json` is empty. Its `resources/`
/// folder is never opened.
pub struct WorkspaceFolder(pub PathBuf);

impl WorkspaceFolder {
    /// The text of the workspace's file, or why it can't be read as saved.
    fn read(file: &std::path::Path) -> Result<String, String> {
        if is_link(file) {
            return Err("a link".into());
        }
        fs::read_to_string(file).map_err(|e| e.to_string())
    }

    /// The cloud's workspace.json as an object. The id in the file is the workspace's identity: a
    /// text that says another id isn't written, so it can't land under the wrong one.
    fn checked(
        workspace: &RemoteDeck,
    ) -> Result<serde_json::Map<String, serde_json::Value>, String> {
        let map = workspaces::parse(&workspace.deck_md)?;
        if workspaces::id_of(&map).as_deref() != Some(workspace.id.as_str()) {
            return Err("its workspace.json doesn't carry its id".into());
        }
        Ok(map)
    }

    /// The workspace's folder and file, only when `expected` is still exactly what is there.
    fn unchanged(&self, expected: &LocalDeck) -> Result<std::path::PathBuf, String> {
        let dir = workspaces::find_in(&self.0, &expected.id)?;
        // Read again just before writing or moving: an edit since the scan is never lost.
        if Self::read(&dir.join(workspaces::WORKSPACE_FILE))? != expected.deck_md {
            return Err("changed meanwhile".into());
        }
        Ok(dir)
    }
}

impl Library for WorkspaceFolder {
    fn scan(&self) -> Result<Scan, String> {
        let mut scan = Scan::default();
        for (_, dir) in workspaces::workspace_dirs(&self.0) {
            let file = dir.join(workspaces::WORKSPACE_FILE);
            let text = match Self::read(&file) {
                Ok(text) => text,
                Err(_) => {
                    // A workspace nobody can read now may be one that was saved: nothing is taken
                    // to be deleted from this scan.
                    log::warn!("sync.workspace_skipped reason=unreadable");
                    scan.incomplete = true;
                    continue;
                }
            };
            let Ok(map) = workspaces::parse(&text) else {
                log::warn!("sync.workspace_skipped reason=not_json");
                scan.incomplete = true;
                continue;
            };
            // No valid id yet: Oversay gives it one when it tidies, and it is saved after that.
            let Some(id) = workspaces::id_of(&map) else {
                continue;
            };
            if text.len() > LARGEST_FILE {
                log::warn!("sync.workspace_skipped id={id} reason=too_large");
                scan.unsyncable.push(id);
                continue;
            }
            scan.decks.push(LocalDeck {
                id,
                deck_md: text,
                sessions_json: String::new(),
            });
        }
        Ok(scan)
    }

    fn add(&self, workspace: &RemoteDeck) -> Result<(), String> {
        let map = Self::checked(workspace)?;
        fs::create_dir_all(&self.0).map_err(|e| e.to_string())?;
        let name = workspaces::name_for_folder(&workspaces::text_of(&map, "name"));
        let folder = workspaces::new_folder(&self.0, &name)?;
        write_atomically(&folder.join(workspaces::WORKSPACE_FILE), &workspace.deck_md).map_err(
            |e| {
                let _ = fs::remove_dir_all(&folder);
                format!("Could not save it: {e}")
            },
        )
    }

    fn replace(&self, expected: &LocalDeck, workspace: &RemoteDeck) -> Result<(), String> {
        Self::checked(workspace)?;
        let dir = self.unchanged(expected)?;
        write_atomically(&dir.join(workspaces::WORKSPACE_FILE), &workspace.deck_md)
            .map_err(|e| e.to_string())
    }

    fn trash(&self, expected: &LocalDeck) -> Result<(), String> {
        // The workspace's folder goes with its resources, as when it is trashed from the app; its
        // decks stay in Decks.
        let dir = self.unchanged(expected)?;
        crate::platform::move_to_trash(&dir).map_err(|e| e.to_string())
    }
}

/// Both folders as one library: a `w_` id is a workspace, anything else a deck.
pub struct Folders {
    pub decks: FolderLibrary,
    pub workspaces: WorkspaceFolder,
}

impl Folders {
    fn of(&self, id: &str) -> &dyn Library {
        if super::is_workspace(id) {
            &self.workspaces
        } else {
            &self.decks
        }
    }
}

impl Library for Folders {
    fn scan(&self) -> Result<Scan, String> {
        let mut scan = self.decks.scan()?;
        let more = self.workspaces.scan()?;
        scan.decks.extend(more.decks);
        scan.unsyncable.extend(more.unsyncable);
        scan.incomplete |= more.incomplete;
        Ok(scan)
    }
    fn add(&self, deck: &RemoteDeck) -> Result<(), String> {
        self.of(&deck.id).add(deck)
    }
    fn replace(&self, expected: &LocalDeck, deck: &RemoteDeck) -> Result<(), String> {
        self.of(&expected.id).replace(expected, deck)
    }
    fn trash(&self, expected: &LocalDeck) -> Result<(), String> {
        self.of(&expected.id).trash(expected)
    }
}
