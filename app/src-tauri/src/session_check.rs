//! `Oversay --check` for a session's review and transcript (ADR 0041, ADR 0035): the AI skill writes
//! a review into a deck's `reviews/`, and a transcript into its `transcripts/` when it is given a
//! call's file, and checks each before saying it is done. The format is one definition for this,
//! the app and the skill's reference (src/lib/sessions/session-format.json, `make skills`).

use std::path::Path;

use serde_json::Value;

use crate::session_files::is_session_name;

const FORMAT: &str = include_str!("../../src/lib/sessions/session-format.json");

fn format() -> Value {
    serde_json::from_str(FORMAT).expect("session-format.json is JSON")
}

fn strings(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|a| {
            a.iter()
                .filter_map(|s| s.as_str().map(str::to_owned))
                .collect()
        })
        .unwrap_or_default()
}

/// A review or a transcript, by the folder it is in, when it is in a deck's folder.
pub fn kind_of(path: &str) -> Option<&'static str> {
    let p = Path::new(path);
    let is = |q: Option<&Path>, name: &str| {
        q.and_then(|q| q.file_name())
            .is_some_and(|n| n.to_string_lossy() == name)
    };
    let deck_folder = p.parent().and_then(|p| p.parent());
    let in_decks = is(deck_folder.and_then(|d| d.parent()), "Decks");
    if !in_decks || !path.ends_with(".md") {
        return None;
    }
    if is(p.parent(), "reviews") {
        Some("review")
    } else if is(p.parent(), "transcripts") {
        Some("transcript")
    } else {
        None
    }
}

/// A front matter's keys and values, in order.
type Front = Vec<(String, String)>;

/// The front matter's keys and values, and the lines after it, or None when there is none.
fn front(text: &str) -> Option<(Front, Vec<&str>)> {
    let mut lines = text.lines();
    if lines.next()?.trim_end() != "---" {
        return None;
    }
    let mut keys = Vec::new();
    for line in lines.by_ref() {
        if line.trim_end() == "---" {
            return Some((keys, lines.collect()));
        }
        if let Some((k, v)) = line.split_once(':') {
            keys.push((k.trim().to_string(), v.trim().to_string()));
        }
    }
    None
}

/// What Oversay would read differently in a session's review or transcript named `file_name`.
pub fn problems(kind: &str, file_name: &str, text: &str) -> Vec<String> {
    let spec = &format()[kind];
    let allowed = strings(&spec["keys"]);
    let mut found = Vec::new();
    let stem = file_name.strip_suffix(".md").unwrap_or(file_name);
    if !is_session_name(stem) {
        found.push(format!(
            "the file should be named by its session's start, YYYY-MM-DD HH-mm.md (\" -2\" for a second Start that minute), not {file_name}"
        ));
    }
    let Some((keys, body)) = front(text) else {
        found.push(format!(
            "it should start with front matter (---) holding {}",
            allowed.join(" and ")
        ));
        return found;
    };
    for want in &allowed {
        if !keys.iter().any(|(k, v)| k == want && !v.is_empty()) {
            found.push(format!("front matter needs `{want}`"));
        }
    }
    for (k, _) in &keys {
        if !allowed.contains(k) {
            found.push(format!(
                "Oversay doesn't use `{k}`; the keys are {}",
                allowed
                    .iter()
                    .map(|k| format!("`{k}`"))
                    .collect::<Vec<_>>()
                    .join(", ")
            ));
        }
    }
    if let Some((_, started)) = keys.iter().find(|(k, _)| k == "session")
        && chrono::DateTime::parse_from_rfc3339(started).is_err()
    {
        found.push(format!(
            "`session` should be the session's startedAt from sessions.json, not {started}"
        ));
    }
    let headings: Vec<&str> = body
        .iter()
        .filter_map(|l| l.strip_prefix("## "))
        .map(str::trim)
        .collect();
    if headings.is_empty() {
        found.push(if kind == "review" {
            "it has no `## ` sections".into()
        } else {
            "it has no `## ` card headings".into()
        });
    }
    if kind == "review" {
        let sections = strings(&spec["sections"]);
        for h in &headings {
            if !sections.iter().any(|s| s == h) {
                found.push(format!(
                    "`## {h}` isn't a review section; they are {}",
                    sections.join(", ")
                ));
            }
        }
        if let Some((_, by)) = keys.iter().find(|(k, _)| k == "made-with")
            && !by.starts_with("Oversay skill ")
        {
            found.push(format!(
                "`made-with` should be `Oversay skill <version>`, not {by}"
            ));
        }
    } else {
        // Under each card, its lines: `- 1:16 **Name:** what was said`.
        for (i, line) in body.iter().enumerate() {
            let t = line.trim();
            let timed = t
                .strip_prefix("- ")
                .and_then(|r| r.split_once(' '))
                .is_some_and(|(time, _)| {
                    let parts: Vec<_> = time.split(':').collect();
                    (2..=3).contains(&parts.len())
                        && parts
                            .iter()
                            .all(|p| !p.is_empty() && p.bytes().all(|b| b.is_ascii_digit()))
                });
            if t.starts_with("- ") && !timed {
                found.push(format!(
                    "line {} should start with its time from Start: `- 1:16 …`",
                    i + 1
                ));
            }
        }
    }
    found
}

