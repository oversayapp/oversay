//! Files in `Documents/Oversay/Quick notes` (Markdown, ADR 0026) and `Documents/Oversay/Quick
//! talks` (one-talk project files), and `Documents/Oversay/Decks` (Markdown decks of flashcards,
//! ADR 0036). Quick notes and Quick talks are flat: one file per note or talk, named after it. A
//! deck is a folder holding `deck.md` and its `sessions.json` (ADR 0037); a lone `.md` that
//! lands in Decks is moved into a folder of its own and given an id. The frontend
//! owns the formats; this lists, creates, reads, writes, renames and trashes them, and refuses any
//! path that isn't a file of that kind in its folder (a deck's, one level down). While the app
//! runs it watches the folders, so files written outside Oversay show up (ADR 0034).

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{DebounceEventResult, Debouncer, new_debouncer};
use tauri::{AppHandle, Emitter, Manager};

use crate::files::{folder_name, write_atomically};

/// The kinds of quick file. The names are the `kind` argument the frontend sends
/// (`QUICK_KINDS` in src/lib/notes/files.ts).
#[derive(Clone, Copy, Debug, PartialEq)]
enum Kind {
    Notes,
    Talks,
    Decks,
}

impl Kind {
    fn parse(kind: &str) -> Result<Kind, String> {
        match kind {
            "notes" => Ok(Kind::Notes),
            "talks" => Ok(Kind::Talks),
            "decks" => Ok(Kind::Decks),
            _ => Err(format!("Unknown kind of quick file: {kind}")),
        }
    }

    /// The name `parse` takes back.
    fn name(self) -> &'static str {
        match self {
            Kind::Notes => "notes",
            Kind::Talks => "talks",
            Kind::Decks => "decks",
        }
    }

    fn folder(self) -> &'static str {
        match self {
            Kind::Notes => "Quick notes",
            Kind::Talks => "Quick talks",
            Kind::Decks => "Decks",
        }
    }

    fn ext(self) -> &'static str {
        match self {
            Kind::Notes | Kind::Decks => ".md",
            Kind::Talks => ".oversay.json",
        }
    }

    fn untitled(self) -> &'static str {
        match self {
            Kind::Notes => "Untitled note",
            Kind::Talks => "Untitled talk",
            Kind::Decks => "Untitled deck",
        }
    }
}

fn kind_dir(app: &AppHandle, kind: Kind) -> Result<PathBuf, String> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|e| format!("Could not find the Documents folder: {e}"))?;
    let dir = documents.join("Oversay").join(kind.folder());
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    Ok(dir)
}

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuickFile {
    path: String,
    /// The file name without its extension: the note's or talk's name.
    name: String,
    /// When it was last written, in milliseconds since 1970.
    modified_ms: i64,
}

fn quick_file(path: &Path, name: String) -> QuickFile {
    let modified = fs::metadata(path).and_then(|m| m.modified()).ok();
    QuickFile {
        path: path.to_string_lossy().into_owned(),
        name,
        modified_ms: modified
            .map(|m| chrono::DateTime::<chrono::Utc>::from(m).timestamp_millis())
            .unwrap_or(0),
    }
}

/// The files of `kind` in its folder, and for decks each deck folder's deck; hidden files and
/// anything else are left out.
fn list_in(dir: &Path, kind: Kind) -> std::io::Result<Vec<QuickFile>> {
    let mut found = Vec::new();
    for entry in fs::read_dir(dir)?.filter_map(Result::ok) {
        let file_name = entry.file_name().to_string_lossy().into_owned();
        if file_name.starts_with('.') {
            continue;
        }
        // A deck's folder, never one reached through a link.
        if kind == Kind::Decks && entry.file_type().is_ok_and(|t| t.is_dir()) {
            if let Some(file) = deck_file(&entry.path()) {
                found.push(quick_file(&file, deck_name(&file_name)));
            }
            continue;
        }
        let Some(name) = file_name.strip_suffix(kind.ext()) else {
            continue;
        };
        if name.is_empty() || !entry.path().is_file() {
            continue;
        }
        found.push(quick_file(&entry.path(), name.to_string()));
    }
    Ok(found)
}

// ---- decks as folders (ADR 0037)

/// The folder of the deck at `path`, a deck file checked as every command checks it; refused for
/// a deck that is still a lone file, which has no folder yet.
pub(crate) fn deck_folder(app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    let dir = kind_dir(app, Kind::Decks)?;
    let file = checked(&dir, Kind::Decks, path)?;
    if !in_own_folder(&dir, &file) {
        return Err("This deck isn't in a folder of its own yet; try again in a moment.".into());
    }
    Ok(file
        .parent()
        .expect("a deck in a folder has one")
        .to_path_buf())
}

/// The Decks folder, made if missing.
pub(crate) fn decks_dir(app: &AppHandle) -> Result<PathBuf, String> {
    kind_dir(app, Kind::Decks)
}

/// The name of every deck in `dir`, as the list shows it before reading front matter.
pub(crate) fn deck_names(dir: &Path) -> Vec<String> {
    list_in(dir, Kind::Decks)
        .map(|found| found.into_iter().map(|f| f.name).collect())
        .unwrap_or_default()
}

/// The deck's own file in its folder, and its sessions beside it.
const DECK_FILE: &str = "deck.md";
const DECK_SESSIONS: &str = "sessions.json";

/// The deck in `folder`: its `deck.md`, or else the folder's only `.md` file. None when it has
/// neither, and so is not a deck.
fn deck_file(folder: &Path) -> Option<PathBuf> {
    let named = folder.join(DECK_FILE);
    if named.is_file() {
        return Some(named);
    }
    let mut found = fs::read_dir(folder)
        .ok()?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .filter(|p| is_kind_file(p, Kind::Decks) && p.is_file());
    let only = found.next()?;
    found.next().is_none().then_some(only)
}

/// A deck folder's name in its parts: `Weekly standup 2026-10-25 (2)` is the title, the day it
/// was made and the counter added on a clash. Either of the last two may be missing.
fn deck_folder_parts(folder: &str) -> (&str, Option<&str>) {
    static PARTS: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
        regex::Regex::new(r"^(.*?)(?: (\d{4}-\d{2}-\d{2}))?(?: \(\d+\))?$").unwrap()
    });
    let parts = PARTS
        .captures(folder)
        .expect("the pattern matches any name");
    let title = parts.get(1).map_or("", |m| m.as_str());
    if title.is_empty() {
        return (folder, None);
    }
    (title, parts.get(2).map(|m| m.as_str()))
}

/// A deck's name from its folder's: the folder's name without its date (and counter). The
/// frontend's `deckFolderName` does the same; both test deck-folders.json.
fn deck_name(folder: &str) -> String {
    deck_folder_parts(folder).0.to_string()
}

pub(crate) fn today() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// `<dir>/<title> <today>/deck.md`, or `… (2)`, `… (3)` when that folder is taken: a new deck is
/// always a new folder, whatever its title (ADR 0037). The text gets an id and a title when it
/// has none.
pub(crate) fn create_deck_in(
    dir: &Path,
    name: &str,
    contents: &str,
    today: &str,
) -> Result<PathBuf, String> {
    let title = name.split_whitespace().collect::<Vec<_>>().join(" ");
    let title = if title.is_empty() {
        Kind::Decks.untitled().to_string()
    } else {
        title
    };
    let base = format!("{} {today}", folder_name(&title));
    for n in 1..1000 {
        let folder = dir.join(if n == 1 {
            base.clone()
        } else {
            format!("{base} ({n})")
        });
        match fs::create_dir(&folder) {
            Ok(()) => {
                let file = folder.join(DECK_FILE);
                return write_atomically(&file, &with_deck_identity(contents, &title))
                    .map(|()| file.clone())
                    .map_err(|e| {
                        let _ = fs::remove_dir_all(&folder);
                        format!("Could not save {}: {e}", file.display())
                    });
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("Could not create {}: {e}", folder.display())),
        }
    }
    Err(format!("Too many called {base}"))
}

