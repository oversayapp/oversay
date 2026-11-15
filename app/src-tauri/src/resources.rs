//! A deck's resources (ADR 0037), and a workspace's (ADR 0040): whatever is in its
//! `resources/` folder, and nothing else;
//! there is no list to keep. A file dropped on the deck is copied in, a URL becomes a web link file
//! (`.webloc` on a Mac, `.url` on Windows), and anything a person puts there in Finder or Explorer
//! counts too. This lists the folder without following a link or reading a file in it, and opens
//! one only when the person clicks it, handing it to the system as Finder would (ADR 0023).

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::files::{folder_name, write_atomically};
use crate::quick::deck_folder;
use crate::workspaces::workspace_folder;

/// The folder in a deck's folder that holds its resources.
const RESOURCES: &str = "resources";

/// The largest file a drop copies in: a document or a deck of slides, not a video library. Over
/// it, the person keeps the file where it is and drops a link to it instead.
const RESOURCE_LIMIT: u64 = 200 * 1024 * 1024;

#[derive(serde::Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Resource {
    name: String,
    /// `file`, `folder`, `link` (a web link file) or `alias` (a symlink, or a Windows shortcut).
    kind: &'static str,
    /// Its size in bytes; none for a folder or a link that points elsewhere.
    size: Option<u64>,
    /// When it last changed, in milliseconds since 1970.
    modified_ms: i64,
}

/// What a resource is, from its own metadata and its name, never its contents or its target.
fn kind_of(name: &str, meta: &fs::Metadata) -> &'static str {
    let lower = name.to_lowercase();
    if meta.file_type().is_symlink() || lower.ends_with(".lnk") {
        "alias"
    } else if meta.is_dir() {
        "folder"
    } else if lower.ends_with(".webloc") || lower.ends_with(".url") {
        "link"
    } else {
        "file"
    }
}

/// Everything in `dir` (a deck's `resources/`), by name; hidden files such as `.DS_Store` are
/// left out, and nothing is followed or read.
fn list_in(dir: &Path) -> io::Result<Vec<Resource>> {
    let mut found = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(found),
        Err(e) => return Err(e),
    };
    for entry in entries.filter_map(Result::ok) {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let Ok(meta) = fs::symlink_metadata(entry.path()) else {
            continue;
        };
        let kind = kind_of(&name, &meta);
        found.push(Resource {
            size: (kind != "folder" && kind != "alias").then_some(meta.len()),
            modified_ms: meta
                .modified()
                .map(|m| chrono::DateTime::<chrono::Utc>::from(m).timestamp_millis())
                .unwrap_or(0),
            kind,
            name,
        });
    }
    found.sort_by_key(|r| r.name.to_lowercase());
    Ok(found)
}

/// `dir/name`, or `name 2.ext`, `name 3.ext`… when taken, reserved by making it empty.
fn free_name(dir: &Path, name: &str) -> io::Result<PathBuf> {
    let (stem, ext) = match name.rfind('.').filter(|&i| i > 0) {
        Some(i) => (&name[..i], &name[i..]),
        None => (name, ""),
    };
    for n in 1..1000 {
        let file = dir.join(if n == 1 {
            name.to_string()
        } else {
            format!("{stem} {n}{ext}")
        });
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&file)
        {
            Ok(_) => return Ok(file),
            Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(io::Error::other(format!("too many called {name}")))
}

/// Copies the file at `from` into `dir`, keeping its name (numbered when taken); the original is
/// left where it was. A folder, or a file over the limit, is refused with what to do instead.
fn copy_in(dir: &Path, from: &Path) -> Result<PathBuf, String> {
    let name = from
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .ok_or_else(|| format!("{} has no name", from.display()))?;
    let meta = fs::metadata(from).map_err(|e| format!("Could not read {name}: {e}"))?;
    if meta.is_dir() {
        return Err(format!(
            "{name} is a folder. Drop the files in it, or put the folder in the resources folder in Finder."
        ));
    }
    if meta.len() > RESOURCE_LIMIT {
        return Err(format!(
            "{name} is too large to copy in ({} MB; the most is {} MB). Keep it where it is and drop a link to it instead.",
            meta.len() / (1024 * 1024),
            RESOURCE_LIMIT / (1024 * 1024)
        ));
    }
    fs::create_dir_all(dir).map_err(|e| format!("Could not make the resources folder: {e}"))?;
    let to = free_name(dir, &name).map_err(|e| format!("Could not add {name}: {e}"))?;
    let copied = fs::File::open(from)
        .and_then(|mut source| io::copy(&mut source, &mut fs::File::create(&to)?));
    if let Err(e) = copied {
        let _ = fs::remove_file(&to);
        return Err(format!("Could not copy {name}: {e}"));
    }
    Ok(to)
}

/// A web URL checked: `http` or `https` with a host, written as the `url` crate normalises it
/// (so it holds no spaces, quotes, angle brackets or line breaks).
fn web_url(text: &str) -> Result<url::Url, String> {
    let url =
        url::Url::parse(text.trim()).map_err(|_| format!("{} is not a web link", text.trim()))?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err(format!("{} is not a web link", text.trim()));
    }
    Ok(url)
}

