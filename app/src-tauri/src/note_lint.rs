//! `Oversay --check <note>.md` (#210): checks a quick note the Oversay skill wrote, as the skill
//! writes it, against the note format: where Oversay would show something other than what the
//! writer meant. The app's own definition is src/lib/notes/format.ts and lint.ts (ADR 0007); this
//! reads a note the same way, with the keys, kinds and messages `make skills` writes from that code
//! (references/note-rules.json), and skills/fixtures/note-lint.json is checked by both sides.

use regex::Regex;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::LazyLock;

const RULES: &str = include_str!("../../../skills/oversay/references/note-rules.json");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Rules {
    front_keys: Vec<String>,
    /// A deck's keys, and the values each of its options takes.
    deck_keys: Vec<String>,
    /// Keys decks no longer read (ADR 0042): kept as written, never flagged.
    retired_deck_keys: Vec<String>,
    deck_values: HashMap<String, Vec<String>>,
    made_with_key: String,
    segment_kinds: Vec<String>,
    messages: HashMap<String, String>,
}

static RULES_READ: LazyLock<Rules> =
    LazyLock::new(|| serde_json::from_str(RULES).expect("the bundled note rules are JSON"));

fn re(pattern: &str) -> Regex {
    Regex::new(pattern).expect("a valid pattern")
}

static HEADING: LazyLock<Regex> = LazyLock::new(|| re(r"^##[ \t]+(.*?)[ \t]*$"));
static TIMED: LazyLock<Regex> = LazyLock::new(|| re(r"^(.*?)[ \t]*\[([^\]]*)\]$"));
static ITEM: LazyLock<Regex> = LazyLock::new(|| re(r"^([ \t]*)([-*+]|\d+[.)])([ \t]+|$)(.*)$"));
static FENCE: LazyLock<Regex> = LazyLock::new(|| re(r"^[ \t]*(```|~~~)"));
static FRONT_FIELD: LazyLock<Regex> = LazyLock::new(|| re(r"^([A-Za-z][\w-]*):[ \t]*(.*?)[ \t]*$"));
static MADE_WITH_VALUE: LazyLock<Regex> = LazyLock::new(|| re(r"^Oversay skill (\d+\.\d+\.\d+)$"));
static ANY_HEADING: LazyLock<Regex> = LazyLock::new(|| re(r"^[ \t]*(#{1,6})([ \t]|$)"));

/// The file's lines, each with its ending, as format.ts splits them.
fn split_lines(text: &str) -> Vec<&str> {
    let mut lines = Vec::new();
    let bytes = text.as_bytes();
    let mut start = 0;
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\r' if bytes.get(i + 1) == Some(&b'\n') => {
                lines.push(&text[start..i + 2]);
                i += 2;
                start = i;
            }
            b'\r' | b'\n' => {
                lines.push(&text[start..=i]);
                i += 1;
                start = i;
            }
            _ => i += 1,
        }
    }
    if start < text.len() {
        lines.push(&text[start..]);
    }
    lines
}

fn body(line: &str) -> &str {
    line.trim_end_matches(['\r', '\n'])
}

fn indent_width(s: &str) -> usize {
    s.chars().map(|c| if c == '\t' { 4 } else { 1 }).sum()
}

/// duration.ts's parseDuration: whole seconds, or None.
fn parse_duration(text: &str) -> Option<u64> {
    let t = text.trim().to_lowercase();
    if !t.is_empty() && t.chars().all(|c| c.is_ascii_digit()) {
        return t.parse::<u64>().ok().map(|n| n * 60);
    }
    static CLOCK: LazyLock<Regex> = LazyLock::new(|| re(r"^(?:(\d+):)?(\d+):([0-5]\d)$"));
    static WORDS: LazyLock<Regex> = LazyLock::new(|| re(r"^(?:(\d+)\s*m)?\s*(?:(\d+)\s*s)?$"));
    let num = |m: Option<regex::Match>| m.map_or(Some(0), |m| m.as_str().parse::<u64>().ok());
    if let Some(c) = CLOCK.captures(&t) {
        return Some(num(c.get(1))? * 3600 + num(c.get(2))? * 60 + num(c.get(3))?);
    }
    if let Some(c) = WORDS.captures(&t)
        && (c.get(1).is_some() || c.get(2).is_some())
    {
        return Some(num(c.get(1))? * 60 + num(c.get(2))?);
    }
    None
}