/// A line saying what Oversay reads in it.
pub fn summary(kind: &str, text: &str) -> String {
    let body = front(text).map(|(_, b)| b).unwrap_or_default();
    let headings = body.iter().filter(|l| l.starts_with("## ")).count();
    let lines = body
        .iter()
        .filter(|l| l.trim_start().starts_with("- "))
        .count();
    if kind == "review" {
        format!("{headings} section{}", if headings == 1 { "" } else { "s" })
    } else {
        format!(
            "{headings} card{}, {lines} line{}",
            if headings == 1 { "" } else { "s" },
            if lines == 1 { "" } else { "s" }
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const REVIEW: &str = "---\nsession: 2026-10-28T09:00:04.120Z\nmade-with: Oversay skill 0.2.0\n---\n\n# Review\n\n## What ran over\n- Atlas\n\n## What to change in the deck\n- Shorter\n";

    #[test]
    fn knows_a_review_and_a_transcript_by_their_folder_in_a_deck() {
        assert_eq!(
            kind_of("/d/Oversay/Decks/Stand-up 2026-10-25/reviews/2026-10-28 09-00.md"),
            Some("review")
        );
        assert_eq!(
            kind_of("/d/Oversay/Decks/Stand-up 2026-10-25/transcripts/2026-10-28 09-00.md"),
            Some("transcript")
        );
        assert_eq!(
            kind_of("/d/Oversay/Decks/Stand-up 2026-10-25/deck.md"),
            None
        );
        assert_eq!(kind_of("/elsewhere/reviews/2026-10-28 09-00.md"), None);
    }

    #[test]
    fn a_review_has_its_session_its_skill_and_only_its_sections() {
        assert_eq!(
            problems("review", "2026-10-28 09-00.md", REVIEW),
            Vec::<String>::new()
        );
        assert_eq!(summary("review", REVIEW), "2 sections");
        let wrong = REVIEW
            .replace("## What ran over", "## Overruns")
            .replace("made-with: Oversay skill 0.2.0\n", "author: me\n");
        let found = problems("review", "notes.md", &wrong);
        assert!(
            found
                .iter()
                .any(|p| p.contains("named by its session's start")),
            "{found:?}"
        );
        assert!(
            found.iter().any(|p| p.contains("needs `made-with`")),
            "{found:?}"
        );
        assert!(
            found.iter().any(|p| p.contains("doesn't use `author`")),
            "{found:?}"
        );
        assert!(
            found
                .iter()
                .any(|p| p.contains("`## Overruns` isn't a review section")),
            "{found:?}"
        );
        assert!(!problems("review", "2026-10-28 09-00.md", "# No front matter\n").is_empty());
    }

    #[test]
    fn a_transcript_has_its_session_its_source_and_timed_lines() {
        let ok = "---\nsession: 2026-10-28T09:00:00.000Z\nsource: Zoom (a.vtt)\n---\n\n# Stand-up\n\n## Intro · 1:00 planned, 1:14 actual\n- 0:02 **John:** Morning.\n- 1:02:03 Later.\n";
        assert_eq!(
            problems("transcript", "2026-10-28 09-00 -2.md", ok),
            Vec::<String>::new()
        );
        assert_eq!(summary("transcript", ok), "1 card, 2 lines");
        let untimed = ok.replace("- 0:02 ", "- ");
        assert!(
            problems("transcript", "2026-10-28 09-00.md", &untimed)
                .iter()
                .any(|p| p.contains("start with its time"))
        );
        assert!(
            problems(
                "transcript",
                "2026-10-28 09-00.md",
                &ok.replace("2026-10-28T09:00:00.000Z", "yesterday")
            )
            .iter()
            .any(|p| p.contains("startedAt"))
        );
    }
}
