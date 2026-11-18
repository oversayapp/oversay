//! Resources move up to the workspace, once (ADR 0046). Before it, a deck had a `resources/`
//! folder of its own; now only a workspace does. The first launch after the update moves a deck's
//! resources into the workspace it is in, copies them into each when it is in several, and leaves
//! them in the deck's folder when it is in none. What was done is written to
//! `resources-moved.json` in the app's data folder, which is also what says it was done, so Undo
//! can put every file back and it never runs twice.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

use crate::quick::deck_folder;
use crate::workspaces::workspace_folder;

const RESOURCES: &str = "resources";
const MANIFEST: &str = "resources-moved.json";

/// One resource that moved: where it was, and where it is now (the first place is where it moved
/// to; any others are copies).
#[derive(serde::Serialize, serde::Deserialize, Debug, PartialEq, Clone)]
pub struct Placed {
    from: PathBuf,
    to: Vec<PathBuf>,
}

/// `dir/name`, or `dir/name 2`, `name 2.ext`… when taken.
fn free_path(dir: &Path, name: &str) -> PathBuf {
    let (stem, ext) = match name.rfind('.').filter(|&i| i > 0) {
        Some(i) => (&name[..i], &name[i..]),
        None => (name, ""),
    };
    (1..)
        .map(|n| {
            dir.join(if n == 1 {
                name.to_string()
            } else {
                format!("{stem} {n}{ext}")
            })
        })
        .find(|p| fs::symlink_metadata(p).is_err())
        .expect("an endless range has a free name")
}

fn copy_tree(from: &Path, to: &Path) -> io::Result<()> {
    let meta = fs::symlink_metadata(from)?;
    if meta.is_dir() {
        fs::create_dir_all(to)?;
        for entry in fs::read_dir(from)? {
            let entry = entry?;
            copy_tree(&entry.path(), &to.join(entry.file_name()))?;
        }
    } else if meta.file_type().is_symlink() {
        // An alias is not followed (the list never does): it is left behind.
        return Ok(());
    } else {
        fs::copy(from, to)?;
    }
    Ok(())
}

fn remove_any(path: &Path) -> io::Result<()> {
    if fs::symlink_metadata(path)?.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
}

fn move_any(from: &Path, to: &Path) -> io::Result<()> {
    fs::rename(from, to).or_else(|_| {
        copy_tree(from, to)?;
        remove_any(from)
    })
}

/// Moves what is in `from` (a deck's `resources/`) into the first of `targets` (workspaces'
/// `resources/`) and copies it into the rest. Nothing is overwritten.
pub fn move_up(from: &Path, targets: &[PathBuf]) -> io::Result<Vec<Placed>> {
    let Some((first, rest)) = targets.split_first() else {
        return Ok(vec![]);
    };
    let Ok(entries) = fs::read_dir(from) else {
        return Ok(vec![]);
    };
    let mut placed = vec![];
    for entry in entries {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let source = entry.path();
        let mut to = vec![];
        // Copied everywhere first and the original removed after, so a failure part-way loses nothing.
        for dir in std::iter::once(first).chain(rest) {
            fs::create_dir_all(dir)?;
            let dest = free_path(dir, &name);
            copy_tree(&source, &dest)?;
            to.push(dest);
        }
        remove_any(&source)?;
        placed.push(Placed { from: source, to });
    }
    let _ = fs::remove_dir(from);
    Ok(placed)
}

/// Puts what `move_up` did back: the first place back where it came from, the copies removed.
pub fn undo(placed: &[Placed]) -> io::Result<usize> {
    let mut back = 0;
    for p in placed {
        let Some((first, rest)) = p.to.split_first() else {
            continue;
        };
        if fs::symlink_metadata(first).is_err() || fs::symlink_metadata(&p.from).is_ok() {
            continue;
        }
        if let Some(parent) = p.from.parent() {
            fs::create_dir_all(parent)?;
        }
        move_any(first, &p.from)?;
        for copy in rest {
            let _ = remove_any(copy);
        }
        back += 1;
    }
    Ok(back)
}

#[derive(serde::Serialize, serde::Deserialize, Default)]
struct Manifest {
    undone: bool,
    moves: Vec<Placed>,
}

fn manifest_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(MANIFEST))
}

/// A deck and the workspaces it is in, as the app knows them.
#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DeckPlan {
    deck_path: String,
    workspace_ids: Vec<String>,
}

/// What the one-time move did, for the note.
#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    files: usize,
    decks: usize,
}

