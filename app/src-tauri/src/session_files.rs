//! A session's files in its deck's folder (ADR 0041, spec §11): its transcript in `transcripts/`,
//! its review in `reviews/` (written by the AI skill) and its recording in `recordings/` until it is
//! transcribed. Each is named by the session's start in local time, `YYYY-MM-DD HH-mm`, ` -2` for a
//! second Start in the same minute; any other name is refused, so nothing outside those folders is
//! read, written or moved to the Trash.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::files::write_atomically;
use crate::quick::deck_folder;

pub const TRANSCRIPTS: &str = "transcripts";
pub const REVIEWS: &str = "reviews";
pub const RECORDINGS: &str = "recordings";

/// What kind of session file, its folder and its extension.
#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum SessionFile {
    Transcript,
    Review,
    Recording,
}

impl SessionFile {
    fn folder(self) -> &'static str {
        match self {
            Self::Transcript => TRANSCRIPTS,
            Self::Review => REVIEWS,
            Self::Recording => RECORDINGS,
        }
    }

    fn ext(self) -> &'static str {
        match self {
            Self::Recording => ".wav",
            _ => ".md",
        }
    }
}

/// `YYYY-MM-DD HH-mm`, or that with ` -N` (2 to 999) after it.
pub fn is_session_name(name: &str) -> bool {
    // A name that isn't ASCII can't be one, and would split inside a character.
    if !name.is_ascii() {
        return false;
    }
    let (stamp, rest) = name.split_at(name.len().min(16));
    let digits = |s: &str| !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit());
    let b = stamp.as_bytes();
    let stamp_ok = b.len() == 16
        && digits(&stamp[0..4])
        && b[4] == b'-'
        && digits(&stamp[5..7])
        && b[7] == b'-'
        && digits(&stamp[8..10])
        && b[10] == b' '
        && digits(&stamp[11..13])
        && b[13] == b'-'
        && digits(&stamp[14..16]);
    let rest_ok = rest.is_empty()
        || rest
            .strip_prefix(" -")
            .is_some_and(|n| digits(n) && n.len() <= 3 && !n.starts_with('0') && n != "1");
    stamp_ok && rest_ok
}

/// The file of session `name` of `kind` in the deck folder `folder`. Its folder is never reached
/// through a link, nor is the file itself one.
pub fn file_in(folder: &Path, kind: SessionFile, name: &str) -> Result<PathBuf, String> {
    if !is_session_name(name) {
        return Err(format!("{name} is not a session's name"));
    }
    let dir = folder.join(kind.folder());
    let file = dir.join(format!("{name}{}", kind.ext()));
    let linked = |p: &Path| fs::symlink_metadata(p).is_ok_and(|m| m.file_type().is_symlink());
    if linked(&dir) || linked(&file) {
        return Err(format!(
            "{} is a link; Oversay doesn't follow it",
            file.display()
        ));
    }
    Ok(file)
}

/// The session names that have a file of `kind`, sorted; none when the folder isn't there.
fn names_in(folder: &Path, kind: SessionFile) -> io::Result<Vec<String>> {
    let dir = folder.join(kind.folder());
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e),
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|e| e.file_type().is_ok_and(|t| t.is_file()))
        .filter_map(|e| {
            let file = e.file_name().to_string_lossy().into_owned();
            file.strip_suffix(kind.ext()).map(str::to_owned)
        })
        .filter(|n| is_session_name(n))
        .collect();
    names.sort();
    Ok(names)
}

#[derive(serde::Serialize, Debug, Default, PartialEq)]
pub struct SessionFiles {
    transcripts: Vec<String>,
    reviews: Vec<String>,
    recordings: Vec<String>,
}

fn files_in(folder: &Path) -> io::Result<SessionFiles> {
    Ok(SessionFiles {
        transcripts: names_in(folder, SessionFile::Transcript)?,
        reviews: names_in(folder, SessionFile::Review)?,
        recordings: names_in(folder, SessionFile::Recording)?,
    })
}