/// A web link file's name, without its extension: the site and the last part of the path
/// (`docs.example.com plan`), as a file name may hold it.
fn link_name(url: &url::Url) -> String {
    let host = url.host_str().unwrap_or("link").trim_start_matches("www.");
    let last = url
        .path_segments()
        .and_then(|mut s| s.rfind(|p| !p.is_empty()))
        .unwrap_or("");
    folder_name(&format!("{host} {last}"))
}

/// The web link file for `url`, as the system makes one when a link is dragged to the desktop:
/// a `.webloc` property list on a Mac, an Internet shortcut elsewhere.
fn web_link_file(url: &url::Url) -> (&'static str, String) {
    if cfg!(target_os = "macos") {
        let escaped = url
            .as_str()
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;");
        (
            ".webloc",
            format!(
                "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">\n<plist version=\"1.0\">\n<dict>\n\t<key>URL</key>\n\t<string>{escaped}</string>\n</dict>\n</plist>\n"
            ),
        )
    } else {
        (
            ".url",
            format!("[InternetShortcut]\r\nURL={}\r\n", url.as_str()),
        )
    }
}

/// Writes a web link file for `text` into `dir`; returns its path.
fn link_in(dir: &Path, text: &str) -> Result<PathBuf, String> {
    let url = web_url(text)?;
    let (ext, contents) = web_link_file(&url);
    fs::create_dir_all(dir).map_err(|e| format!("Could not make the resources folder: {e}"))?;
    let to = free_name(dir, &format!("{}{ext}", link_name(&url)))
        .map_err(|e| format!("Could not add the link: {e}"))?;
    write_atomically(&to, &contents).map_err(|e| format!("Could not add the link: {e}"))?;
    Ok(to)
}

/// The resource called `name` in `dir`: a plain name of something there, never a path.
fn resource_in(dir: &Path, name: &str) -> Result<PathBuf, String> {
    let plain = !name.is_empty()
        && name != "."
        && name != ".."
        && !name.contains(['/', '\\'])
        && !name.chars().any(char::is_control);
    let file = dir.join(name);
    if !plain || fs::symlink_metadata(&file).is_err() {
        return Err(format!("{name} is not in these resources"));
    }
    Ok(file)
}

/// Whose resources: a deck, by its file's path, or a workspace, by its id. Sent as
/// `{ "deck": path }` or `{ "workspace": id }` (`ResourceOwner` in src/lib/decks/resources.ts).
#[derive(serde::Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum Owner {
    Deck(String),
    Workspace(String),
}

fn resources_of(app: &AppHandle, owner: &Owner) -> Result<PathBuf, String> {
    let folder = match owner {
        Owner::Deck(path) => deck_folder(app, path)?,
        Owner::Workspace(id) => workspace_folder(app, id)?,
    };
    Ok(folder.join(RESOURCES))
}

/// What is in the resources folder (none when it has none yet).
#[tauri::command]
pub async fn list_resources(app: AppHandle, owner: Owner) -> Result<Vec<Resource>, String> {
    let dir = resources_of(&app, &owner)?;
    list_in(&dir).map_err(|e| format!("Could not list the resources: {e}"))
}

/// Copies dropped files into the resources; returns what each became, or why not.
#[tauri::command]
pub async fn add_resources(
    app: AppHandle,
    owner: Owner,
    paths: Vec<String>,
) -> Result<Vec<Result<String, String>>, String> {
    let dir = resources_of(&app, &owner)?;
    Ok(paths
        .iter()
        .map(|p| copy_in(&dir, Path::new(p)).map(|to| to.to_string_lossy().into_owned()))
        .collect())
}

/// Adds a web link to the resources; returns its path.
#[tauri::command]
pub async fn add_resource_link(
    app: AppHandle,
    owner: Owner,
    url: String,
) -> Result<String, String> {
    let to = link_in(&resources_of(&app, &owner)?, &url)?;
    Ok(to.to_string_lossy().into_owned())
}