/// Runs once; afterwards (or if `resources-moved.json` exists) it does nothing and says so with none.
#[tauri::command]
pub async fn move_deck_resources(
    app: AppHandle,
    plan: Vec<DeckPlan>,
) -> Result<Option<Summary>, String> {
    let manifest = manifest_path(&app)?;
    if manifest.exists() {
        return Ok(None);
    }
    let mut all = vec![];
    let mut decks = 0;
    for deck in plan {
        let Ok(folder) = deck_folder(&app, &deck.deck_path) else {
            continue;
        };
        let targets: Vec<PathBuf> = deck
            .workspace_ids
            .iter()
            .filter_map(|id| workspace_folder(&app, id).ok())
            .map(|f| f.join(RESOURCES))
            .collect();
        let moved = move_up(&folder.join(RESOURCES), &targets)
            .map_err(|e| format!("Could not move a deck's resources: {e}"))?;
        if !moved.is_empty() {
            decks += 1;
        }
        all.extend(moved);
    }
    let summary = Summary {
        files: all.len(),
        decks,
    };
    let text = serde_json::to_string(&Manifest {
        undone: false,
        moves: all,
    })
    .map_err(|e| e.to_string())?;
    crate::files::write_atomically(&manifest, &text)
        .map_err(|e| format!("Could not record the move: {e}"))?;
    Ok((summary.files > 0).then_some(summary))
}

/// Undo for the note: puts every moved resource back where it came from. Returns how many.
#[tauri::command]
pub async fn undo_resources_move(app: AppHandle) -> Result<usize, String> {
    let path = manifest_path(&app)?;
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut manifest: Manifest = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if manifest.undone {
        return Ok(0);
    }
    let back = undo(&manifest.moves).map_err(|e| format!("Could not put them back: {e}"))?;
    manifest.undone = true;
    let text = serde_json::to_string(&manifest).map_err(|e| e.to_string())?;
    crate::files::write_atomically(&path, &text).map_err(|e| e.to_string())?;
    Ok(back)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("oversay-move-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn deck_with(root: &Path, files: &[&str]) -> PathBuf {
        let res = root.join("Deck").join("resources");
        fs::create_dir_all(&res).unwrap();
        for f in files {
            fs::write(res.join(f), f).unwrap();
        }
        res
    }

    #[test]
    fn a_deck_in_one_workspace_moves_its_resources_up() {
        let root = temp("one");
        let from = deck_with(&root, &["a.pdf", "b.txt"]);
        let ws = root.join("WS").join("resources");
        let placed = move_up(&from, std::slice::from_ref(&ws)).unwrap();
        assert_eq!(placed.len(), 2);
        assert!(ws.join("a.pdf").exists() && ws.join("b.txt").exists());
        assert!(!from.exists(), "the deck's folder of resources is gone");
    }

    #[test]
    fn a_deck_in_several_copies_into_each() {
        let root = temp("many");
        let from = deck_with(&root, &["a.pdf"]);
        let (w1, w2) = (
            root.join("W1").join("resources"),
            root.join("W2").join("resources"),
        );
        move_up(&from, &[w1.clone(), w2.clone()]).unwrap();
        assert_eq!(fs::read_to_string(w1.join("a.pdf")).unwrap(), "a.pdf");
        assert_eq!(fs::read_to_string(w2.join("a.pdf")).unwrap(), "a.pdf");
        assert!(!from.join("a.pdf").exists());
    }

    #[test]
    fn a_deck_in_none_keeps_its_resources() {
        let root = temp("none");
        let from = deck_with(&root, &["a.pdf"]);
        assert!(move_up(&from, &[]).unwrap().is_empty());
        assert!(from.join("a.pdf").exists());
    }

    #[test]
    fn a_taken_name_is_numbered_and_nothing_is_overwritten() {
        let root = temp("taken");
        let from = deck_with(&root, &["a.pdf"]);
        let ws = root.join("WS").join("resources");
        fs::create_dir_all(&ws).unwrap();
        fs::write(ws.join("a.pdf"), "theirs").unwrap();
        move_up(&from, std::slice::from_ref(&ws)).unwrap();
        assert_eq!(fs::read_to_string(ws.join("a.pdf")).unwrap(), "theirs");
        assert_eq!(fs::read_to_string(ws.join("a 2.pdf")).unwrap(), "a.pdf");
    }

    #[test]
    fn a_folder_moves_with_what_is_in_it() {
        let root = temp("folder");
        let from = deck_with(&root, &[]);
        fs::create_dir_all(from.join("Slides")).unwrap();
        fs::write(from.join("Slides").join("1.png"), "x").unwrap();
        let ws = root.join("WS").join("resources");
        move_up(&from, std::slice::from_ref(&ws)).unwrap();
        assert!(ws.join("Slides").join("1.png").exists());
    }

    #[test]
    fn undo_puts_everything_back_and_removes_the_copies() {
        let root = temp("undo");
        let from = deck_with(&root, &["a.pdf"]);
        let (w1, w2) = (
            root.join("W1").join("resources"),
            root.join("W2").join("resources"),
        );
        let placed = move_up(&from, &[w1.clone(), w2.clone()]).unwrap();
        assert_eq!(undo(&placed).unwrap(), 1);
        assert_eq!(fs::read_to_string(from.join("a.pdf")).unwrap(), "a.pdf");
        assert!(!w1.join("a.pdf").exists() && !w2.join("a.pdf").exists());
    }
}
