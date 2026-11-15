//! `Oversay --check <file>` (#205, ADR 0031): the Oversay skill checks a quick talk, a quick note
//! (`.md`, note_lint.rs) or a workspace's `workspace.json` (ADR 0040) it wrote before saying it is done, with the app the person already has (no Node or Python needed). It runs
//! before any window opens, prints what it found and exits: 0 when the file opens in Oversay.
//!
//! The rules are the app's own project schema, written out by `make skills` from
//! src/lib/project/schema.ts (src-tauri/project.schema.json) and read here as it is, so this
//! applies the frontend's definition (ADR 0007) rather than a second one.

use serde_json::Value;

const SCHEMA: &str = include_str!("../project.schema.json");
const SCHEMA_VERSION: i64 = 1;
const MAX_PROBLEMS: usize = 8;

/// `/talks/0/segments/1/kind` → `talks[0].segments[1].kind`, as the app says it.
fn describe_path(pointer: &str) -> String {
    let mut out = String::new();
    for part in pointer.split('/').filter(|p| !p.is_empty()) {
        if part.chars().all(|c| c.is_ascii_digit()) {
            out.push_str(&format!("[{part}]"));
        } else {
            if !out.is_empty() {
                out.push('.');
            }
            out.push_str(part);
        }
    }
    if out.is_empty() {
        "the file".into()
    } else {
        out
    }
}

fn clock(seconds: i64) -> String {
    format!("{}:{:02}", seconds / 60, seconds % 60)
}

/// What a talk adds up to against its target.
fn talk_summary(talk: &Value) -> String {
    let name = talk["name"].as_str().unwrap_or("");
    let segments = talk["segments"]
        .as_array()
        .map(Vec::as_slice)
        .unwrap_or(&[]);
    let planned: i64 = segments
        .iter()
        .filter_map(|s| s["plannedSeconds"].as_i64())
        .sum();
    let open = segments.iter().filter(|s| s["openEnded"] == true).count();
    let mut line = format!(
        "“{name}”: {} segments, planned {}",
        segments.len(),
        clock(planned)
    );
    if let Some(target) = talk["targetSeconds"].as_i64() {
        let diff = planned - target;
        line.push_str(&format!(", target {}", clock(target)));
        line.push_str(&match diff {
            0 => " (on target)".to_string(),
            d if d > 0 => format!(" (over by {})", clock(d)),
            d => format!(" (under by {})", clock(-d)),
        });
    }
    if open > 0 {
        line.push_str(&format!("; {open} open-ended, counted at their estimate"));
    }
    line
}

/// Ok with a summary when Oversay opens the file, or the problems it would report.
pub fn check(text: &str) -> Result<String, Vec<String>> {
    let doc: Value = serde_json::from_str(text)
        .map_err(|e| vec![format!("This file is not valid JSON: {e}")])?;
    if !doc.is_object() {
        return Err(vec![
            "This is not an Oversay project file (expected a JSON object).".into(),
        ]);
    }
    match doc["schemaVersion"].as_i64() {
        None => {
            return Err(vec![
                "\"schemaVersion\" is missing or not a whole number.".into(),
            ]);
        }
        Some(v) if v > SCHEMA_VERSION => {
            return Err(vec![format!(
                "This file was made by a newer Oversay (format {v})."
            )]);
        }
        _ => {}
    }
    let schema: Value = serde_json::from_str(SCHEMA).expect("the bundled schema is JSON");
    let validator = jsonschema::validator_for(&schema).expect("the bundled schema compiles");
    let mut problems: Vec<String> = validator
        .iter_errors(&doc)
        .map(|e| format!("{} {}", describe_path(&e.instance_path().to_string()), e))
        .collect();
    let talks = doc["talks"].as_array().map(Vec::as_slice).unwrap_or(&[]);
    if doc["kind"] == "quickTalk" && talks.len() != 1 {
        problems.push(format!(
            "A quick talk holds exactly one talk; this has {}.",
            talks.len()
        ));
    }
    if !problems.is_empty() {
        let more = problems.len().saturating_sub(MAX_PROBLEMS);
        problems.truncate(MAX_PROBLEMS);
        if more > 0 {
            problems.push(format!("…and {more} more"));
        }
        return Err(problems);
    }
    Ok(talks
        .iter()
        .map(talk_summary)
        .collect::<Vec<_>>()
        .join("\n"))
}