/// File types that run code when the system opens them. A deck folder can come from someone else,
/// so one click must never start these: they are shown in Finder or Explorer instead.
const RUNNABLE: &[&str] = &[
    "app",
    "command",
    "tool",
    "workflow",
    "action",
    "scpt",
    "scptd",
    "pkg",
    "dmg",
    "sh",
    "bash",
    "zsh",
    "csh",
    "exe",
    "com",
    "scr",
    "bat",
    "cmd",
    "msi",
    "msp",
    "lnk",
    "ps1",
    "psm1",
    "vbs",
    "vbe",
    "js",
    "jse",
    "wsf",
    "wsh",
    "hta",
    "jar",
    "reg",
    "pif",
    "cpl",
    "appref-ms",
    "desktop",
    "appimage",
    "deb",
    "rpm",
    "terminal",
    "inetloc",
];

/// Whether `path` names a type that runs code when opened.
fn is_runnable(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| RUNNABLE.contains(&e.to_ascii_lowercase().as_str()))
}

/// The address a `.webloc` or `.url` file holds, read from its first few KB.
fn link_target(file: &Path) -> Option<String> {
    use std::io::Read;
    let mut text = String::new();
    fs::File::open(file)
        .ok()?
        .take(4096)
        .read_to_string(&mut text)
        .ok()?;
    let from = text
        .lines()
        .find_map(|l| l.trim().strip_prefix("URL="))
        .map(str::to_string)
        .or_else(|| {
            let (_, rest) = text.split_once("<key>URL</key>")?;
            let (_, rest) = rest.split_once("<string>")?;
            Some(rest.split_once("</string>")?.0.to_string())
        })?;
    Some(from.trim().to_string())
}

/// Whether the system should open `file`, or only show it in its folder: never a type that runs
/// code, never a link that isn't http(s), and never a link or alias that points at one.
fn safe_to_open(file: &Path) -> bool {
    let lower = file.to_string_lossy().to_lowercase();
    if is_runnable(file) {
        return false;
    }
    if lower.ends_with(".webloc") || lower.ends_with(".url") {
        return link_target(file).is_some_and(|t| {
            url::Url::parse(&t).is_ok_and(|u| matches!(u.scheme(), "http" | "https"))
        });
    }
    match fs::symlink_metadata(file) {
        Ok(m) if m.file_type().is_symlink() => fs::canonicalize(file)
            .map(|target| !is_runnable(&target))
            .unwrap_or(false),
        _ => true,
    }
}

/// Opens one resource the way Finder or Explorer would: a document in its app, a web link in the
/// browser, an alias or shortcut at what it points to. A program, a script or a link to anything
/// but a web address is only shown in its folder (a deck folder may have come from someone else).
#[tauri::command]
pub async fn open_resource(app: AppHandle, owner: Owner, name: String) -> Result<(), String> {
    let file = resource_in(&resources_of(&app, &owner)?, &name)?;
    log::debug!("open resource {}", file.display());
    if safe_to_open(&file) {
        tauri_plugin_opener::open_path(&file, None::<&str>)
            .map_err(|e| format!("Could not open {name}: {e}"))
    } else {
        tauri_plugin_opener::reveal_item_in_dir(&file)
            .map_err(|e| format!("Could not show {name}: {e}"))
    }
}