/// Which sessions of the deck at `path` have a transcript, a review or a recording, by name.
#[tauri::command]
pub async fn list_session_files(app: AppHandle, path: String) -> Result<SessionFiles, String> {
    let folder = deck_folder(&app, &path)?;
    files_in(&folder).map_err(|e| format!("Could not list the session's files: {e}"))
}

/// A session's transcript or review, as text.
#[tauri::command]
pub async fn read_session_file(
    app: AppHandle,
    path: String,
    kind: SessionFile,
    name: String,
) -> Result<String, String> {
    if kind == SessionFile::Recording {
        return Err("A recording is not text".into());
    }
    let file = file_in(&deck_folder(&app, &path)?, kind, &name)?;
    fs::read_to_string(&file).map_err(|e| format!("Could not read {}: {e}", file.display()))
}

/// Writes a session's transcript (Oversay's own; reviews are the skill's).
#[tauri::command]
pub async fn write_transcript(
    app: AppHandle,
    path: String,
    name: String,
    contents: String,
) -> Result<(), String> {
    let file = file_in(&deck_folder(&app, &path)?, SessionFile::Transcript, &name)?;
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("Could not keep the transcript: {e}"))?;
    }
    write_atomically(&file, &contents).map_err(|e| format!("Could not keep the transcript: {e}"))
}

/// The largest call transcript read: hours of talk are a few hundred kilobytes.
const TRANSCRIPT_LIMIT: u64 = 5 * 1024 * 1024;