/// Whether `path` is a deck: a Markdown file in a `Decks` folder, as the skill writes one,
/// or in a deck's folder there (ADR 0037).
fn is_deck(path: &str) -> bool {
    let decks = |p: Option<&std::path::Path>| {
        p.and_then(|p| p.file_name())
            .is_some_and(|name| name.to_string_lossy().eq_ignore_ascii_case("decks"))
    };
    let parent = std::path::Path::new(path).parent();
    decks(parent) || decks(parent.and_then(|p| p.parent()))
}

/// Prints what Oversay shows of a quick note or a deck, or what it would show differently; the exit code.
fn check_note(text: &str, deck: bool) -> i32 {
    let what = if deck { "deck" } else { "note" };
    let problems = crate::note_lint::lint(text, deck);
    if problems.is_empty() {
        println!(
            "OK: Oversay shows this {what}: {}.",
            crate::note_lint::summary(text, deck)
        );
        return 0;
    }
    println!("Oversay would show this {what} differently from how it reads:");
    for (line, _, message) in problems.iter().take(MAX_PROBLEMS) {
        match line {
            Some(n) => println!("• Line {n}: {message}"),
            None => println!("• {message}"),
        }
    }
    if problems.len() > MAX_PROBLEMS {
        println!("• …and {} more", problems.len() - MAX_PROBLEMS);
    }
    1
}

/// Prints whether Oversay reads a workspace's `workspace.json` as it was meant (ADR 0040);
/// the exit code.
fn check_workspace(text: &str) -> i32 {
    let problems = crate::workspaces::problems(text);
    if problems.is_empty() {
        let doc: Value = serde_json::from_str(text).unwrap_or_default();
        let decks = doc["decks"].as_array().map_or(0, Vec::len);
        println!(
            "OK: Oversay reads this workspace: “{}”, {decks} deck{}.",
            doc["name"].as_str().unwrap_or("").trim(),
            if decks == 1 { "" } else { "s" }
        );
        return 0;
    }
    println!("Oversay would read this workspace differently from how it was meant:");
    for p in problems.iter().take(MAX_PROBLEMS) {
        println!("• {p}");
    }
    if problems.len() > MAX_PROBLEMS {
        println!("• …and {} more", problems.len() - MAX_PROBLEMS);
    }
    1
}

/// Prints whether Oversay reads a session's review or transcript as it was meant (ADR 0041); the exit code.
fn check_session_file(kind: &str, path: &str, text: &str) -> i32 {
    let name = std::path::Path::new(path)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let problems = crate::session_check::problems(kind, &name, text);
    if problems.is_empty() {
        println!(
            "OK: Oversay shows this {kind}: {}.",
            crate::session_check::summary(kind, text)
        );
        return 0;
    }
    println!("Oversay would show this {kind} differently from how it was meant:");
    for p in problems.iter().take(MAX_PROBLEMS) {
        println!("• {p}");
    }
    if problems.len() > MAX_PROBLEMS {
        println!("• …and {} more", problems.len() - MAX_PROBLEMS);
    }
    1
}

/// Whether `path` is a workspace's file (ADR 0040).
fn is_workspace(path: &str) -> bool {
    std::path::Path::new(path)
        .file_name()
        .is_some_and(|n| n.to_string_lossy() == crate::workspaces::WORKSPACE_FILE)
}