/// The deck's text with an `id` and a `title` in its front matter: a new id when it has no valid
/// one, and `title` when it has none. Everything else stays as it was. Front matter lines are
/// `key: value`, as `setFrontValue` in src/lib/notes/format.ts writes them.
fn with_deck_identity(text: &str, title: &str) -> String {
    let eol = if text.contains("\r\n") { "\r\n" } else { "\n" };
    let lines: Vec<&str> = text.split_inclusive('\n').collect();
    let fence = |l: &str| l.trim_end_matches(['\r', '\n']) == "---";
    let end = (lines.len() > 1 && fence(lines[0]))
        .then(|| lines.iter().skip(1).position(|l| fence(l)).map(|p| p + 1))
        .flatten();
    let front = end.map_or(&[][..], |end| &lines[1..end]);
    let value = |key: &str| {
        front.iter().find_map(|l| {
            let (k, v) = l.split_once(':')?;
            k.eq_ignore_ascii_case(key).then(|| v.trim().to_string())
        })
    };
    let has_id =
        value("id").is_some_and(|id| crate::ids::is_valid_id(crate::ids::DECK_PREFIX, &id));
    let mut added = String::new();
    if !has_id {
        added += &format!("id: {}{eol}", crate::ids::new_id(crate::ids::DECK_PREFIX));
    }
    if value("title").is_none_or(|t| t.is_empty()) {
        added += &format!("title: {title}{eol}");
    }
    let Some(end) = end else {
        return format!("---{eol}{added}---{eol}{text}");
    };
    // A malformed id is replaced, not left first in line before the new one.
    let kept = front.iter().filter(|l| {
        has_id
            || !l
                .split_once(':')
                .is_some_and(|(k, _)| k.eq_ignore_ascii_case("id"))
    });
    let mut out = lines[0].to_string();
    out.extend(kept.copied());
    out += &added;
    out.extend(lines[end..].iter().copied());
    out
}

/// Whether the deck file at `file` is in a folder of its own rather than a lone file in `dir`.
fn in_own_folder(dir: &Path, file: &Path) -> bool {
    !same_dir(file.parent(), dir)
}

fn same_dir(a: Option<&Path>, b: &Path) -> bool {
    matches!((a.map(Path::canonicalize), b.canonicalize()), (Some(Ok(a)), Ok(b)) if a == b)
}

/// Renames a deck: its folder becomes `<name> <date>`, keeping the date it had, with a counter
/// when another deck has that name; a lone deck file is renamed as before, with its sessions.
/// Returns the deck file's new path. The deck's `title` is the frontend's to write.
fn rename_deck_in(dir: &Path, path: &str, name: &str) -> Result<PathBuf, String> {
    let from = checked(dir, Kind::Decks, path)?;
    if !in_own_folder(dir, &from) {
        let to = rename_in(dir, Kind::Decks, path, name)?;
        move_sessions(dir, &from, Some(&to));
        return Ok(to);
    }
    let folder = from.parent().expect("a deck in a folder has one");
    let current = folder
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let (title, date) = deck_folder_parts(&current);
    let stem = if name.trim().is_empty() {
        Kind::Decks.untitled().to_string()
    } else {
        folder_name(name)
    };
    if title == stem {
        return Ok(from);
    }
    let base = match date {
        Some(date) => format!("{stem} {date}"),
        None => stem,
    };
    for n in 1..1000 {
        let to = dir.join(if n == 1 {
            base.clone()
        } else {
            format!("{base} ({n})")
        });
        // Taken by another deck (a case-only change is the same folder on a Mac).
        if to.exists() && !same_dir(Some(&to), folder) {
            continue;
        }
        fs::rename(folder, &to).map_err(|e| format!("Could not rename {path}: {e}"))?;
        return Ok(to.join(from.file_name().expect("a deck file has a name")));
    }
    Err(format!("Too many called {base}"))
}

/// `<dir>/<name>.ext`, or `<name> 2.ext`, … when taken. Made with create-new, so it never
/// overwrites a file, then written.
fn create_in(dir: &Path, kind: Kind, name: &str, contents: &str) -> Result<PathBuf, String> {
    let base = if name.trim().is_empty() {
        kind.untitled().to_string()
    } else {
        folder_name(name)
    };
    for n in 1..1000 {
        let stem = if n == 1 {
            base.clone()
        } else {
            format!("{base} {n}")
        };
        let file = dir.join(format!("{stem}{}", kind.ext()));
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&file)
        {
            Ok(_) => {
                return write_atomically(&file, contents)
                    .map(|()| file.clone())
                    .map_err(|e| {
                        let _ = fs::remove_file(&file);
                        format!("Could not save {}: {e}", file.display())
                    });
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("Could not create {}: {e}", file.display())),
        }
    }
    Err(format!("Too many called {base}"))
}

/// The path, if it names a file of `kind` directly in `dir` (which must exist), or a deck's file
/// in its folder there: the folder's deck, not just any file in it.
fn checked(dir: &Path, kind: Kind, path: &str) -> Result<PathBuf, String> {
    let file = PathBuf::from(path);
    let refuse = || Err(format!("{path} is not in {}", kind.folder()));
    let Some(name) = file.file_name().map(|n| n.to_string_lossy().into_owned()) else {
        return refuse();
    };
    if !name.ends_with(kind.ext()) || name.starts_with('.') {
        return refuse();
    }
    let parent = file.parent().unwrap_or(Path::new(""));
    if same_dir(Some(parent), dir) {
        return Ok(file);
    }
    // One level down, in a deck folder that is itself in `dir`, not reached through a link.
    let in_deck = kind == Kind::Decks
        && parent
            .file_name()
            .is_some_and(|n| !n.to_string_lossy().starts_with('.'))
        && parent.canonicalize().is_ok_and(|real| {
            same_dir(real.parent(), dir) && real.file_name() == parent.file_name()
        })
        && deck_file(parent).is_some_and(|f| f.file_name() == file.file_name());
    if !in_deck {
        return refuse();
    }
    Ok(file)
}

fn rename_in(dir: &Path, kind: Kind, path: &str, name: &str) -> Result<PathBuf, String> {
    let from = checked(dir, kind, path)?;
    let stem = if name.trim().is_empty() {
        kind.untitled().to_string()
    } else {
        folder_name(name)
    };
    let to = dir.join(format!("{stem}{}", kind.ext()));
    if to.file_name() == from.file_name() {
        return Ok(from);
    }
    // A different file already has the name (a case-only change is the same file on a Mac).
    let taken = to.exists()
        && !matches!((to.canonicalize(), from.canonicalize()), (Ok(a), Ok(b)) if a == b);
    if taken {
        return Err(format!("There is already one called {stem}"));
    }
    fs::rename(&from, &to).map_err(|e| format!("Could not rename {path}: {e}"))?;
    Ok(to)
}

/// Where a lone deck's sessions are kept (ADR 0036): beside the decks, in a hidden folder,
/// one file per deck named after it. A deck in a folder keeps them in its folder (ADR 0037).
const SESSIONS_DIR: &str = ".sessions";

fn sessions_file(dir: &Path, deck: &Path) -> PathBuf {
    if in_own_folder(dir, deck) {
        return deck.with_file_name(DECK_SESSIONS);
    }
    let stem = deck
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    dir.join(SESSIONS_DIR).join(format!("{stem}.json"))
}

/// The deck's sessions file as text, or "" when it has none yet.
#[tauri::command]
pub async fn read_deck_sessions(app: AppHandle, path: String) -> Result<String, String> {
    let dir = kind_dir(&app, Kind::Decks)?;
    let file = sessions_file(&dir, &checked(&dir, Kind::Decks, &path)?);
    match fs::read_to_string(&file) {
        Ok(text) => Ok(text),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(format!("Could not read the sessions of {path}: {e}")),
    }
}