/// A call app's transcript the person dropped or picked, as text: only a `.vtt`, `.srt` or `.txt`
/// file, no larger than the limit. Oversay reads it to line it up with the session; it is never run
/// or shown as HTML.
fn read_dropped(file: &Path) -> Result<String, String> {
    let name = file
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let lower = name.to_lowercase();
    if ![".vtt", ".srt", ".txt"].iter().any(|e| lower.ends_with(e)) {
        return Err(format!(
            "{name} isn’t a transcript: Oversay reads .vtt, .srt and .txt files."
        ));
    }
    let meta = fs::metadata(file).map_err(|e| format!("Could not read {name}: {e}"))?;
    if !meta.is_file() {
        return Err(format!("{name} isn’t a file."));
    }
    if meta.len() > TRANSCRIPT_LIMIT {
        return Err(format!("{name} is too large for a transcript (over 5 MB)."));
    }
    let bytes = fs::read(file).map_err(|e| format!("Could not read {name}: {e}"))?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[tauri::command]
pub async fn read_transcript_file(path: String) -> Result<String, String> {
    read_dropped(Path::new(&path))
}

/// Moves each of a session's files there are to the Trash: with the session, when it is deleted.
fn trash_in(
    folder: &Path,
    name: &str,
    trash: impl Fn(&Path) -> Result<(), String>,
) -> Result<(), String> {
    for kind in [
        SessionFile::Transcript,
        SessionFile::Review,
        SessionFile::Recording,
    ] {
        let file = file_in(folder, kind, name)?;
        if fs::symlink_metadata(&file).is_ok() {
            trash(&file)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn trash_session_files(app: AppHandle, path: String, name: String) -> Result<(), String> {
    trash_in(&deck_folder(&app, &path)?, &name, |f| {
        crate::platform::move_to_trash(f)
            .map_err(|e| format!("Could not move {} to the Trash: {e}", f.display()))
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "oversay-session-files-{name}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn only_a_sessions_name_is_taken() {
        for good in [
            "2026-10-28 09-00",
            "2026-10-28 09-00 -2",
            "2026-10-28 09-00 -13",
        ] {
            assert!(is_session_name(good), "{good}");
        }
        for bad in [
            "",
            "../2026-10-28 09-00",
            "2026-10-28 09-00/x",
            "2026-10-28 9-00",
            "2026-10-28 09-00 -1",
            "2026-10-28 09-00 -02",
            "2026-10-28 09-00-2",
            "2026-10-28 09-00 -1000",
            "2026-10-28T09-00",
            "x026-10-28 09-00",
            "2026-10-28 09-0é",
            "2026-10-28 09-00 -é",
        ] {
            assert!(!is_session_name(bad), "{bad}");
        }
        assert!(file_in(Path::new("/d"), SessionFile::Review, "../../etc/passwd").is_err());
        assert_eq!(
            file_in(Path::new("/d"), SessionFile::Recording, "2026-10-28 09-00").unwrap(),
            PathBuf::from("/d/recordings/2026-10-28 09-00.wav")
        );
    }

    #[test]
    fn lists_the_sessions_with_files_and_nothing_else() {
        let deck = temp_dir("list");
        assert_eq!(files_in(&deck).unwrap(), SessionFiles::default());
        fs::create_dir_all(deck.join(TRANSCRIPTS)).unwrap();
        fs::create_dir_all(deck.join(REVIEWS).join("2026-10-27 09-00.md")).unwrap();
        fs::write(deck.join(TRANSCRIPTS).join("2026-10-28 09-00 -2.md"), "t").unwrap();
        fs::write(deck.join(TRANSCRIPTS).join("2026-10-28 09-00.md"), "t").unwrap();
        fs::write(deck.join(TRANSCRIPTS).join("notes.md"), "t").unwrap();
        fs::write(deck.join(TRANSCRIPTS).join("2026-10-26 09-00.txt"), "t").unwrap();
        let files = files_in(&deck).unwrap();
        assert_eq!(
            files.transcripts,
            vec!["2026-10-28 09-00", "2026-10-28 09-00 -2"]
        );
        assert!(
            files.reviews.is_empty(),
            "a folder named like a review is not one"
        );
        fs::remove_dir_all(&deck).unwrap();
    }

    #[test]
    fn deleting_a_session_trashes_each_of_its_files_there_are() {
        let deck = temp_dir("trash");
        fs::create_dir_all(deck.join(TRANSCRIPTS)).unwrap();
        fs::create_dir_all(deck.join(RECORDINGS)).unwrap();
        fs::write(deck.join(TRANSCRIPTS).join("2026-10-28 09-00.md"), "t").unwrap();
        fs::write(deck.join(RECORDINGS).join("2026-10-28 09-00.wav"), "w").unwrap();
        fs::write(deck.join(TRANSCRIPTS).join("2026-10-27 09-00.md"), "kept").unwrap();
        let trashed = RefCell::new(Vec::new());
        trash_in(&deck, "2026-10-28 09-00", |f| {
            trashed
                .borrow_mut()
                .push(f.strip_prefix(&deck).unwrap().to_path_buf());
            Ok(())
        })
        .unwrap();
        assert_eq!(
            *trashed.borrow(),
            vec![
                PathBuf::from("transcripts/2026-10-28 09-00.md"),
                PathBuf::from("recordings/2026-10-28 09-00.wav")
            ]
        );
        assert!(trash_in(&deck, "../x", |_| Ok(())).is_err());
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(std::env::temp_dir(), deck.join(REVIEWS)).unwrap();
            assert!(
                file_in(&deck, SessionFile::Review, "2026-10-28 09-00").is_err(),
                "a linked folder is refused"
            );
        }
        fs::remove_dir_all(&deck).unwrap();
    }

    #[test]
    fn reads_only_a_transcript_file_of_a_sensible_size() {
        let dir = temp_dir("dropped");
        fs::write(dir.join("call.vtt"), "WEBVTT\n").unwrap();
        assert_eq!(read_dropped(&dir.join("call.vtt")).unwrap(), "WEBVTT\n");
        fs::write(dir.join("slides.pdf"), "%PDF").unwrap();
        assert!(
            read_dropped(&dir.join("slides.pdf"))
                .unwrap_err()
                .contains("isn’t a transcript")
        );
        fs::create_dir_all(dir.join("folder.txt")).unwrap();
        assert!(read_dropped(&dir.join("folder.txt")).is_err());
        let big = fs::File::create(dir.join("big.srt")).unwrap();
        big.set_len(TRANSCRIPT_LIMIT + 1).unwrap();
        assert!(
            read_dropped(&dir.join("big.srt"))
                .unwrap_err()
                .contains("too large")
        );
        fs::remove_dir_all(&dir).unwrap();
    }
}
