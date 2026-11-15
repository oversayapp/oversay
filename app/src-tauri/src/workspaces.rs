//! Workspaces (ADR 0040), in `Documents/Oversay/Workspaces`: each a folder holding
//! `workspace.json` (its `w_` id, name, tags, its deck ids in order, when, where and notes) and
//! `resources/`. A workspace is a group of decks: decks stay in `Decks/` and a workspace lists them
//! by id, so a deck can be in any number of workspaces or none, and nothing here moves a deck.
//! Tags group workspaces (research, tutorials); there is nothing inside a workspace but its own
//! files. A folder in `Workspaces` without `workspace.json` (the two-level folders of ADR 0038,
//! before this) is not a workspace and is left alone.
//!
//! This side owns `workspace.json`: it is read leniently (unknown fields kept, a file that isn't
//! JSON reported and never overwritten), written in a stable order, and checked as the skill
//! writes it (`problems`, for `Oversay --check`). As with decks (ADR 0037), Oversay gives a
//! workspace its id when it first sees it without one, and a copied workspace its own.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{DebounceEventResult, Debouncer, new_debouncer};
use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::files::{folder_name, write_atomically};
use crate::ids::{DECK_PREFIX, WORKSPACE_PREFIX, is_valid_id, new_id};

/// The folder in `Documents/Oversay` that holds the workspaces.
const WORKSPACES: &str = "Workspaces";

/// The file that makes a folder in Workspaces a workspace.
pub const WORKSPACE_FILE: &str = "workspace.json";

/// `workspace.json`'s `version`.
const VERSION: u64 = 1;

/// The keys Oversay knows, in the order it writes them; any other key is kept, after these. The
/// skill is told the same ones (src/lib/workspaces/workspace-format.json; both sides test it).
const KNOWN: [&str; 8] = [
    "version", "id", "name", "tags", "decks", "when", "where", "notes",
];

/// What a new workspace is called when it is given no name.
const UNTITLED: &str = "Untitled workspace";

/// One write at a time, and never while the folder is being tidied.
static WRITING: Mutex<()> = Mutex::new(());

fn one_at_a_time() -> std::sync::MutexGuard<'static, ()> {
    WRITING.lock().unwrap_or_else(|e| e.into_inner())
}

// ---- the folders

/// `<documents>/Oversay/Workspaces`, made if missing.
fn root_in(documents: &Path) -> Result<PathBuf, String> {
    let dir = documents.join("Oversay").join(WORKSPACES);
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    Ok(dir)
}

pub(crate) fn root(app: &AppHandle) -> Result<PathBuf, String> {
    let documents = app
        .path()
        .document_dir()
        .map_err(|e| format!("Could not find the Documents folder: {e}"))?;
    root_in(&documents)
}

/// Whether `name` is one folder's name: not empty, not hidden, no path in it.
fn plain(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('.')
        && !name.contains(['/', '\\'])
        && !name.chars().any(char::is_control)
}

/// Whether `path` is a real folder, not a link to one.
fn is_folder(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|m| m.is_dir())
}

/// The workspace folders in `root`: real, not hidden, holding a `workspace.json`; by name.
fn workspace_dirs(root: &Path) -> Vec<(String, PathBuf)> {
    let mut found: Vec<_> = fs::read_dir(root)
        .map(|entries| {
            entries
                .filter_map(Result::ok)
                .map(|e| (e.file_name().to_string_lossy().into_owned(), e.path()))
                .filter(|(name, path)| {
                    plain(name) && is_folder(path) && path.join(WORKSPACE_FILE).is_file()
                })
                .collect()
        })
        .unwrap_or_default();
    found.sort_by_key(|(name, _)| name.to_lowercase());
    found
}

/// `<dir>/<base>`, or `<base> (2)`, `(3)`… when taken, made empty so nothing else takes it.
fn new_folder(dir: &Path, base: &str) -> Result<PathBuf, String> {
    for n in 1..1000 {
        let folder = dir.join(if n == 1 {
            base.to_string()
        } else {
            format!("{base} ({n})")
        });
        match fs::create_dir(&folder) {
            Ok(()) => return Ok(folder),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(format!("Could not create {}: {e}", folder.display())),
        }
    }
    Err(format!("Too many called {base}"))
}