/// Writes the deck's sessions file, making a lone deck's sessions folder when it is the first.
#[tauri::command]
pub async fn write_deck_sessions(
    app: AppHandle,
    path: String,
    contents: String,
) -> Result<(), String> {
    let dir = kind_dir(&app, Kind::Decks)?;
    let file = sessions_file(&dir, &checked(&dir, Kind::Decks, &path)?);
    if let Some(sessions) = file.parent() {
        fs::create_dir_all(sessions).map_err(|e| format!("Could not keep the session: {e}"))?;
    }
    write_atomically(&file, &contents)
        .map_err(|e| format!("Could not keep the session of {path}: {e}"))
}

/// A lone deck's sessions follow it when it is renamed or moved to the Trash; a deck without any
/// has nothing to move. A deck in a folder takes them along.
fn move_sessions(dir: &Path, from: &Path, to: Option<&Path>) {
    let old = sessions_file(dir, from);
    if !old.exists() {
        return;
    }
    let moved = match to {
        Some(to) => fs::rename(&old, sessions_file(dir, to)).map_err(|e| e.to_string()),
        None => crate::platform::move_to_trash(&old).map_err(|e| e.to_string()),
    };
    if let Err(e) = moved {
        log::warn!("sessions of {} not moved: {e}", from.display());
    }
}

#[tauri::command]
pub async fn list_quick_files(app: AppHandle, kind: String) -> Result<Vec<QuickFile>, String> {
    let kind = Kind::parse(&kind)?;
    let dir = kind_dir(&app, kind)?;
    list_in(&dir, kind).map_err(|e| format!("Could not list {}: {e}", dir.display()))
}