/// Shows the resources folder in Finder or Explorer, making it when it isn't there yet.
#[tauri::command]
pub async fn open_resources_folder(app: AppHandle, owner: Owner) -> Result<(), String> {
    let dir = resources_of(&app, &owner)?;
    fs::create_dir_all(&dir).map_err(|e| format!("Could not make the resources folder: {e}"))?;
    tauri_plugin_opener::open_path(&dir, None::<&str>)
        .map_err(|e| format!("Could not open the resources folder: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("oversay-resources-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn programs_and_odd_links_are_shown_not_opened() {
        let dir = temp_dir("runnable");
        for name in ["run.command", "Setup.EXE", "x.app", "a.lnk", "t.sh"] {
            let f = dir.join(name);
            fs::write(&f, "x").unwrap();
            assert!(!safe_to_open(&f), "{name}");
        }
        let notes = dir.join("notes.pdf");
        fs::write(&notes, "%PDF").unwrap();
        assert!(safe_to_open(&notes));
        let web = dir.join("a.url");
        fs::write(&web, "[InternetShortcut]\r\nURL=https://example.com/q3\r\n").unwrap();
        assert!(safe_to_open(&web));
        let file_url = dir.join("b.url");
        fs::write(
            &file_url,
            "[InternetShortcut]\r\nURL=file:///Applications/Calculator.app\r\n",
        )
        .unwrap();
        assert!(!safe_to_open(&file_url));
        let webloc = dir.join("c.webloc");
        fs::write(
            &webloc,
            "<dict><key>URL</key>\n<string>smb://host/x</string></dict>",
        )
        .unwrap();
        assert!(!safe_to_open(&webloc));
        #[cfg(unix)]
        {
            let link = dir.join("to-script");
            std::os::unix::fs::symlink(dir.join("run.command"), &link).unwrap();
            assert!(!safe_to_open(&link));
        }
    }

    #[test]
    fn a_dropped_file_is_copied_in_and_never_over_another() {
        let dir = temp_dir("copy").join("resources");
        let from = temp_dir("copyfrom").join("Q3 numbers.pdf");
        fs::write(&from, "%PDF numbers").unwrap();
        let first = copy_in(&dir, &from).unwrap();
        let second = copy_in(&dir, &from).unwrap();
        assert_eq!(first, dir.join("Q3 numbers.pdf"));
        assert_eq!(second, dir.join("Q3 numbers 2.pdf"));
        assert_eq!(fs::read_to_string(&second).unwrap(), "%PDF numbers");
        assert_eq!(
            fs::read_to_string(&from).unwrap(),
            "%PDF numbers",
            "the original stays as it was"
        );
        let listed = list_in(&dir).unwrap();
        assert_eq!(
            listed
                .iter()
                .map(|r| (r.name.as_str(), r.kind, r.size))
                .collect::<Vec<_>>(),
            vec![
                ("Q3 numbers 2.pdf", "file", Some(12)),
                ("Q3 numbers.pdf", "file", Some(12)),
            ]
        );
        fs::remove_dir_all(dir.parent().unwrap()).unwrap();
        fs::remove_dir_all(from.parent().unwrap()).unwrap();
    }

    #[test]
    fn a_folder_or_a_file_over_the_limit_is_refused_with_what_to_do() {
        let dir = temp_dir("refuse").join("resources");
        let from = temp_dir("refusefrom");
        let err = copy_in(&dir, &from).unwrap_err();
        assert!(err.contains("is a folder"), "{err}");
        let big = from.join("film.mov");
        fs::File::create(&big)
            .unwrap()
            .set_len(RESOURCE_LIMIT + 1)
            .unwrap();
        let err = copy_in(&dir, &big).unwrap_err();
        assert!(
            err.contains("too large") && err.contains("drop a link"),
            "{err}"
        );
        assert!(list_in(&dir).unwrap().is_empty());
        fs::remove_dir_all(dir.parent().unwrap()).unwrap();
        fs::remove_dir_all(&from).unwrap();
    }

    #[test]
    fn a_url_becomes_a_web_link_file_and_anything_else_is_refused() {
        let dir = temp_dir("link");
        let to = link_in(&dir, " https://www.example.com/plans/q3?a=1&b=<2> ").unwrap();
        let text = fs::read_to_string(&to).unwrap();
        if cfg!(target_os = "macos") {
            assert_eq!(to, dir.join("example.com q3.webloc"));
            assert!(
                text.contains(
                    "<string>https://www.example.com/plans/q3?a=1&amp;b=%3C2%3E</string>"
                ),
                "{text}"
            );
        } else {
            assert_eq!(to, dir.join("example.com q3.url"));
            assert!(
                text.contains("URL=https://www.example.com/plans/q3?a=1&b=%3C2%3E\r\n"),
                "{text}"
            );
        }
        for bad in [
            "file:///etc/passwd",
            "javascript:alert(1)",
            "plans/q3",
            "https://",
        ] {
            assert!(link_in(&dir, bad).is_err(), "{bad}");
        }
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn lists_folders_links_and_aliases_without_following_them() {
        let dir = temp_dir("list");
        fs::create_dir(dir.join("Drafts")).unwrap();
        fs::write(dir.join("Plan.webloc"), "x").unwrap();
        fs::write(dir.join("Budget.lnk"), "x").unwrap();
        fs::write(dir.join(".DS_Store"), "x").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink("/nowhere/at/all", dir.join("Old report")).unwrap();
        let listed: Vec<_> = list_in(&dir)
            .unwrap()
            .into_iter()
            .map(|r| (r.name, r.kind))
            .collect();
        let mut want = vec![
            ("Budget.lnk".to_string(), "alias"),
            ("Drafts".to_string(), "folder"),
            ("Plan.webloc".to_string(), "link"),
        ];
        if cfg!(unix) {
            want.insert(2, ("Old report".to_string(), "alias"));
        }
        assert_eq!(listed, want);
        assert!(list_in(&dir.join("missing")).unwrap().is_empty());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn opens_only_a_resource_by_its_plain_name() {
        let dir = temp_dir("open");
        fs::write(dir.join("Plan.pdf"), "x").unwrap();
        assert_eq!(resource_in(&dir, "Plan.pdf"), Ok(dir.join("Plan.pdf")));
        for bad in [
            "",
            ".",
            "..",
            "../deck.md",
            "a/b",
            "a\\b",
            "Missing.pdf",
            "Plan.pdf\n",
        ] {
            assert!(resource_in(&dir, bad).is_err(), "{bad:?}");
        }
        fs::remove_dir_all(&dir).unwrap();
    }
}