/// Renames `from` to `<base>` beside it, or `<base> (2)`… when another folder has that name; a
/// case-only change is the same folder on a Mac. Returns the new folder.
fn rename_folder(from: &Path, base: &str) -> Result<PathBuf, String> {
    let dir = from.parent().expect("a workspace has a parent");
    if from
        .file_name()
        .is_some_and(|n| n.to_string_lossy() == base)
    {
        return Ok(from.to_path_buf());
    }
    let same =
        |to: &Path| matches!((to.canonicalize(), from.canonicalize()), (Ok(a), Ok(b)) if a == b);
    for n in 1..1000 {
        let to = dir.join(if n == 1 {
            base.to_string()
        } else {
            format!("{base} ({n})")
        });
        if to.exists() && !same(&to) {
            continue;
        }
        fs::rename(from, &to).map_err(|e| format!("Could not rename {}: {e}", from.display()))?;
        return Ok(to);
    }
    Err(format!("Too many called {base}"))
}

/// A folder's name for a workspace called `name`.
fn name_for_folder(name: &str) -> String {
    if name.trim().is_empty() {
        UNTITLED.to_string()
    } else {
        folder_name(name)
    }
}

// ---- workspace.json

/// The text as a JSON object, or why it isn't one.
fn parse(text: &str) -> Result<Map<String, Value>, String> {
    match serde_json::from_str::<Value>(text) {
        Ok(Value::Object(map)) => Ok(map),
        Ok(_) => Err("workspace.json is not a workspace".into()),
        Err(e) => Err(format!("workspace.json is not JSON: {e}")),
    }
}

fn text_of(map: &Map<String, Value>, key: &str) -> String {
    map.get(key)
        .and_then(Value::as_str)
        .map(|s| s.trim().to_string())
        .unwrap_or_default()
}