/// Runs `--check <file>` when the app was started with it; the exit code, or None to start the app.
pub fn from_args() -> Option<i32> {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) != Some("--check") {
        return None;
    }
    crate::platform::attach_console();
    let Some(path) = args.get(2) else {
        eprintln!(
            "Usage: Oversay --check <note.md | Decks/deck.md | reviews/<session>.md | transcripts/<session>.md | workspace.json | file.oversay.json>"
        );
        return Some(2);
    };
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) => {
            eprintln!("Could not read {path}: {e}");
            return Some(2);
        }
    };
    // A session's review or transcript in a deck's folder (ADR 0041), before any other Markdown.
    if let Some(kind) = crate::session_check::kind_of(path) {
        return Some(check_session_file(kind, path, &text));
    }
    if path.to_lowercase().ends_with(".md") {
        return Some(check_note(&text, is_deck(path)));
    }
    if is_workspace(path) {
        return Some(check_workspace(&text));
    }
    Some(match check(&text) {
        Ok(summary) => {
            println!("OK: Oversay opens this file.\n{summary}");
            0
        }
        Err(problems) => {
            println!("Oversay can't open this file:");
            for p in problems {
                println!("• {p}");
            }
            1
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const EXAMPLE: &str = include_str!("../../../skills/fixtures/Friday demo.oversay.json");

    #[test]
    fn a_markdown_file_in_a_decks_folder_is_checked_as_a_deck() {
        assert!(is_deck("/Users/sam/Documents/Oversay/Decks/Stand-up.md"));
        assert!(is_deck(
            "/Users/sam/Documents/Oversay/Decks/Stand-up 2026-10-25/deck.md"
        ));
        assert!(is_deck("decks/Stand-up.md"));
        assert!(!is_deck(
            "/Users/sam/Documents/Oversay/Quick notes/Stand-up.md"
        ));
        assert!(!is_deck("Stand-up.md"));
    }

    #[test]
    fn a_workspaces_file_is_checked_as_one() {
        assert!(is_workspace(
            "/Users/sam/Documents/Oversay/Workspaces/AppSec/workspace.json"
        ));
        assert!(!is_workspace("/Users/sam/Friday demo.oversay.json"));
        assert_eq!(check_workspace(r#"{"name":"AppSec","decks":[]}"#), 0);
        assert_eq!(check_workspace(r#"{"name":"AppSec","decks":["panel"]}"#), 1);
    }

    #[test]
    fn the_skills_example_opens_and_adds_up() {
        let summary = check(EXAMPLE).unwrap();
        assert_eq!(
            summary,
            "“Friday demo”: 4 segments, planned 12:00, target 12:00 (on target); 1 open-ended, counted at their estimate"
        );
    }

    #[test]
    fn says_where_a_file_is_wrong_as_the_app_does() {
        let bad = EXAMPLE
            .replace("\"kind\": \"demo\"", "\"kind\": \"show\"")
            .replace("\"id\": \"s_welcome\"", "\"id\": \"welcome\"");
        let problems = check(&bad).unwrap_err();
        assert!(
            problems
                .iter()
                .any(|p| p.starts_with("talks[0].segments[2].kind")),
            "{problems:?}"
        );
        assert!(
            problems
                .iter()
                .any(|p| p.starts_with("talks[0].segments[0].id")),
            "{problems:?}"
        );
    }

    #[test]
    fn refuses_what_the_app_refuses() {
        assert!(check("not json").unwrap_err()[0].contains("not valid JSON"));
        assert!(check("[]").unwrap_err()[0].contains("not an Oversay project"));
        assert!(check("{\"schemaVersion\": 2}").unwrap_err()[0].contains("newer Oversay"));
        let two = EXAMPLE.replacen(
            "\"talks\": [",
            "\"talks\": [{\"id\": \"t_x\", \"name\": \"x\", \"segments\": [], \"sessions\": []},",
            1,
        );
        assert!(
            check(&two)
                .unwrap_err()
                .iter()
                .any(|p| p.contains("exactly one talk"))
        );
    }

    #[test]
    fn reports_a_talk_off_its_target() {
        let over = EXAMPLE.replace("\"targetSeconds\": 720", "\"targetSeconds\": 600");
        assert!(check(&over).unwrap().contains("(over by 2:00)"));
    }

    #[test]
    fn paths_read_as_the_app_writes_them() {
        assert_eq!(
            describe_path("/talks/0/segments/1/kind"),
            "talks[0].segments[1].kind"
        );
        assert_eq!(describe_path(""), "the file");
    }
}
