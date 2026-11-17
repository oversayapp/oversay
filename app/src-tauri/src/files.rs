//! Files Oversay keeps in its config folder (settings, templates), and the two helpers every folder
//! of Oversay's uses: a name a folder can hold, and writing a file so it is never left half-written.
//! Project files were here until workspaces replaced projects (ADR 0039).

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

/// Config files are plain names like `recent.json`, never paths.
fn is_valid_config_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('.')
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
}

pub(crate) fn config_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    if !is_valid_config_name(name) {
        return Err(format!("Invalid config file name: {name}"));
    }
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(name))
}

/// Text of a file in the app's config folder, or None if it does not exist yet.
#[tauri::command]
pub async fn read_config_file(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let path = config_path(&app, &name)?;
    match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Could not read {}: {e}", path.display())),
    }
}

#[tauri::command]
pub async fn write_config_file(
    app: AppHandle,
    name: String,
    contents: String,
) -> Result<(), String> {
    let path = config_path(&app, &name)?;
    log::debug!("write config file {}", path.display());
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    }
    write_atomically(&path, &contents)
        .map_err(|e| format!("Could not save {}: {e}", path.display()))
}

const WINDOWS_RESERVED: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// A folder or file name made from a name a person typed (a deck's, a collection's, a workspace's): characters Mac and Windows folders can't
/// hold are dropped, spaces tidied, leading and trailing dots and spaces trimmed.
pub(crate) fn folder_name(name: &str) -> String {
    let kept: String = name
        .chars()
        .filter(|c| {
            // `$` and backticks too: a name from a calendar invite reaches a shell when an agent
            // checks the file, and they run there even in double quotes.
            !c.is_control()
                && !matches!(
                    c,
                    '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '$' | '`'
                )
        })
        .collect();
    let spaced = kept.split_whitespace().collect::<Vec<_>>().join(" ");
    let short: String = spaced.trim_matches(['.', ' ']).chars().take(80).collect();
    // Cutting to 80 can leave a trailing space or dot again.
    let tidy = short.trim_end_matches(['.', ' ']).to_string();
    if tidy.is_empty() {
        return "Untitled".into();
    }
    // Windows refuses a reserved name before the first dot too ("con.notes"), so that part is
    // what's checked, and " project" goes right after it.
    let (base, rest) = tidy.split_at(tidy.find('.').unwrap_or(tidy.len()));
    if WINDOWS_RESERVED.contains(&base.trim_end().to_ascii_uppercase().as_str()) {
        return format!("{} project{rest}", base.trim_end());
    }
    tidy
}

/// Writes `contents` to `path` so it is never left half-written: into a new file beside it, then
/// renamed over it. The new file must not exist already (`create_new` never opens, or follows, what
/// is there) and its name is unique to this save, so nothing put in the folder beforehand is written to.
pub(crate) fn write_atomically(path: &Path, contents: &str) -> std::io::Result<()> {
    use std::io::Write;
    let mut tmp: PathBuf = path.to_path_buf();
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    tmp.set_file_name(format!(".{name}.{}.tmp", crate::ids::new_id("t")));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&tmp)?;
    // From here the file is ours: it is removed if anything fails, and closed before the rename.
    let written = (|| {
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
        drop(file);
        fs::rename(&tmp, path)
    })();
    if written.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    written
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("oversay-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn writes_and_overwrites_without_leaving_temp_files() {
        let dir = temp_dir("write");
        let file = dir.join("a.oversay.json");
        write_atomically(&file, "one\n").unwrap();
        write_atomically(&file, "two\n").unwrap();
        assert_eq!(fs::read_to_string(&file).unwrap(), "two\n");
        let names: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        assert_eq!(names.len(), 1);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn a_save_does_not_write_through_a_link_that_is_already_there() {
        let dir = temp_dir("planted");
        let other = dir.join("other.txt");
        fs::write(&other, "untouched\n").unwrap();
        let file = dir.join("a.oversay.json");
        std::os::unix::fs::symlink(&other, dir.join(".a.oversay.json.tmp")).unwrap();
        write_atomically(&file, "saved\n").unwrap();
        assert_eq!(fs::read_to_string(&other).unwrap(), "untouched\n");
        assert_eq!(fs::read_to_string(&file).unwrap(), "saved\n");
        assert!(
            !fs::symlink_metadata(&file)
                .unwrap()
                .file_type()
                .is_symlink()
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn folder_names_drop_characters_folders_cannot_hold() {
        assert_eq!(folder_name("Spring keynote"), "Spring keynote");
        assert_eq!(folder_name("  Q3: plan / review?  "), "Q3 plan review");
        assert_eq!(folder_name("..hidden.."), "hidden");
        assert_eq!(folder_name("Q3 `id` $(id) $HOME"), "Q3 id (id) HOME");
        assert_eq!(folder_name("  "), "Untitled");
        assert_eq!(folder_name("con"), "con project");
        assert_eq!(folder_name("con.notes"), "con project.notes");
        assert_eq!(folder_name("LPT1 .draft"), "LPT1 project.draft");
        assert_eq!(folder_name("Console"), "Console");
        assert_eq!(folder_name(&"x".repeat(200)).len(), 80);
    }

    #[test]
    fn config_names_are_plain_file_names() {
        for ok in ["recent.json", "templates.json", "a-b_c.json"] {
            assert!(is_valid_config_name(ok), "{ok}");
        }
        for bad in ["", ".hidden", "../x", "a/b", "a\\b", "x y", "~"] {
            assert!(!is_valid_config_name(bad), "{bad}");
        }
    }

    #[test]
    fn fails_clearly_when_the_folder_is_missing() {
        let dir = temp_dir("missing");
        let file = dir.join("nope").join("a.oversay.json");
        assert!(write_atomically(&file, "x").is_err());
        fs::remove_dir_all(&dir).unwrap();
    }
}