/// The strings in the list at `key`, in order; anything else left out.
fn strings_of(map: &Map<String, Value>, key: &str) -> Vec<String> {
    map.get(key)
        .and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// The workspace's id, when it has a valid one.
fn id_of(map: &Map<String, Value>) -> Option<String> {
    Some(text_of(map, "id")).filter(|id| is_valid_id(WORKSPACE_PREFIX, id))
}

/// Whether `when` is a date as `workspace.json` keeps one, `YYYY-MM-DD`.
fn is_date(when: &str) -> bool {
    chrono::NaiveDate::parse_from_str(when, "%Y-%m-%d").is_ok() && when.len() == 10
}

/// Tags as Oversay keeps them: trimmed, spaces tidied, an initial capital (John, 27 Oct), none
/// empty, each once (ignoring case).
fn tidy_tags(tags: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for tag in tags {
        let tag = tag.split_whitespace().collect::<Vec<_>>().join(" ");
        let mut chars = tag.chars();
        let tag = match chars.next() {
            Some(first) => first.to_uppercase().chain(chars).collect::<String>(),
            None => continue,
        };
        if !tag.is_empty() && !out.iter().any(|t| t.eq_ignore_ascii_case(&tag)) {
            out.push(tag);
        }
    }
    out
}

/// The file's text: Oversay's keys in their order, then any others as they were; `version` always,
/// and `when`, `where` and `notes` only when they say something.
fn to_text(map: &Map<String, Value>) -> String {
    let mut lines = vec![format!("  \"version\": {VERSION}")];
    let field = |key: &str, value: &Value| {
        format!(
            "  {}: {}",
            serde_json::to_string(key).expect("a key is a string"),
            serde_json::to_string(value).expect("a JSON value writes")
        )
    };
    for key in &KNOWN[1..] {
        let Some(value) = map.get(*key) else {
            continue;
        };
        if matches!(*key, "when" | "where" | "notes") && value.as_str().is_some_and(str::is_empty) {
            continue;
        }
        if matches!(*key, "tags" | "decks")
            && let Some(items) = value.as_array()
        {
            let items: Vec<String> = items.iter().map(|v| v.to_string()).collect();
            lines.push(format!("  \"{key}\": [{}]", items.join(", ")));
            continue;
        }
        lines.push(field(key, value));
    }
    for (key, value) in map.iter().filter(|(k, _)| !KNOWN.contains(&k.as_str())) {
        lines.push(field(key, value));
    }
    format!("{{\n{}\n}}\n", lines.join(",\n"))
}

/// What `Oversay --check` and a careful writer want to know about a `workspace.json`: anything
/// Oversay would read differently from what was meant. A missing id is fine: Oversay gives one.
pub fn problems(text: &str) -> Vec<String> {
    let map = match parse(text) {
        Ok(map) => map,
        Err(e) => return vec![e],
    };
    let mut found = Vec::new();
    match map.get("version") {
        None => {}
        Some(v) if v.as_u64() == Some(VERSION) => {}
        Some(v) => found.push(format!("version is {v}; Oversay reads version {VERSION}")),
    }
    if let Some(id) = map.get("id")
        && !id
            .as_str()
            .is_some_and(|id| is_valid_id(WORKSPACE_PREFIX, id))
    {
        found.push(format!(
            "id {id} is not a workspace id (w_ and 8 of a-z0-9); leave it out and Oversay gives one"
        ));
    }
    match map.get("name") {
        Some(Value::String(name)) if !name.trim().is_empty() => {}
        Some(_) => found.push("name should be the workspace's name, as text".into()),
        None => found.push("name is missing; the folder's name is used".into()),
    }
    match map.get("tags") {
        None => {}
        Some(Value::Array(tags)) => {
            if tags
                .iter()
                .any(|t| !t.as_str().is_some_and(|t| !t.trim().is_empty()))
            {
                found.push("tags should be words, as text".into());
            }
        }
        Some(_) => found.push("tags should be a list of words".into()),
    }
    match map.get("decks") {
        None => {}
        Some(Value::Array(ids)) => {
            for id in ids {
                if !id.as_str().is_some_and(|id| is_valid_id(DECK_PREFIX, id)) {
                    found.push(format!(
                        "decks: {id} is not a deck id (the id in a deck's front matter)"
                    ));
                }
            }
        }
        Some(_) => found.push("decks should be a list of deck ids".into()),
    }
    if let Some(when) = map.get("when")
        && !when.as_str().is_some_and(|w| w.is_empty() || is_date(w))
    {
        found.push(format!("when {when} is not a date like 2026-06-02"));
    }
    for key in ["where", "notes"] {
        if map.get(key).is_some_and(|v| !v.is_string()) {
            found.push(format!("{key} should be text"));
        }
    }
    found
}

// ---- reading

#[derive(serde::Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    /// Its id, or "" for one Oversay hasn't given an id yet or can't read.
    id: String,
    /// `name`, or its folder's name when it has none.
    name: String,
    /// Its folder's name.
    folder: String,
    tags: Vec<String>,
    /// Its deck ids in order, including any Oversay can't find.
    decks: Vec<String>,
    when: String,
    #[serde(rename = "where")]
    place: String,
    notes: String,
    /// Why it couldn't be read; it is listed, and never written, until it can.
    problem: Option<String>,
}

fn workspace_from(folder: &str, text: Result<String, String>) -> Workspace {
    let parsed = text.and_then(|t| parse(&t));
    let empty = Map::new();
    let map = parsed.as_ref().unwrap_or(&empty);
    let name = text_of(map, "name");
    Workspace {
        id: id_of(map).unwrap_or_default(),
        name: if name.is_empty() {
            folder.to_string()
        } else {
            name
        },
        folder: folder.to_string(),
        tags: tidy_tags(strings_of(map, "tags")),
        decks: strings_of(map, "decks"),
        when: text_of(map, "when"),
        place: text_of(map, "where"),
        notes: text_of(map, "notes"),
        problem: parsed.err(),
    }
}