/// Makes a new file of `kind` called `name` (numbered if taken) and returns its path.
#[tauri::command]
pub async fn create_quick_file(
    app: AppHandle,
    kind: String,
    name: String,
    contents: String,
) -> Result<String, String> {
    let kind = Kind::parse(&kind)?;
    let dir = kind_dir(&app, kind)?;
    let file = match kind {
        Kind::Decks => create_deck_in(&dir, &name, &contents, &today())?,
        _ => create_in(&dir, kind, &name, &contents)?,
    };
    log::debug!("new quick file {}", file.display());
    Ok(file.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn read_quick_file(app: AppHandle, kind: String, path: String) -> Result<String, String> {
    let kind = Kind::parse(&kind)?;
    let file = checked(&kind_dir(&app, kind)?, kind, &path)?;
    fs::read_to_string(&file).map_err(|e| format!("Could not read {path}: {e}"))
}

#[tauri::command]
pub async fn write_quick_file(
    app: AppHandle,
    kind: String,
    path: String,
    contents: String,
) -> Result<(), String> {
    let kind = Kind::parse(&kind)?;
    let file = checked(&kind_dir(&app, kind)?, kind, &path)?;
    log::debug!("write quick file {path} ({} bytes)", contents.len());
    write_atomically(&file, &contents).map_err(|e| format!("Could not save {path}: {e}"))
}

/// Renames the file to `name` and returns its new path; refuses a name already taken, except by
/// a deck in a folder, which is numbered (two decks may share a name, ADR 0037).
#[tauri::command]
pub async fn rename_quick_file(
    app: AppHandle,
    kind: String,
    path: String,
    name: String,
) -> Result<String, String> {
    let kind = Kind::parse(&kind)?;
    let dir = kind_dir(&app, kind)?;
    let to = match kind {
        Kind::Decks => rename_deck_in(&dir, &path, &name)?,
        _ => rename_in(&dir, kind, &path, &name)?,
    };
    Ok(to.to_string_lossy().into_owned())
}

/// Moves the file to the system Trash (ADR 0015); a deck in a folder goes with its folder.
#[tauri::command]
pub async fn trash_quick_file(app: AppHandle, kind: String, path: String) -> Result<(), String> {
    let kind = Kind::parse(&kind)?;
    let dir = kind_dir(&app, kind)?;
    let mut file = checked(&dir, kind, &path)?;
    if kind == Kind::Decks && in_own_folder(&dir, &file) {
        file.pop();
    } else if kind == Kind::Decks {
        move_sessions(&dir, &file, None);
    }
    log::debug!("move to Trash {}", file.display());
    crate::platform::move_to_trash(&file)
        .map_err(|e| format!("Could not move {path} to the Trash: {e}"))
}

// ---- decks that arrive without Oversay (task 268, ADR 0037)

/// The day a file was made (or last changed, where the system doesn't say), as `YYYY-MM-DD`.
fn made_on(file: &Path) -> String {
    fs::metadata(file)
        .and_then(|m| m.created().or_else(|_| m.modified()))
        .map(|t| {
            chrono::DateTime::<chrono::Local>::from(t)
                .format("%Y-%m-%d")
                .to_string()
        })
        .unwrap_or_else(|_| today())
}

/// Whether `folder` is one a move that stopped part-way left: nothing in it, or only the sessions
/// it was moving (and a Finder `.DS_Store`). The move uses it again instead of making another.
fn unfinished_move(folder: &Path) -> bool {
    fs::read_dir(folder).is_ok_and(|entries| {
        entries.filter_map(Result::ok).all(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            name == DECK_SESSIONS || name == ".DS_Store"
        })
    })
}

/// Moves the lone deck `from` into `<name> <day it was made>/deck.md`, with its sessions as
/// `sessions.json`, and gives it an id and a title. Each step is a rename, so nothing is ever in
/// two places, and a move that stops part-way finishes on the next try: the sessions go first
/// (the deck still opens without them), then the deck, then its id; a folder left with nothing
/// else in it is used again, and a deck moved without its id gets one from `identify_decks`.
fn move_into_folder(dir: &Path, from: &Path) -> Result<PathBuf, String> {
    let stem = from
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    // Gone since it was listed (moved by another run): nothing to do, and no folder to make.
    if !from.is_file() {
        return Err(format!("{stem} is no longer in Decks"));
    }
    let base = format!("{} {}", folder_name(&stem), made_on(from));
    let folder = (1..1000)
        .map(|n| {
            dir.join(if n == 1 {
                base.clone()
            } else {
                format!("{base} ({n})")
            })
        })
        .find(|f| !f.exists() || (f.is_dir() && unfinished_move(f)))
        .ok_or_else(|| format!("Too many called {base}"))?;
    fs::create_dir_all(&folder).map_err(|e| format!("Could not make {}: {e}", folder.display()))?;
    // A folder this left with nothing in it goes again.
    let tidy = |e: String| {
        if holds_nothing(&folder) {
            let _ = fs::remove_dir(&folder);
        }
        e
    };
    let sessions = sessions_file(dir, from);
    let moved_sessions = folder.join(DECK_SESSIONS);
    if sessions.exists() && !moved_sessions.exists() {
        fs::rename(&sessions, &moved_sessions)
            .map_err(|e| tidy(format!("Could not move the sessions of {stem}: {e}")))?;
    }
    let file = folder.join(DECK_FILE);
    fs::rename(from, &file).map_err(|e| tidy(format!("Could not move {stem}: {e}")))?;
    identify(&file, &stem)?;
    Ok(file)
}

/// Writes an id and a title into the deck at `file` when it has none (`with_deck_identity`).
fn identify(file: &Path, title: &str) -> Result<(), String> {
    let text =
        fs::read_to_string(file).map_err(|e| format!("Could not read {}: {e}", file.display()))?;
    let named = with_deck_identity(&text, title);
    if named != text {
        write_atomically(file, &named)
            .map_err(|e| format!("Could not give {} an id: {e}", file.display()))?;
    }
    Ok(())
}

/// Every deck in a folder that has no id or title yet (one moved by a move that stopped before
/// its id, or made by hand) gets them; its title is its folder's name without the date.
fn identify_decks(dir: &Path) {
    let Ok(listed) = list_in(dir, Kind::Decks) else {
        return;
    };
    for deck in listed {
        let file = PathBuf::from(&deck.path);
        if in_own_folder(dir, &file)
            && let Err(e) = identify(&file, &deck.name)
        {
            log::warn!("{e}");
        }
    }
}

/// Removes `Decks/.sessions` once every lone deck's sessions have moved out of it. One with
/// anything else in it (sessions of a deck that is gone, say) stays.
fn remove_empty_sessions(dir: &Path) {
    let sessions = dir.join(SESSIONS_DIR);
    if !sessions.is_dir() || !holds_nothing(&sessions) {
        return;
    }
    let _ = fs::remove_file(sessions.join(".DS_Store"));
    if let Err(e) = fs::remove_dir(&sessions) {
        log::warn!("{} not removed: {e}", sessions.display());
    }
}

/// Whether `folder` has nothing in it but a Finder `.DS_Store`.
fn holds_nothing(folder: &Path) -> bool {
    fs::read_dir(folder).is_ok_and(|entries| {
        entries
            .filter_map(Result::ok)
            .all(|e| e.file_name() == ".DS_Store")
    })
}

/// The deck's id: a valid `id` in its front matter, if it has one.
fn deck_id(text: &str) -> Option<String> {
    let mut lines = text.lines();
    if lines.next().map(str::trim_end) != Some("---") {
        return None;
    }
    lines
        .take_while(|l| l.trim_end() != "---")
        .find_map(|l| {
            let (k, v) = l.split_once(':')?;
            k.eq_ignore_ascii_case("id").then(|| v.trim().to_string())
        })
        .filter(|id| crate::ids::is_valid_id(crate::ids::DECK_PREFIX, id))
}

/// `text` with its `id` line saying `id` instead; the rest exactly as it was.
fn with_id(text: &str, id: &str) -> String {
    let mut in_front = false;
    let mut done = false;
    text.split_inclusive('\n')
        .enumerate()
        .map(|(n, line)| {
            let bare = line.trim_end_matches(['\r', '\n']);
            if bare == "---" {
                in_front = n == 0;
            } else if in_front
                && !done
                && bare
                    .split_once(':')
                    .is_some_and(|(k, _)| k.eq_ignore_ascii_case("id"))
            {
                done = true;
                return format!("id: {id}{}", &line[bare.len()..]);
            }
            line.to_string()
        })
        .collect()
}

/// Two decks with one id are a copy and its original: the one whose folder was made later gets a
/// new id, and keeps the sessions it was copied with (ADR 0037).
fn give_copies_their_own_ids(dir: &Path) {
    let mut by_id: std::collections::HashMap<String, Vec<(std::time::SystemTime, PathBuf)>> =
        std::collections::HashMap::new();
    for deck in list_in(dir, Kind::Decks).unwrap_or_default() {
        let file = PathBuf::from(&deck.path);
        let Some(id) = fs::read_to_string(&file).ok().as_deref().and_then(deck_id) else {
            continue;
        };
        let folder = if in_own_folder(dir, &file) {
            file.parent().unwrap_or(&file)
        } else {
            &file
        };
        let made = fs::metadata(folder)
            .and_then(|m| m.created().or_else(|_| m.modified()))
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        by_id.entry(id).or_default().push((made, file));
    }
    for (_, mut decks) in by_id.into_iter().filter(|(_, d)| d.len() > 1) {
        decks.sort();
        for (_, file) in decks.into_iter().skip(1) {
            let Ok(text) = fs::read_to_string(&file) else {
                continue;
            };
            let id = crate::ids::new_id(crate::ids::DECK_PREFIX);
            match write_atomically(&file, &with_id(&text, &id)) {
                Ok(()) => log::info!("a copied deck has its own id now: {}", file.display()),
                Err(e) => log::warn!("{} not given its own id: {e}", file.display()),
            }
        }
    }
}

/// Puts the Decks folder in order after anything changed it: a lone `.md` (written by an
/// AI, by hand, or an older deck) moves into a folder of its own; a deck without an id or title
/// gets them; a copied deck gets its own id; an empty `.sessions` goes. Each deck's text is left
/// as it was but for those front matter lines. What can't be done now is tried again next time.
fn tidy_decks_in(dir: &Path) {
    for deck in list_in(dir, Kind::Decks).unwrap_or_default() {
        let from = PathBuf::from(&deck.path);
        if !in_own_folder(dir, &from) {
            match move_into_folder(dir, &from) {
                Ok(to) => log::info!("{} moved into {}", deck.name, to.display()),
                Err(e) => log::warn!("deck not moved into a folder: {e}"),
            }
        }
    }
    identify_decks(dir);
    give_copies_their_own_ids(dir);
    remove_empty_sessions(dir);
}

/// One tidy at a time: at start and after each change the watcher reports.
static TIDYING: Mutex<()> = Mutex::new(());

/// `tidy_decks_in`, waiting for any tidy already under way.
fn tidy_decks(dir: &Path) {
    let _one = TIDYING.lock().unwrap_or_else(|e| e.into_inner());
    tidy_decks_in(dir);
}

/// The largest note file a drop takes: a note is a few topics, not a book.
const DROP_LIMIT: u64 = 1024 * 1024;

/// A copy of the Markdown file at `from` as a new deck in Decks (Quick notes before they became decks), in a
/// folder named after it; the file itself is left where it was (ADR 0031).
fn import_into(dir: &Path, from: &Path) -> Result<PathBuf, String> {
    let name = from
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let Some(stem) = name
        .strip_suffix(".md")
        .or_else(|| name.strip_suffix(".MD"))
    else {
        return Err(format!("{name} is not a Markdown note"));
    };
    let size = fs::metadata(from)
        .map_err(|e| format!("Could not read {name}: {e}"))?
        .len();
    if size > DROP_LIMIT {
        return Err(format!("{name} is too large to be a note"));
    }
    let text = fs::read_to_string(from).map_err(|e| format!("Could not read {name}: {e}"))?;
    create_deck_in(dir, stem, &text, &today())
}

/// Copies a note file dropped on the window into Decks; returns the new deck's path.
#[tauri::command]
pub async fn import_note(app: AppHandle, path: String) -> Result<String, String> {
    // Decks replaced quick notes: a dropped Markdown file becomes a deck.
    let file = import_into(&kind_dir(&app, Kind::Decks)?, Path::new(&path))?;
    log::debug!("note added from a dropped file");
    Ok(file.to_string_lossy().into_owned())
}

/// The folder of `kind` (`notes` or `talks`), made if missing: for the skill's oversay-local.json.
pub(crate) fn folder(app: &AppHandle, kind: &str) -> Result<String, String> {
    Ok(kind_dir(app, Kind::parse(kind)?)?.display().to_string())
}

// ---- watching the folders (ADR 0034)

/// Same name as `QUICK_FILES_CHANGED_EVENT` in src/lib/notes/files.ts; both sides test it. Its
/// payload is the kind's name, `notes` or `talks`.
pub const QUICK_FILES_CHANGED_EVENT: &str = "quick-files-changed";

/// How long the folder must be quiet before a change is reported: a save is several events.
const QUIET: Duration = Duration::from_millis(250);

/// Keeps the folder watchers alive while the app runs.
struct Watchers(#[allow(dead_code)] Mutex<Vec<Debouncer<RecommendedWatcher>>>);

/// Whether a changed path, under the Decks folder `dir`, may change the list: a lone deck, a
/// deck's folder (made, renamed, deleted) or a deck's Markdown in it. Its sessions and anything in
/// `resources/` do not.
fn is_deck_change(dir: &Path, path: &Path) -> bool {
    let Ok(inside) = path.strip_prefix(dir) else {
        return false;
    };
    let parts: Vec<_> = inside.iter().map(|p| p.to_string_lossy()).collect();
    match parts.as_slice() {
        [one] => !one.starts_with('.'),
        [folder, file] => {
            !folder.starts_with('.') && is_kind_file(Path::new(file.as_ref()), Kind::Decks)
        }
        // A session's transcript or review, written by the skill (ADR 0041), shows on its page.
        [folder, sub, file] => {
            !folder.starts_with('.')
                && (sub == crate::session_files::TRANSCRIPTS
                    || sub == crate::session_files::REVIEWS)
                && is_kind_file(Path::new(file.as_ref()), Kind::Decks)
        }
        _ => false,
    }
}

/// Whether a changed path is a file of `kind`; a save's hidden temporary file is not.
fn is_kind_file(path: &Path, kind: Kind) -> bool {
    path.file_name()
        .map(|n| n.to_string_lossy())
        .is_some_and(|n| n.ends_with(kind.ext()) && !n.starts_with('.'))
}

/// Watches Quick notes, Quick talks and Decks, and tells the manager when a file in either is made,
/// written, renamed or deleted, by anything, Oversay included: the frontend tells its own saves
/// apart by their contents. A folder that can't be watched is logged, and its list then
/// refreshes only when its page opens, as before.
pub fn watch(app: &AppHandle) {
    let watchers = [Kind::Notes, Kind::Talks, Kind::Decks]
        .into_iter()
        .filter_map(|kind| {
            watch_kind(app, kind)
                .inspect_err(|e| log::warn!("not watching {}: {e}", kind.folder()))
                .ok()
        })
        .collect();
    app.manage(Watchers(Mutex::new(watchers)));
}

fn watch_kind(app: &AppHandle, kind: Kind) -> Result<Debouncer<RecommendedWatcher>, String> {
    let dir = kind_dir(app, kind)?;
    let app = app.clone();
    // Decks are put in order at start, and before each change is reported; what that
    // changes is reported in turn.
    if kind == Kind::Decks {
        let dir = dir.clone();
        std::thread::spawn(move || tidy_decks(&dir));
    }
    let tidied = dir.clone();
    watch_dir(&dir, kind, move || {
        if kind == Kind::Decks {
            tidy_decks(&tidied);
        }
        let _ = app.emit(QUICK_FILES_CHANGED_EVENT, kind.name());
    })
}

/// Calls `changed` once the folder is quiet after a file of `kind` in it changed; for Decks, one
/// level down too, in each deck's folder (ADR 0037).
fn watch_dir(
    dir: &Path,
    kind: Kind,
    changed: impl Fn() + Send + 'static,
) -> Result<Debouncer<RecommendedWatcher>, String> {
    // Events may name the folder by its real path (`/private/var/…` for `/var/…`).
    let roots = [
        dir.to_path_buf(),
        dir.canonicalize().unwrap_or_else(|_| dir.to_path_buf()),
    ];
    let counts = move |path: &Path| match kind {
        Kind::Decks => roots.iter().any(|root| is_deck_change(root, path)),
        _ => is_kind_file(path, kind),
    };
    let mut debouncer = new_debouncer(QUIET, move |result: DebounceEventResult| match result {
        Ok(events) if events.iter().any(|e| counts(&e.path)) => changed(),
        Ok(_) => {}
        Err(e) => log::warn!("watching {}: {e}", kind.folder()),
    })
    .map_err(|e| e.to_string())?;
    debouncer
        .watcher()
        .watch(
            dir,
            if kind == Kind::Decks {
                RecursiveMode::Recursive
            } else {
                RecursiveMode::NonRecursive
            },
        )
        .map_err(|e| e.to_string())?;
    Ok(debouncer)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("oversay-quick-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn kinds_match_the_frontend() {
        assert_eq!(Kind::parse("notes"), Ok(Kind::Notes));
        assert_eq!(Kind::parse("talks"), Ok(Kind::Talks));
        assert_eq!(Kind::parse("decks"), Ok(Kind::Decks));
        assert!(Kind::parse("projects").is_err());
    }

    #[test]
    fn kinds_name_themselves_as_parse_reads_them() {
        for kind in [Kind::Notes, Kind::Talks, Kind::Decks] {
            assert_eq!(Kind::parse(kind.name()), Ok(kind));
        }
    }

    #[test]
    fn the_folder_event_has_the_frontends_name() {
        assert_eq!(QUICK_FILES_CHANGED_EVENT, "quick-files-changed");
    }

    /// The real watcher on a real folder: a note written there, as an AI would, is reported.
    #[test]
    fn a_note_written_into_the_folder_is_reported() {
        let dir = temp_dir("watch");
        let (tx, rx) = std::sync::mpsc::channel();
        let _watcher = watch_dir(&dir, Kind::Notes, move || {
            let _ = tx.send(());
        })
        .unwrap();
        // Some platforms start reporting a moment after the watch is set up.
        std::thread::sleep(Duration::from_millis(200));
        fs::write(dir.join("Catch-up with Sam.md"), "## Hiring\n- Two roles\n").unwrap();
        assert!(
            rx.recv_timeout(Duration::from_secs(10)).is_ok(),
            "no change reported"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_dropped_note_is_copied_in_as_a_new_deck_and_never_overwrites() {
        let dir = temp_dir("import");
        let downloads = temp_dir("importfrom");
        let from = downloads.join("Catch-up with Sam.md");
        fs::write(&from, "## Hiring\n- Two roles\n").unwrap();
        let first = import_into(&dir, &from).unwrap();
        let second = import_into(&dir, &from).unwrap();
        let day = today();
        assert_eq!(
            first,
            dir.join(format!("Catch-up with Sam {day}")).join("deck.md")
        );
        assert_eq!(
            second,
            dir.join(format!("Catch-up with Sam {day} (2)"))
                .join("deck.md")
        );
        let text = fs::read_to_string(&second).unwrap();
        assert!(text.starts_with("---\nid: d_"), "{text}");
        assert!(
            text.ends_with("title: Catch-up with Sam\n---\n## Hiring\n- Two roles\n"),
            "{text}"
        );
        assert!(from.is_file(), "the dropped file stays where it was");
        fs::write(downloads.join("invoice.pdf"), "x").unwrap();
        assert!(import_into(&dir, &downloads.join("invoice.pdf")).is_err());
        fs::remove_dir_all(&dir).unwrap();
        fs::remove_dir_all(&downloads).unwrap();
    }

    fn deck_fixture() -> serde_json::Value {
        serde_json::from_str(include_str!("../../src/lib/decks/deck-folders.json")).unwrap()
    }

    /// The frontend names a deck from its folder by the same cases (deck-folders.json).
    #[test]
    fn a_decks_name_is_its_folders_without_the_date() {
        for case in deck_fixture()["names"].as_array().unwrap() {
            assert_eq!(
                deck_name(case["folder"].as_str().unwrap()),
                case["name"].as_str().unwrap(),
                "{case}"
            );
        }
    }

    #[test]
    fn a_new_deck_is_a_dated_folder_numbered_on_a_clash() {
        for (n, case) in deck_fixture()["made"]
            .as_array()
            .unwrap()
            .iter()
            .enumerate()
        {
            let dir = temp_dir(&format!("deckmade{n}"));
            for existing in case["existing"].as_array().unwrap() {
                fs::create_dir(dir.join(existing.as_str().unwrap())).unwrap();
            }
            let file = create_deck_in(
                &dir,
                case["title"].as_str().unwrap(),
                "## A\n",
                case["today"].as_str().unwrap(),
            )
            .unwrap();
            assert_eq!(
                file,
                dir.join(case["folder"].as_str().unwrap()).join("deck.md"),
                "{case}"
            );
            fs::remove_dir_all(&dir).unwrap();
        }
    }

    #[test]
    fn two_decks_with_one_title_are_both_listed_by_their_title() {
        let dir = temp_dir("decklist");
        let a = create_deck_in(&dir, "Standup", "## A\n", "2026-10-25").unwrap();
        let b = create_deck_in(&dir, "Standup", "## B\n", "2026-10-25").unwrap();
        fs::write(dir.join("Old.md"), "## C\n").unwrap();
        // Not decks: a folder without Markdown, one with two and no deck.md, a hidden one.
        fs::create_dir(dir.join("Empty")).unwrap();
        fs::create_dir(dir.join("Two")).unwrap();
        fs::write(dir.join("Two").join("a.md"), "").unwrap();
        fs::write(dir.join("Two").join("b.md"), "").unwrap();
        fs::create_dir(dir.join(".sessions")).unwrap();
        fs::write(dir.join(".sessions").join("deck.md"), "").unwrap();
        // A folder with one Markdown file and no deck.md: that file is the deck.
        fs::create_dir(dir.join("Retro 2026-09-01")).unwrap();
        fs::write(dir.join("Retro 2026-09-01").join("Retro.md"), "## D\n").unwrap();
        let mut listed: Vec<_> = list_in(&dir, Kind::Decks)
            .unwrap()
            .into_iter()
            .map(|f| (f.name, f.path))
            .collect();
        listed.sort();
        let path = |p: &Path| p.to_string_lossy().into_owned();
        let mut expected = vec![
            ("Old".to_string(), path(&dir.join("Old.md"))),
            (
                "Retro".to_string(),
                path(&dir.join("Retro 2026-09-01").join("Retro.md")),
            ),
            ("Standup".to_string(), path(&a)),
            ("Standup".to_string(), path(&b)),
        ];
        expected.sort();
        assert_eq!(listed, expected);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_new_deck_gets_an_id_and_a_title_but_keeps_its_own() {
        let made = with_deck_identity("## A\n", "Standup");
        let id = made.lines().nth(1).unwrap().strip_prefix("id: ").unwrap();
        assert!(crate::ids::is_valid_id("d_", id), "{made}");
        assert_eq!(made, format!("---\nid: {id}\ntitle: Standup\n---\n## A\n"));
        let own = "---\nid: d_k3x9a2bq\ntitle: Weekly\naudience: Team\n---\n## A\n";
        assert_eq!(with_deck_identity(own, "Standup"), own);
        let some = "---\r\naudience: Team\r\n---\r\n## A\r\n";
        let made = with_deck_identity(some, "Standup");
        assert!(
            made.starts_with("---\r\naudience: Team\r\nid: d_"),
            "{made}"
        );
        assert!(
            made.ends_with("\r\ntitle: Standup\r\n---\r\n## A\r\n"),
            "{made}"
        );
        // A malformed id is replaced, not kept first.
        let bad = with_deck_identity("---\nid: 42\ntitle: X\n---\n", "X");
        assert_eq!(bad.matches("id:").count(), 1, "{bad}");
        assert!(bad.contains("id: d_"));
    }

    #[test]
    fn only_a_decks_own_file_in_its_folder_is_let_through() {
        let dir = temp_dir("deckchecked");
        let deck = create_deck_in(&dir, "Standup", "## A\n", "2026-10-25").unwrap();
        let folder = deck.parent().unwrap().to_path_buf();
        let s = |p: &Path| p.to_string_lossy().into_owned();
        assert_eq!(checked(&dir, Kind::Decks, &s(&deck)), Ok(deck.clone()));
        // Another Markdown file beside deck.md, one in resources/, one not in Decks at all.
        fs::write(folder.join("notes.md"), "").unwrap();
        assert!(checked(&dir, Kind::Decks, &s(&folder.join("notes.md"))).is_err());
        fs::create_dir(folder.join("resources")).unwrap();
        fs::write(folder.join("resources").join("deck.md"), "").unwrap();
        assert!(
            checked(
                &dir,
                Kind::Decks,
                &s(&folder.join("resources").join("deck.md"))
            )
            .is_err()
        );
        let sneaky = format!("{}/Standup 2026-10-25/../../deck.md", dir.display());
        assert!(checked(&dir, Kind::Decks, &sneaky).is_err());
        // Quick notes are flat.
        assert!(checked(&dir, Kind::Notes, &s(&deck)).is_err());
        // A deck folder that is a link to a folder elsewhere is not let through.
        let elsewhere = temp_dir("deckelsewhere");
        fs::write(elsewhere.join("deck.md"), "").unwrap();
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&elsewhere, dir.join("Linked")).unwrap();
            assert!(checked(&dir, Kind::Decks, &s(&dir.join("Linked").join("deck.md"))).is_err());
            assert!(
                list_in(&dir, Kind::Decks)
                    .unwrap()
                    .iter()
                    .all(|f| f.name != "Linked")
            );
        }
        fs::remove_dir_all(&dir).unwrap();
        fs::remove_dir_all(&elsewhere).unwrap();
    }

    #[test]
    fn a_decks_sessions_are_in_its_folder_and_go_where_it_goes() {
        let dir = temp_dir("decksessions");
        let deck = create_deck_in(&dir, "Standup", "## A\n", "2026-10-25").unwrap();
        let folder = deck.parent().unwrap().to_path_buf();
        assert_eq!(sessions_file(&dir, &deck), folder.join("sessions.json"));
        fs::write(folder.join("sessions.json"), "{}").unwrap();
        // Renamed in Oversay: the folder takes the new name and keeps its date.
        let to = rename_deck_in(&dir, &deck.to_string_lossy(), "Daily: team").unwrap();
        assert_eq!(to, dir.join("Daily team 2026-10-25").join("deck.md"));
        assert_eq!(fs::read_to_string(sessions_file(&dir, &to)).unwrap(), "{}");
        // The same name again changes nothing; another deck's name is numbered.
        assert_eq!(
            rename_deck_in(&dir, &to.to_string_lossy(), "Daily team").unwrap(),
            to
        );
        let other = create_deck_in(&dir, "Retro", "## B\n", "2026-10-25").unwrap();
        let other = rename_deck_in(&dir, &other.to_string_lossy(), "Daily team").unwrap();
        assert_eq!(other, dir.join("Daily team 2026-10-25 (2)").join("deck.md"));
        // Renamed in Finder, even without its date: the sessions are still the deck's.
        fs::rename(to.parent().unwrap(), dir.join("Anything")).unwrap();
        let moved = dir.join("Anything").join("deck.md");
        assert_eq!(
            fs::read_to_string(sessions_file(&dir, &moved)).unwrap(),
            "{}"
        );
        // A folder without a date keeps none.
        let renamed = rename_deck_in(&dir, &moved.to_string_lossy(), "Weekly").unwrap();
        assert_eq!(renamed, dir.join("Weekly").join("deck.md"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn deck_changes_count_one_level_down_but_not_sessions_or_resources() {
        let d = Path::new("/D");
        assert!(is_deck_change(d, Path::new("/D/Old.md")));
        assert!(is_deck_change(d, Path::new("/D/Standup 2026-10-25")));
        assert!(is_deck_change(
            d,
            Path::new("/D/Standup 2026-10-25/deck.md")
        ));
        assert!(!is_deck_change(
            d,
            Path::new("/D/Standup 2026-10-25/.deck.md.tmp")
        ));
        assert!(!is_deck_change(
            d,
            Path::new("/D/Standup 2026-10-25/sessions.json")
        ));
        assert!(!is_deck_change(
            d,
            Path::new("/D/Standup 2026-10-25/resources/notes.md")
        ));
        assert!(!is_deck_change(d, Path::new("/D/.sessions/Old.json")));
        assert!(!is_deck_change(d, Path::new("/D")));
        assert!(!is_deck_change(d, Path::new("/elsewhere/deck.md")));
    }

    /// The real watcher: a deck written into a deck's folder, as an AI would, is reported.
    #[test]
    fn a_deck_written_into_its_folder_is_reported() {
        let dir = temp_dir("watchdecks");
        fs::create_dir(dir.join("Standup 2026-10-25")).unwrap();
        let (tx, rx) = std::sync::mpsc::channel();
        let _watcher = watch_dir(&dir, Kind::Decks, move || {
            let _ = tx.send(());
        })
        .unwrap();
        std::thread::sleep(Duration::from_millis(200));
        fs::write(dir.join("Standup 2026-10-25").join("deck.md"), "## A\n").unwrap();
        assert!(
            rx.recv_timeout(Duration::from_secs(10)).is_ok(),
            "no change reported"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    /// A Decks folder with two lone decks in it, one with sessions from before ADR 0037.
    fn lone_decks(name: &str) -> PathBuf {
        let dir = temp_dir(name);
        fs::write(dir.join("Standup.md"), "## A [1m]\n").unwrap();
        fs::write(dir.join("Retro.md"), "---\naudience: Team\n---\n## B\n").unwrap();
        fs::create_dir(dir.join(".sessions")).unwrap();
        fs::write(
            dir.join(".sessions").join("Standup.json"),
            "{\"version\":1}",
        )
        .unwrap();
        dir
    }

    fn folder_of(dir: &Path, name: &str) -> PathBuf {
        dir.join(format!(
            "{name} {}",
            made_on(&dir.join(format!("{name}.md")))
        ))
    }

    #[test]
    fn a_lone_deck_moves_into_a_folder_with_its_sessions_once() {
        let dir = lone_decks("movedecks");
        let (standup, retro) = (folder_of(&dir, "Standup"), folder_of(&dir, "Retro"));
        tidy_decks_in(&dir);
        let text = fs::read_to_string(standup.join("deck.md")).unwrap();
        assert!(text.starts_with("---\nid: d_"), "{text}");
        assert!(
            text.ends_with("\ntitle: Standup\n---\n## A [1m]\n"),
            "{text}"
        );
        let text = fs::read_to_string(retro.join("deck.md")).unwrap();
        assert!(text.starts_with("---\naudience: Team\nid: d_"), "{text}");
        assert_eq!(
            fs::read_to_string(standup.join("sessions.json")).unwrap(),
            "{\"version\":1}"
        );
        assert!(!retro.join("sessions.json").exists());
        // Nothing left behind, nothing twice; the empty sessions folder is gone.
        assert!(!dir.join("Standup.md").exists() && !dir.join("Retro.md").exists());
        assert!(!dir.join(".sessions").exists());
        assert_eq!(list_in(&dir, Kind::Decks).unwrap().len(), 2);
        // Tidying again changes nothing.
        let before = fs::read_to_string(standup.join("deck.md")).unwrap();
        tidy_decks_in(&dir);
        assert_eq!(fs::read_to_string(standup.join("deck.md")).unwrap(), before);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_move_that_stopped_part_way_finishes_without_a_second_folder() {
        // Stopped after making the folder.
        let dir = lone_decks("movestopped1");
        let standup = folder_of(&dir, "Standup");
        fs::create_dir(&standup).unwrap();
        tidy_decks_in(&dir);
        assert!(standup.join("deck.md").is_file() && standup.join("sessions.json").is_file());
        assert_eq!(list_in(&dir, Kind::Decks).unwrap().len(), 2);
        fs::remove_dir_all(&dir).unwrap();

        // Stopped after moving the sessions: the lone deck is still there.
        let dir = lone_decks("movestopped2");
        let standup = folder_of(&dir, "Standup");
        fs::create_dir(&standup).unwrap();
        fs::rename(
            dir.join(".sessions").join("Standup.json"),
            standup.join("sessions.json"),
        )
        .unwrap();
        tidy_decks_in(&dir);
        assert!(standup.join("deck.md").is_file());
        assert_eq!(
            fs::read_to_string(standup.join("sessions.json")).unwrap(),
            "{\"version\":1}"
        );
        assert_eq!(list_in(&dir, Kind::Decks).unwrap().len(), 2);
        assert!(!dir.join(".sessions").exists());
        fs::remove_dir_all(&dir).unwrap();

        // Stopped after moving the deck, before its id: it gets one, titled from its folder.
        let dir = temp_dir("movestopped3");
        fs::create_dir(dir.join("Standup 2026-10-20")).unwrap();
        fs::write(dir.join("Standup 2026-10-20").join("deck.md"), "## A\n").unwrap();
        tidy_decks_in(&dir);
        let text = fs::read_to_string(dir.join("Standup 2026-10-20").join("deck.md")).unwrap();
        assert!(
            text.starts_with("---\nid: d_") && text.contains("\ntitle: Standup\n"),
            "{text}"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_deck_gone_since_it_was_listed_leaves_no_folder() {
        let dir = lone_decks("movegone");
        let from = dir.join("Standup.md");
        move_into_folder(&dir, &from).unwrap();
        // Another run that listed it before it moved.
        assert!(move_into_folder(&dir, &from).is_err());
        let folders = fs::read_dir(&dir)
            .unwrap()
            .filter_map(Result::ok)
            .filter(|e| e.path().is_dir())
            .count();
        assert_eq!(
            folders, 2,
            "the deck's folder and .sessions, and nothing else"
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    /// Two tidies at once (the start and a change): each deck moves once.
    #[test]
    fn two_tidies_at_once_move_each_deck_once() {
        let dir = lone_decks("movetwice");
        let runs: Vec<_> = (0..4)
            .map(|_| {
                let dir = dir.clone();
                std::thread::spawn(move || tidy_decks(&dir))
            })
            .collect();
        runs.into_iter().for_each(|r| r.join().unwrap());
        let entries = fs::read_dir(&dir).unwrap().filter_map(Result::ok).count();
        assert_eq!(entries, 2, "two deck folders and nothing else");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_move_never_uses_another_decks_folder_or_drops_other_sessions() {
        let dir = lone_decks("moveclash");
        let taken = folder_of(&dir, "Standup");
        fs::create_dir(&taken).unwrap();
        fs::write(
            taken.join("deck.md"),
            "---\nid: d_aaaaaaaa\ntitle: Standup\n---\n## Other\n",
        )
        .unwrap();
        // Sessions of a deck that is gone stay, and so does their folder.
        fs::write(dir.join(".sessions").join("Gone.json"), "{}").unwrap();
        tidy_decks_in(&dir);
        let numbered = dir.join(format!(
            "{} (2)",
            taken.file_name().unwrap().to_string_lossy()
        ));
        assert_eq!(
            fs::read_to_string(numbered.join("sessions.json")).unwrap(),
            "{\"version\":1}"
        );
        assert!(
            fs::read_to_string(taken.join("deck.md"))
                .unwrap()
                .ends_with("## Other\n")
        );
        assert!(!taken.join("sessions.json").exists());
        assert!(dir.join(".sessions").join("Gone.json").is_file());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_copied_deck_gets_its_own_id_and_keeps_its_sessions() {
        let dir = temp_dir("copies");
        let original = create_deck_in(&dir, "Standup", "## A\n", "2026-10-25").unwrap();
        let folder = original.parent().unwrap();
        fs::write(folder.join("sessions.json"), "{\"version\":1}").unwrap();
        let text = fs::read_to_string(&original).unwrap();
        // Copied in Finder a moment later.
        std::thread::sleep(Duration::from_millis(20));
        let copy = dir.join("Standup 2026-10-25 copy");
        fs::create_dir(&copy).unwrap();
        fs::write(copy.join("deck.md"), &text).unwrap();
        fs::write(copy.join("sessions.json"), "{\"version\":1}").unwrap();
        tidy_decks_in(&dir);
        assert_eq!(
            fs::read_to_string(&original).unwrap(),
            text,
            "the original keeps its id"
        );
        let copied = fs::read_to_string(copy.join("deck.md")).unwrap();
        let (a, b) = (deck_id(&text).unwrap(), deck_id(&copied).unwrap());
        assert_ne!(a, b);
        assert_eq!(copied, text.replace(&a, &b), "only its id changed");
        assert_eq!(
            fs::read_to_string(copy.join("sessions.json")).unwrap(),
            "{\"version\":1}"
        );
        assert_eq!(list_in(&dir, Kind::Decks).unwrap().len(), 2);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn reads_and_changes_only_a_decks_id() {
        let text = "---\r\ntitle: A\r\nid: d_k3x9a2bq\r\n---\r\n## id: not this\r\n";
        assert_eq!(deck_id(text).as_deref(), Some("d_k3x9a2bq"));
        assert_eq!(
            with_id(text, "d_aaaaaaaa"),
            text.replace("d_k3x9a2bq", "d_aaaaaaaa")
        );
        assert_eq!(deck_id("## A\nid: d_k3x9a2bq\n"), None);
        assert_eq!(deck_id("---\nid: 42\n---\n"), None);
    }

    /// The real watcher: a lone deck written into Decks, as an AI would, is in a folder of its own
    /// by the time the change is reported.
    #[test]
    fn a_lone_deck_written_into_decks_is_moved_into_a_folder() {
        let dir = temp_dir("watchlone");
        let (tx, rx) = std::sync::mpsc::channel();
        let tidied = dir.clone();
        let _watcher = watch_dir(&dir, Kind::Decks, move || {
            tidy_decks(&tidied);
            let _ = tx.send(());
        })
        .unwrap();
        std::thread::sleep(Duration::from_millis(200));
        fs::write(dir.join("Plan.md"), "## A\n").unwrap();
        assert!(
            rx.recv_timeout(Duration::from_secs(10)).is_ok(),
            "no change reported"
        );
        let decks = list_in(&dir, Kind::Decks).unwrap();
        assert_eq!(decks.len(), 1);
        assert!(
            in_own_folder(&dir, Path::new(&decks[0].path)),
            "{}",
            decks[0].path
        );
        assert!(
            fs::read_to_string(&decks[0].path)
                .unwrap()
                .ends_with("title: Plan\n---\n## A\n")
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn only_files_of_the_kind_are_reported() {
        assert!(is_kind_file(Path::new("/q/Standup.md"), Kind::Notes));
        assert!(is_kind_file(Path::new("/q/Demo.oversay.json"), Kind::Talks));
        // A save writes `.Standup.md.tmp`, then renames it.
        assert!(!is_kind_file(Path::new("/q/.Standup.md.tmp"), Kind::Notes));
        assert!(!is_kind_file(Path::new("/q/.hidden.md"), Kind::Notes));
        assert!(!is_kind_file(Path::new("/q/Standup.md"), Kind::Talks));
        assert!(!is_kind_file(Path::new("/q/notes.txt"), Kind::Notes));
    }

    #[test]
    fn new_files_never_overwrite_and_are_numbered() {
        let dir = temp_dir("create");
        let a = create_in(&dir, Kind::Notes, "1:1 Priya", "one").unwrap();
        let b = create_in(&dir, Kind::Notes, "1:1 Priya", "two").unwrap();
        let c = create_in(&dir, Kind::Notes, "  ", "").unwrap();
        assert_eq!(a.file_name().unwrap(), "11 Priya.md");
        assert_eq!(b.file_name().unwrap(), "11 Priya 2.md");
        assert_eq!(c.file_name().unwrap(), "Untitled note.md");
        assert_eq!(fs::read_to_string(&a).unwrap(), "one");
        assert_eq!(fs::read_to_string(&b).unwrap(), "two");
        fs::remove_dir_all(&dir).unwrap();
    }

    /// The Oversay skill names a note's file by these cases (ADR 0031): its format reference
    /// lists them from the same fixture, so the skill and the app name notes alike.
    #[test]
    fn note_names_match_the_skill() {
        let cases: Vec<serde_json::Value> =
            serde_json::from_str(include_str!("../../../skills/fixtures/note-names.json")).unwrap();
        assert!(!cases.is_empty());
        for (n, case) in cases.iter().enumerate() {
            let dir = temp_dir(&format!("skillnames{n}"));
            for existing in case["existing"].as_array().unwrap() {
                fs::write(dir.join(existing.as_str().unwrap()), "").unwrap();
            }
            let file = create_in(&dir, Kind::Notes, case["name"].as_str().unwrap(), "").unwrap();
            assert_eq!(
                file.file_name().unwrap().to_string_lossy(),
                case["file"].as_str().unwrap(),
                "{case}"
            );
            fs::remove_dir_all(&dir).unwrap();
        }
    }

    #[test]
    fn lists_only_files_of_the_kind() {
        let dir = temp_dir("list");
        fs::write(dir.join("Standup.md"), "x").unwrap();
        fs::write(dir.join(".hidden.md"), "x").unwrap();
        fs::write(dir.join("Plan.oversay.json"), "{}").unwrap();
        fs::write(dir.join("notes.txt"), "x").unwrap();
        fs::create_dir(dir.join("Folder.md")).unwrap();
        let notes: Vec<_> = list_in(&dir, Kind::Notes)
            .unwrap()
            .into_iter()
            .map(|f| f.name)
            .collect();
        assert_eq!(notes, vec!["Standup"]);
        let talks: Vec<_> = list_in(&dir, Kind::Talks)
            .unwrap()
            .into_iter()
            .map(|f| f.name)
            .collect();
        assert_eq!(talks, vec!["Plan"]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn refuses_paths_outside_the_folder_or_of_another_kind() {
        let dir = temp_dir("checked");
        let inner = dir.join("inner");
        fs::create_dir(&inner).unwrap();
        fs::write(dir.join("a.md"), "x").unwrap();
        let ok = dir.join("a.md").to_string_lossy().into_owned();
        assert!(checked(&dir, Kind::Notes, &ok).is_ok());
        assert!(checked(&dir, Kind::Talks, &ok).is_err());
        let outside = inner.join("b.md").to_string_lossy().into_owned();
        assert!(checked(&dir, Kind::Notes, &outside).is_err());
        let sneaky = format!("{}/inner/../../a.md", dir.display());
        assert!(checked(&dir, Kind::Notes, &sneaky).is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_decks_sessions_sit_beside_it_and_follow_a_rename() {
        let dir = temp_dir("sessions");
        let deck = dir.join("Stand-up.md");
        fs::write(&deck, "## A [1m]\n").unwrap();
        let file = sessions_file(&dir, &deck);
        assert_eq!(file, dir.join(".sessions").join("Stand-up.json"));
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(&file, "{}").unwrap();
        let to = rename_in(&dir, Kind::Decks, &deck.to_string_lossy(), "Daily").unwrap();
        move_sessions(&dir, &deck, Some(&to));
        assert!(!file.exists());
        assert_eq!(
            fs::read_to_string(dir.join(".sessions").join("Daily.json")).unwrap(),
            "{}"
        );
        // The sessions folder is never listed as a deck.
        assert_eq!(list_in(&dir, Kind::Decks).unwrap().len(), 1);
        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn renames_but_never_over_another_file() {
        let dir = temp_dir("rename");
        let a = create_in(&dir, Kind::Notes, "A", "a").unwrap();
        create_in(&dir, Kind::Notes, "B", "b").unwrap();
        let a = a.to_string_lossy().into_owned();
        assert!(rename_in(&dir, Kind::Notes, &a, "B").is_err());
        let c = rename_in(&dir, Kind::Notes, &a, "C").unwrap();
        assert_eq!(fs::read_to_string(&c).unwrap(), "a");
        assert!(!Path::new(&a).exists());
        fs::remove_dir_all(&dir).unwrap();
    }
}