/// format.ts's parseTopicTime: whether the brackets hold a time, a kind or both.
fn reads_topic_time(text: &str) -> bool {
    let mut time = false;
    let mut kind = false;
    for raw in text.split(',') {
        let part = raw.trim().to_lowercase();
        if !kind && RULES_READ.segment_kinds.contains(&part) {
            kind = true;
            continue;
        }
        if time {
            return false;
        }
        if part == "open" {
            time = true;
            continue;
        }
        let part = part
            .strip_prefix('~')
            .map_or(part.as_str(), str::trim_start);
        let part = match part.strip_suffix("min") {
            Some(p) => format!("{}m", p.trim_end()),
            None => part.to_string(),
        };
        match parse_duration(&part) {
            Some(s) if s > 0 => time = true,
            _ => return false,
        }
    }
    time || kind
}

/// format.ts's isKept: a line shown as written, never as a point.
fn is_kept(text: &str) -> bool {
    let t = text.trim_start_matches([' ', '\t']);
    if t.trim().is_empty() || t.starts_with(['>', '|', '<']) || ANY_HEADING.is_match(text) {
        return true;
    }
    // A rule: three or more of the same mark.
    let marks: Vec<char> = t.chars().filter(|c| *c != ' ' && *c != '\t').collect();
    marks.len() >= 3 && matches!(marks[0], '-' | '*' | '_') && marks.iter().all(|c| *c == marks[0])
}

enum Item {
    Kept(String),
    Point {
        depth: u8,
        indent: usize,
        lines: usize,
    },
}

struct Topic {
    heading: bool,
    name: String,
    timed: bool,
    items: Vec<Item>,
}

struct Note {
    front: Vec<String>,
    topics: Vec<Topic>,
}

impl Topic {
    fn points(&self) -> usize {
        self.items
            .iter()
            .filter(|i| matches!(i, Item::Point { .. }))
            .count()
    }
}

/// format.ts's parseNoteDoc, keeping only what the checks need.
fn parse(text: &str) -> Note {
    let lines = split_lines(text);
    let mut i = 0;
    let mut front = Vec::new();
    if lines.len() > 1
        && body(lines[0]) == "---"
        && let Some(end) = lines.iter().skip(1).position(|l| body(l) == "---")
    {
        front = lines[..end + 2].iter().map(|l| l.to_string()).collect();
        i = end + 2;
    }
    let mut topics = vec![Topic {
        heading: false,
        name: String::new(),
        timed: false,
        items: Vec::new(),
    }];
    let mut fenced = false;
    // Whether the last item is a point the next indented line may continue, and whether a point
    // the next sub-point can belong to is open.
    let mut last_point = false;
    let mut parent = false;
    for line in &lines[i..] {
        let text = body(line);
        let topic = topics.last_mut().expect("there is always a topic");
        if fenced || FENCE.is_match(text) {
            if FENCE.is_match(text) {
                fenced = !fenced;
            }
            topic.items.push(Item::Kept(text.to_string()));
            last_point = false;
            continue;
        }
        if let Some(h) = HEADING.captures(text) {
            let whole = h[1].to_string();
            let (name, timed) = match TIMED.captures(&whole) {
                Some(t) if reads_topic_time(&t[2]) => (t[1].to_string(), true),
                _ => (whole, false),
            };
            topics.push(Topic {
                heading: true,
                name,
                timed,
                items: Vec::new(),
            });
            last_point = false;
            parent = false;
            continue;
        }
        if is_kept(text) {
            topic.items.push(Item::Kept(text.to_string()));
            last_point = false;
            continue;
        }
        let item = ITEM.captures(text);
        if item.is_none() && last_point && {
            let lead = text.len() - text.trim_start_matches([' ', '\t']).len();
            lead >= 2 && text.len() > lead
        } {
            if let Some(Item::Point { lines, .. }) = topic.items.last_mut() {
                *lines += 1;
            }
            continue;
        }
        let indent = match &item {
            Some(c) => indent_width(&c[1]),
            None => indent_width(&text[..text.len() - text.trim_start_matches([' ', '\t']).len()]),
        };
        let depth = u8::from(item.is_some() && indent >= 2 && parent);
        topic.items.push(Item::Point {
            depth,
            indent,
            lines: 1,
        });
        last_point = true;
        if depth == 0 {
            parent = true;
        }
    }
    Note { front, topics }
}