/// The workspace in `dir`, as listed.
fn read_workspace(dir: &Path) -> Workspace {
    let folder = dir
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let text = fs::read_to_string(dir.join(WORKSPACE_FILE))
        .map_err(|e| format!("workspace.json could not be read: {e}"));
    workspace_from(&folder, text)
}

/// Every workspace, by name.
fn list_in(root: &Path) -> Vec<Workspace> {
    let mut all: Vec<_> = workspace_dirs(root)
        .into_iter()
        .map(|(_, dir)| read_workspace(&dir))
        .collect();
    all.sort_by_key(|w| w.name.to_lowercase());
    all
}

/// The folder of the workspace with this id.
fn find_in(root: &Path, id: &str) -> Result<PathBuf, String> {
    if is_valid_id(WORKSPACE_PREFIX, id) {
        for (_, dir) in workspace_dirs(root) {
            let found = fs::read_to_string(dir.join(WORKSPACE_FILE))
                .ok()
                .and_then(|t| parse(&t).ok())
                .and_then(|m| id_of(&m));
            if found.as_deref() == Some(id) {
                return Ok(dir);
            }
        }
    }
    Err("That workspace is no longer there".into())
}

/// A workspace's folder, for its resources.
pub(crate) fn workspace_folder(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    find_in(&root(app)?, id)
}

// ---- tidying (as decks are, ADR 0037)

/// Every readable workspace without a valid id gets one, and when a copied folder brings a second
/// workspace with an id, the one whose folder was made later gets a new one. A file that isn't
/// JSON is left alone.
fn tidy_in(root: &Path) {
    let mut by_id: std::collections::HashMap<String, Vec<(std::time::SystemTime, PathBuf)>> =
        std::collections::HashMap::new();
    for (_, dir) in workspace_dirs(root) {
        let file = dir.join(WORKSPACE_FILE);
        let Some(mut map) = fs::read_to_string(&file).ok().and_then(|t| parse(&t).ok()) else {
            continue;
        };
        let id = match id_of(&map) {
            Some(id) => id,
            None => {
                let id = new_id(WORKSPACE_PREFIX);
                map.insert("id".into(), Value::String(id.clone()));
                if let Err(e) = write_atomically(&file, &to_text(&map)) {
                    log::warn!("{} not given an id: {e}", dir.display());
                    continue;
                }
                id
            }
        };
        let made = fs::metadata(&dir)
            .and_then(|m| m.created().or_else(|_| m.modified()))
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        by_id.entry(id).or_default().push((made, file));
    }
    for (_, mut copies) in by_id.into_iter().filter(|(_, c)| c.len() > 1) {
        copies.sort();
        for (_, file) in copies.into_iter().skip(1) {
            let Some(mut map) = fs::read_to_string(&file).ok().and_then(|t| parse(&t).ok()) else {
                continue;
            };
            map.insert("id".into(), Value::String(new_id(WORKSPACE_PREFIX)));
            match write_atomically(&file, &to_text(&map)) {
                Ok(()) => log::info!("a copied workspace has its own id now: {}", file.display()),
                Err(e) => log::warn!("{} not given its own id: {e}", file.display()),
            }
        }
    }
}

// ---- changing them

/// What a change to a workspace sets; anything left out stays as it was.
#[derive(serde::Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceChange {
    name: Option<String>,
    tags: Option<Vec<String>>,
    decks: Option<Vec<String>>,
    when: Option<String>,
    #[serde(rename = "where")]
    place: Option<String>,
    notes: Option<String>,
}