/// A problem: its 1-based line (None for the whole note), its code and its message.
pub type Problem = (Option<usize>, &'static str, String);

fn message(code: &'static str, text: &str, deck: bool) -> String {
    let rules = &*RULES_READ;
    // A deck option's message lists what that option takes: its key is the text's first part.
    let values = match text.split_once(':') {
        Some((key, _)) if code == "deck-value" => {
            rules.deck_values.get(key).cloned().unwrap_or_default()
        }
        _ => vec![],
    };
    let list = |items: &[String]| {
        items
            .iter()
            .map(|k| format!("`{k}`"))
            .collect::<Vec<_>>()
            .join(", ")
    };
    let mut keys = if deck {
        rules.deck_keys.clone()
    } else {
        rules.front_keys.clone()
    };
    keys.push(rules.made_with_key.clone());
    rules.messages[code]
        .replacen("{text}", text, 1)
        .replacen("{keys}", &list(&keys), 1)
        .replacen("{kinds}", &list(&rules.segment_kinds), 1)
        .replacen("{values}", &list(&values), 1)
}

/// A deck option's values Oversay doesn't read (lint.ts's badDeckValues): the value, or for `hide`
/// each part it doesn't know.
fn bad_deck_values(key: &str, value: &str) -> Vec<String> {
    let Some(allowed) = RULES_READ.deck_values.get(key) else {
        return vec![];
    };
    if value.trim().is_empty() {
        return vec![];
    }
    let values: Vec<&str> = if key == "hide" {
        value
            .split(',')
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .collect()
    } else {
        vec![value.trim()]
    };
    values
        .into_iter()
        .filter(|v| !allowed.contains(&v.to_lowercase()))
        .map(str::to_string)
        .collect()
}

/// lint.ts's lintNote: a quick note, or with `deck` a deck.
pub fn lint(text: &str, deck: bool) -> Vec<Problem> {
    let note = parse(text);
    let rules = &*RULES_READ;
    let keys = if deck {
        &rules.deck_keys
    } else {
        &rules.front_keys
    };
    let mut problems: Vec<Problem> = Vec::new();
    let mut add = |line: Option<usize>, code: &'static str, text: &str| {
        problems.push((line, code, message(code, text, deck)))
    };

    let mut n = 1;
    if note.front.is_empty() && (text.starts_with("---\n") || text.starts_with("---\r")) {
        add(Some(1), "front-open", "");
    }
    if note.front.len() > 2 {
        for line in &note.front[1..note.front.len() - 1] {
            n += 1;
            let t = body(line);
            if t.trim().is_empty() {
                continue;
            }
            let Some(field) = FRONT_FIELD.captures(t) else {
                add(Some(n), "front-line", t.trim());
                continue;
            };
            let key = field[1].to_lowercase();
            let value = &field[2];
            if key == rules.made_with_key {
                if !MADE_WITH_VALUE.is_match(value) {
                    add(Some(n), "made-with", value);
                }
            } else if deck && rules.retired_deck_keys.contains(&key) {
                // Kept as written, never flagged.
            } else if !keys.contains(&key) {
                add(Some(n), "front-key", &field[1]);
            } else if !deck
                && key == "length"
                && !value.is_empty()
                && parse_duration(value).is_none()
            {
                add(Some(n), "front-length", value);
            } else if deck {
                for bad in bad_deck_values(&key, value) {
                    add(Some(n), "deck-value", &format!("{key}: {bad}"));
                }
            }
        }
    }
    if !note.front.is_empty() {
        n = note.front.len() + 1;
    }

    static BRACKET: LazyLock<Regex> = LazyLock::new(|| re(r"\[([^\]]*)\]$"));
    let mut fenced = false;
    for (t, topic) in note.topics.iter().enumerate() {
        if topic.heading {
            if topic.name.trim().is_empty() {
                add(Some(n), "topic-name", "");
            }
            if !topic.timed
                && let Some(b) = BRACKET.captures(&topic.name)
                && b[1].chars().any(|c| c.is_ascii_digit())
            {
                add(Some(n), "topic-time", &b[1]);
            }
            n += 1;
        }
        let mut sub_indent: Option<usize> = None;
        let mut before_topic = false;
        for item in &topic.items {
            match item {
                Item::Kept(line) => {
                    if FENCE.is_match(line) {
                        fenced = !fenced;
                    }
                    if !fenced
                        && let Some(h) = ANY_HEADING.captures(line)
                        && !(t == 0 && &h[1] == "#")
                    {
                        add(Some(n), "heading", line.trim());
                    }
                    n += 1;
                }
                Item::Point {
                    depth,
                    indent,
                    lines,
                } => {
                    if t == 0 && !before_topic {
                        add(Some(n), "before-topic", "");
                        before_topic = true;
                    }
                    match (depth, sub_indent) {
                        (0, _) => sub_indent = None,
                        (_, None) => sub_indent = Some(*indent),
                        (_, Some(s)) if *indent > s => add(Some(n), "deep-point", ""),
                        _ => {}
                    }
                    n += lines;
                }
            }
        }
    }
    if shown(&note).0 == 0 {
        add(None, "no-topics", "");
    }
    problems
}

/// (topics, points) Oversay shows: the lines before the first topic count only when they hold points.
fn shown(note: &Note) -> (usize, usize) {
    note.topics
        .iter()
        .enumerate()
        .filter(|(n, t)| *n > 0 || t.points() > 0)
        .fold((0, 0), |(topics, points), (_, t)| {
            (topics + 1, points + t.points())
        })
}

/// lint.ts's noteSummary: "3 topics, 7 points".
pub fn summary(text: &str, deck: bool) -> String {
    let (topics, points) = shown(&parse(text));
    let s = |n: usize| if n == 1 { "" } else { "s" };
    let word = if deck { "card" } else { "topic" };
    format!("{topics} {word}{}, {points} point{}", s(topics), s(points))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Deserialize)]
    struct Case {
        case: String,
        text: String,
        problems: Vec<(Option<usize>, String)>,
        summary: String,
        #[serde(default)]
        deck: bool,
    }

    #[test]
    fn agrees_with_the_app_on_every_shared_case() {
        let cases: Vec<Case> =
            serde_json::from_str(include_str!("../../../skills/fixtures/note-lint.json")).unwrap();
        for c in cases {
            let found: Vec<(Option<usize>, String)> = lint(&c.text, c.deck)
                .into_iter()
                .map(|(line, code, _)| (line, code.to_string()))
                .collect();
            assert_eq!(found, c.problems, "{}", c.case);
            assert_eq!(summary(&c.text, c.deck), c.summary, "{}", c.case);
        }
    }

    #[test]
    fn words_its_messages_as_the_app_does() {
        let found = lint("---\nattendees: x\n---\n## A\n- b\n", false);
        assert_eq!(
            found[0].2,
            "Oversay doesn’t use `attendees`. The keys are `with`, `when`, `length`, `made-with`."
        );
        let found = lint("## A [10 mins]\n- b\n", false);
        let found_deck = lint("---\ncolour: rainbow\n---\n## A [1m]\n- b\n", true);
        assert_eq!(
            found_deck[0].2,
            "`colour: rainbow` isn’t one Oversay reads, so it uses the default. Write one of `kinds`, `one`."
        );
        // `timeline` (ADR 0042), `deck-bar` and `record` are retired: never flagged.
        assert!(lint("---\ntimeline: sparkline\n---\n## A [1m]\n- b\n", true).is_empty());
        assert!(lint("---\ndeck-bar: middle\n---\n## A [1m]\n- b\n", true).is_empty());
        assert!(lint("---\nrecord: on\n---\n## A [1m]\n- b\n", true).is_empty());
        assert!(
            found[0]
                .2
                .contains("`intro`, `topic`, `demo`, `outro`, `break`")
        );
    }

    #[test]
    fn reads_lengths_as_the_app_does() {
        assert_eq!(parse_duration("30m"), Some(1800));
        assert_eq!(parse_duration("1:30:00"), Some(5400));
        assert_eq!(parse_duration("90s"), Some(90));
        assert_eq!(parse_duration("10"), Some(600));
        assert_eq!(parse_duration("half an hour"), None);
        assert!(reads_topic_time("~5 min"));
        assert!(reads_topic_time("5m, demo"));
        assert!(!reads_topic_time("5m, 6m"));
        assert!(!reads_topic_time("soon"));
    }

    #[test]
    fn the_skills_examples_are_clean() {
        for text in [
            include_str!(
                "../../../skills/oversay/examples/decks/Catch-up with Sam 2026-10-22/deck.md"
            ),
            include_str!(
                "../../../skills/oversay/examples/decks/Product demo dry run 2026-10-23/deck.md"
            ),
        ] {
            assert_eq!(lint(text, true), vec![]);
        }
        let deck = include_str!(
            "../../../skills/oversay/examples/decks/Stand-up 23 Oct 2026-10-23/deck.md"
        );
        assert_eq!(lint(deck, true), vec![]);
    }
}