/// Applies `change` to the workspace's fields, checking what it sets.
fn apply(map: &mut Map<String, Value>, change: WorkspaceChange) -> Result<(), String> {
    if let Some(name) = change.name {
        let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
        if name.is_empty() {
            return Err("A workspace needs a name".into());
        }
        map.insert("name".into(), Value::String(name));
    }
    if let Some(tags) = change.tags {
        map.insert(
            "tags".into(),
            Value::Array(tidy_tags(tags).into_iter().map(Value::String).collect()),
        );
    }
    if let Some(decks) = change.decks {
        let mut ids: Vec<String> = Vec::new();
        for id in decks {
            if !is_valid_id(DECK_PREFIX, &id) {
                return Err(format!("{id} is not a deck's id"));
            }
            if !ids.contains(&id) {
                ids.push(id);
            }
        }
        map.insert(
            "decks".into(),
            Value::Array(ids.into_iter().map(Value::String).collect()),
        );
    }
    if let Some(when) = change.when {
        let when = when.trim().to_string();
        if !when.is_empty() && !is_date(&when) {
            return Err(format!("{when} is not a date"));
        }
        map.insert("when".into(), Value::String(when));
    }
    for (key, value) in [("where", change.place), ("notes", change.notes)] {
        if let Some(value) = value {
            map.insert(key.into(), Value::String(value.trim().to_string()));
        }
    }
    Ok(())
}

fn create_in(root: &Path, change: WorkspaceChange) -> Result<Workspace, String> {
    let mut map = Map::new();
    map.insert("id".into(), Value::String(new_id(WORKSPACE_PREFIX)));
    map.insert("tags".into(), Value::Array(Vec::new()));
    map.insert("decks".into(), Value::Array(Vec::new()));
    let name = change.name.clone().unwrap_or_default();
    let change = WorkspaceChange {
        name: Some(if name.trim().is_empty() {
            UNTITLED.into()
        } else {
            name
        }),
        ..change
    };
    apply(&mut map, change)?;
    let folder = new_folder(root, &name_for_folder(&text_of(&map, "name")))?;
    if let Err(e) = write_atomically(&folder.join(WORKSPACE_FILE), &to_text(&map)) {
        let _ = fs::remove_dir_all(&folder);
        return Err(format!("Could not save the workspace: {e}"));
    }
    Ok(read_workspace(&folder))
}

fn update_in(root: &Path, id: &str, change: WorkspaceChange) -> Result<Workspace, String> {
    let dir = find_in(root, id)?;
    let file = dir.join(WORKSPACE_FILE);
    let text =
        fs::read_to_string(&file).map_err(|e| format!("Could not read the workspace: {e}"))?;
    let mut map = parse(&text)?;
    let renamed = change.name.is_some();
    apply(&mut map, change)?;
    write_atomically(&file, &to_text(&map))
        .map_err(|e| format!("Could not save the workspace: {e}"))?;
    let dir = if renamed {
        rename_folder(&dir, &name_for_folder(&text_of(&map, "name")))?
    } else {
        dir
    };
    Ok(read_workspace(&dir))
}

// ---- commands

/// Every workspace, after giving any new or copied one its id.
#[tauri::command]
pub async fn list_workspaces(app: AppHandle) -> Result<Vec<Workspace>, String> {
    let root = root(&app)?;
    let _one = one_at_a_time();
    tidy_in(&root);
    Ok(list_in(&root))
}

/// Makes a workspace with a new id and what `change` sets; its folder is named for it.
#[tauri::command]
pub async fn create_workspace(
    app: AppHandle,
    change: WorkspaceChange,
) -> Result<Workspace, String> {
    let root = root(&app)?;
    let _one = one_at_a_time();
    create_in(&root, change)
}

/// Changes a workspace; a new name renames its folder too.
#[tauri::command]
pub async fn update_workspace(
    app: AppHandle,
    id: String,
    change: WorkspaceChange,
) -> Result<Workspace, String> {
    let root = root(&app)?;
    let _one = one_at_a_time();
    update_in(&root, &id, change)
}

/// Moves a workspace, with its resources, to the Trash; its decks stay in Decks.
#[tauri::command]
pub async fn trash_workspace(app: AppHandle, id: String) -> Result<(), String> {
    let root = root(&app)?;
    let _one = one_at_a_time();
    let dir = find_in(&root, &id)?;
    crate::platform::move_to_trash(&dir)
        .map_err(|e| format!("Could not move the workspace to the Trash: {e}"))
}

/// The Workspaces folder, for the skill's oversay-local.json.
pub(crate) fn folder(app: &AppHandle) -> Result<String, String> {
    Ok(root(app)?.display().to_string())
}

// ---- watching (ADR 0034)

/// Same name as `WORKSPACES_CHANGED_EVENT` in src/lib/workspaces/store.ts; both sides test it.
pub const WORKSPACES_CHANGED_EVENT: &str = "workspaces-changed";

/// How long the folder must be quiet before a change is reported.
const QUIET: Duration = Duration::from_millis(250);

/// Keeps the watcher alive while the app runs.
struct Watcher(#[allow(dead_code)] Mutex<Option<Debouncer<RecommendedWatcher>>>);

/// Whether a changed path under `root` may change the list: a workspace's folder or its
/// `workspace.json`. Resources and anything deeper do not.
fn is_change(root: &Path, path: &Path) -> bool {
    let Ok(inside) = path.strip_prefix(root) else {
        return false;
    };
    let parts: Vec<_> = inside.iter().map(|p| p.to_string_lossy()).collect();
    match parts.as_slice() {
        [one] => !one.starts_with('.'),
        [one, file] => !one.starts_with('.') && file == WORKSPACE_FILE,
        _ => false,
    }
}

/// Tells the manager when a workspace is made, renamed, changed or removed, by the skill, in
/// Finder or by Oversay; new and copied workspaces get their ids first.
pub fn watch(app: &AppHandle) {
    let watcher = root(app).and_then(|root| {
        let roots = [
            root.clone(),
            root.canonicalize().unwrap_or_else(|_| root.clone()),
        ];
        let tidied = root.clone();
        let app = app.clone();
        let mut debouncer = new_debouncer(QUIET, move |result: DebounceEventResult| match result {
            Ok(events)
                if events
                    .iter()
                    .any(|e| roots.iter().any(|r| is_change(r, &e.path))) =>
            {
                {
                    let _one = one_at_a_time();
                    tidy_in(&tidied);
                }
                let _ = app.emit(WORKSPACES_CHANGED_EVENT, ());
            }
            Ok(_) => {}
            Err(e) => log::warn!("watching Workspaces: {e}"),
        })
        .map_err(|e| e.to_string())?;
        debouncer
            .watcher()
            .watch(&root, RecursiveMode::Recursive)
            .map_err(|e| e.to_string())?;
        Ok(debouncer)
    });
    let watcher = watcher
        .inspect_err(|e| log::warn!("not watching Workspaces: {e}"))
        .ok();
    app.manage(Watcher(Mutex::new(watcher)));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("oversay-workspaces-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn named(name: &str) -> WorkspaceChange {
        WorkspaceChange {
            name: Some(name.into()),
            ..Default::default()
        }
    }

    /// The format the skill's reference is written from (workspace-format.json, `make skills`).
    #[test]
    fn the_format_is_the_one_the_skill_is_told() {
        let format: serde_json::Value = serde_json::from_str(include_str!(
            "../../src/lib/workspaces/workspace-format.json"
        ))
        .unwrap();
        assert_eq!(format["file"], WORKSPACE_FILE);
        assert_eq!(format["version"], VERSION);
        let keys: Vec<&str> = format["keys"]
            .as_array()
            .unwrap()
            .iter()
            .map(|k| k.as_str().unwrap())
            .collect();
        assert_eq!(keys, KNOWN);
    }

    #[test]
    fn the_event_has_the_frontends_name() {
        assert_eq!(WORKSPACES_CHANGED_EVENT, "workspaces-changed");
    }

    #[test]
    fn a_workspace_is_written_in_a_stable_order_and_keeps_unknown_fields() {
        let mut map = parse(
            r#"{"notes":"Panel with Ana","zebra":[1,2],"decks":["d_k3x9a2bq","d_7mq2xw4f"],"tags":["research","talks"],"name":"Prompt injection","id":"w_4hx8m2qa","where":"","alpha":{"b":1}}"#,
        )
        .unwrap();
        assert_eq!(
            to_text(&map),
            "{\n  \"version\": 1,\n  \"id\": \"w_4hx8m2qa\",\n  \"name\": \"Prompt injection\",\n  \"tags\": [\"research\", \"talks\"],\n  \"decks\": [\"d_k3x9a2bq\", \"d_7mq2xw4f\"],\n  \"notes\": \"Panel with Ana\",\n  \"alpha\": {\"b\":1},\n  \"zebra\": [1,2]\n}\n"
        );
        apply(
            &mut map,
            WorkspaceChange {
                when: Some("2026-06-02".into()),
                tags: Some(vec![
                    " Research ".into(),
                    "research".into(),
                    "".into(),
                    "appSec  talks".into(),
                ]),
                ..Default::default()
            },
        )
        .unwrap();
        let again = parse(&to_text(&map)).unwrap();
        assert_eq!(text_of(&again, "when"), "2026-06-02");
        assert_eq!(strings_of(&again, "tags"), vec!["Research", "AppSec talks"]);
        assert_eq!(again.get("zebra"), Some(&serde_json::json!([1, 2])));
    }

    #[test]
    fn a_workspace_is_read_leniently() {
        let w = workspace_from(
            "Prompt injection",
            Ok(r#"{"id":"bad","tags":["research",3,"Research"],"decks":["d_k3x9a2bq",7,"d_gone0000"],"when":3}"#.into()),
        );
        assert_eq!(w.id, "");
        assert_eq!(w.name, "Prompt injection", "the folder's name");
        assert_eq!(w.tags, vec!["Research"], "with an initial capital");
        assert_eq!(w.decks, vec!["d_k3x9a2bq", "d_gone0000"]);
        assert_eq!(w.when, "");
        assert_eq!(w.problem, None);
        let bad = workspace_from("Broken", Ok("{ not json".into()));
        assert!(bad.problem.unwrap().contains("not JSON"));
    }

    #[test]
    fn checks_what_the_skill_writes() {
        assert!(problems(r#"{"version":1,"name":"AppSec","tags":["conferences"],"decks":["d_k3x9a2bq"],"when":"2026-06-02","where":"Zoom"}"#).is_empty());
        let found = problems(
            r#"{"version":2,"id":"x","tags":"research","decks":["panel"],"when":"June","notes":4}"#,
        );
        assert_eq!(found.len(), 7, "{found:?}");
        assert!(problems("[]")[0].contains("not a workspace"));
    }

    #[test]
    fn workspaces_are_made_renamed_and_found_by_id() {
        let root = temp_dir("make");
        let made = create_in(
            &root,
            WorkspaceChange {
                name: Some("Prompt injection in AI agents".into()),
                tags: Some(vec!["research".into()]),
                when: Some("2026-12-02".into()),
                place: Some("AppSec Dublin".into()),
                notes: Some("30 minutes plus questions".into()),
                decks: Some(vec!["d_k3x9a2bq".into(), "d_k3x9a2bq".into()]),
            },
        )
        .unwrap();
        assert!(is_valid_id(WORKSPACE_PREFIX, &made.id));
        assert_eq!(made.folder, "Prompt injection in AI agents");
        assert_eq!(made.tags, vec!["Research"]);
        assert_eq!(made.decks, vec!["d_k3x9a2bq"], "a deck once");
        assert!(
            root.join("Prompt injection in AI agents/workspace.json")
                .is_file()
        );
        let twin = create_in(&root, named("Prompt injection in AI agents")).unwrap();
        assert_eq!(twin.folder, "Prompt injection in AI agents (2)");
        assert_eq!(create_in(&root, named("a/b: c")).unwrap().folder, "ab c");
        assert_eq!(
            create_in(&root, WorkspaceChange::default()).unwrap().name,
            "Untitled workspace"
        );

        let renamed = update_in(&root, &made.id, named("Prompt injection")).unwrap();
        assert_eq!(
            (renamed.name.as_str(), renamed.folder.as_str()),
            ("Prompt injection", "Prompt injection")
        );
        assert_eq!(renamed.when, "2026-12-02");

        // Renamed in Finder: still found by its id.
        fs::rename(root.join("Prompt injection"), root.join("Old name")).unwrap();
        let found = update_in(
            &root,
            &made.id,
            WorkspaceChange {
                decks: Some(vec!["d_7mq2xw4f".into(), "d_k3x9a2bq".into()]),
                tags: Some(vec!["research".into(), "talks".into()]),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(found.folder, "Old name");
        assert_eq!(found.decks, vec!["d_7mq2xw4f", "d_k3x9a2bq"]);
        assert_eq!(found.tags, vec!["Research", "Talks"]);
        assert!(
            update_in(
                &root,
                &made.id,
                WorkspaceChange {
                    decks: Some(vec!["../x".into()]),
                    ..Default::default()
                }
            )
            .is_err()
        );
        assert!(
            update_in(
                &root,
                &made.id,
                WorkspaceChange {
                    when: Some("June".into()),
                    ..Default::default()
                }
            )
            .is_err()
        );
        assert!(update_in(&root, "w_nothere0", named("x")).is_err());
        assert_eq!(list_in(&root).len(), 4);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn a_folder_without_workspace_json_is_left_alone() {
        let root = temp_dir("old");
        // The two-level folders of ADR 0038, before workspaces were groups of decks.
        let old = root.join("Conferences/AppSec June 2026");
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join("collection.json"), r#"{"name":"AppSec"}"#).unwrap();
        let bad = root.join("Broken");
        fs::create_dir_all(&bad).unwrap();
        fs::write(bad.join(WORKSPACE_FILE), "{ not json").unwrap();
        tidy_in(&root);
        let listed = list_in(&root);
        assert_eq!(listed.len(), 1, "{listed:?}");
        assert!(listed[0].problem.is_some());
        assert_eq!(
            fs::read_to_string(bad.join(WORKSPACE_FILE)).unwrap(),
            "{ not json"
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn new_and_copied_workspaces_get_their_own_ids() {
        let root = temp_dir("ids");
        let dir = root.join("From the skill");
        fs::create_dir_all(&dir).unwrap();
        fs::write(
            dir.join(WORKSPACE_FILE),
            r#"{"name":"From the skill","decks":[],"x":1}"#,
        )
        .unwrap();
        tidy_in(&root);
        let first = list_in(&root)[0].clone();
        assert!(is_valid_id(WORKSPACE_PREFIX, &first.id));
        assert!(
            fs::read_to_string(dir.join(WORKSPACE_FILE))
                .unwrap()
                .contains("\"x\": 1")
        );

        std::thread::sleep(Duration::from_millis(20));
        let copy = root.join("From the skill copy");
        fs::create_dir_all(&copy).unwrap();
        fs::copy(dir.join(WORKSPACE_FILE), copy.join(WORKSPACE_FILE)).unwrap();
        tidy_in(&root);
        let ids: Vec<_> = list_in(&root).iter().map(|w| w.id.clone()).collect();
        assert_eq!(ids.len(), 2);
        assert_ne!(ids[0], ids[1]);
        assert!(ids.contains(&first.id), "the original keeps its id");
        assert_eq!(find_in(&root, &first.id).unwrap(), dir);
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn only_workspaces_and_their_files_are_changes() {
        let root = Path::new("/W");
        assert!(is_change(root, Path::new("/W/Prompt injection")));
        assert!(is_change(
            root,
            Path::new("/W/Prompt injection/workspace.json")
        ));
        assert!(!is_change(root, Path::new("/W/Prompt injection/resources")));
        assert!(!is_change(
            root,
            Path::new("/W/Prompt injection/.workspace.json.tmp")
        ));
        assert!(!is_change(root, Path::new("/W/.DS_Store")));
        assert!(!is_change(root, Path::new("/Decks/x")));
    }
}
