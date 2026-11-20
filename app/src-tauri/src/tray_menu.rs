//! The menu-bar (Mac) and tray (Windows) menu as data: Menu 1, the flat menu (ADR 0051, Control
//! Panel v2). Every mid-call choice is at the top level in five groups (what's running, the run,
//! the look, screen sharing, the app), with the opacity steps in one submenu. `tray.rs` builds the
//! native menu from it; this module only decides what the menu says, so it is tested without a window.
//!
//! Tauri's menu has no radio items, sliders or section headers (the design's Decide screen): the
//! ticks are check items the app keeps to one, and the greyed lines say what is running.

use std::collections::BTreeMap;

/// What is running, as the menu shows it; `None` where a `Run` is optional means nothing is.
/// A preview (the Look card's or the deck editor's) is not a run.
#[derive(Clone, Debug, PartialEq)]
pub enum Run {
    /// Shown, waiting for Start on its first card.
    Ready { deck: String, cards: usize },
    /// Started: on card `card` (0-based) of `cards`, called `title`.
    Running {
        deck: String,
        card: usize,
        cards: usize,
        title: String,
        paused: bool,
    },
}

/// The deck widget's look, as the menu ticks it.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Look {
    /// See-through opacity in percent, kept while solid.
    pub opacity: u8,
    pub solid: bool,
    pub light: bool,
    /// The deck widget shows its Agenda view rather than the Card view.
    pub agenda: bool,
}

impl Default for Look {
    /// The defaults in src/lib/settings/overlays.ts: see-through at 75%, dark.
    fn default() -> Self {
        Look {
            opacity: 75,
            solid: false,
            light: false,
            agenda: false,
        }
    }
}

impl Look {
    /// The look from the `overlay-settings` channel; missing or unusable values are the defaults.
    pub fn from_settings(value: &serde_json::Value) -> Look {
        let d = Look::default();
        Look {
            opacity: value
                .get("opacity")
                .and_then(serde_json::Value::as_f64)
                .map_or(d.opacity, |o| {
                    o.clamp(MIN_OPACITY as f64, 100.0).round() as u8
                }),
            solid: value
                .get("solid")
                .and_then(serde_json::Value::as_bool)
                .unwrap_or(d.solid),
            light: value.get("panel").and_then(serde_json::Value::as_str) == Some("light"),
            agenda: value.get("deckView").and_then(serde_json::Value::as_str) == Some("agenda"),
        }
    }
}

/// A pinned deck, for Show a deck ▸.
#[derive(Clone, Debug, PartialEq, serde::Deserialize)]
pub struct PinnedDeck {
    pub id: String,
    pub name: String,
}

/// Everything the menu shows.
#[derive(Clone, Debug, Default)]
pub struct MenuState {
    pub run: Option<Run>,
    pub look: Look,
    /// The deck widget is hidden from screen shares and recordings.
    pub hidden: bool,
    /// The Look card is open.
    pub panel_open: bool,
    pub pinned: Vec<PinnedDeck>,
    /// The registered keys, by hotkey action (`hotkeys::ACTIONS`): each item shows its own.
    pub keys: BTreeMap<String, String>,
}

/// One line of the menu.
#[derive(Clone, Debug, PartialEq)]
pub enum Entry {
    /// A greyed line saying what is running.
    Status(String),
    Item {
        id: String,
        label: String,
        key: Option<String>,
        enabled: bool,
    },
    /// A ticked or unticked item (a check item: Tauri has no radio items).
    Check {
        id: String,
        label: String,
        key: Option<String>,
        checked: bool,
        enabled: bool,
    },
    Submenu {
        label: String,
        entries: Vec<Entry>,
    },
    Separator,
}

/// The opacity steps in the Opacity ▸ submenu, most solid first.
pub const OPACITY_STEPS: [u8; 5] = [90, 75, 60, 50, 40];

/// The lowest opacity (`MIN_OVERLAY_OPACITY` in src/lib/settings/overlays.ts).
pub const MIN_OPACITY: u8 = 40;

/// What a menu item asks for, read from its id.
#[derive(Clone, Debug, PartialEq)]
pub enum Choice {
    /// A session action or one of the app's own (`hotkeys::ACTIONS`); Start is `next`.
    Action(&'static str),
    Opacity(u8),
    SeeThrough,
    Solid,
    Panel {
        light: bool,
    },
    /// The deck widget's Card view or Agenda view.
    DeckView {
        agenda: bool,
    },
    ToggleHidden,
    ShowDeck(String),
    Library,
    Settings,
    Quit,
}

/// The id of a pinned deck's item.
fn deck_id(id: &str) -> String {
    format!("deck:{id}")
}

/// The choice an item's id stands for, or None for an id this menu never makes.
pub fn choice(id: &str) -> Option<Choice> {
    if let Some(deck) = id.strip_prefix("deck:") {
        return (!deck.is_empty()).then(|| Choice::ShowDeck(deck.to_string()));
    }
    if let Some(step) = id.strip_prefix("op") {
        return step
            .parse()
            .ok()
            .filter(|p| OPACITY_STEPS.contains(p))
            .map(Choice::Opacity);
    }
    Some(match id {
        "start" | "next" => Choice::Action("next"),
        "previous" => Choice::Action("previous"),
        "pause" => Choice::Action("pause"),
        "end" => Choice::Action("end"),
        "darker" => Choice::Action("darker"),
        "lighter" => Choice::Action("lighter"),
        "panel" => Choice::Action("panel"),
        "show" => Choice::Action("show"),
        "seethrough" => Choice::SeeThrough,
        "solid" => Choice::Solid,
        "dark" => Choice::Panel { light: false },
        "light" => Choice::Panel { light: true },
        "card" => Choice::DeckView { agenda: false },
        "agenda" => Choice::DeckView { agenda: true },
        "hide" => Choice::ToggleHidden,
        "library" => Choice::Library,
        "settings" => Choice::Settings,
        "quit" => Choice::Quit,
        _ => return None,
    })
}

/// The menu for `state`, top to bottom.
pub fn menu(state: &MenuState) -> Vec<Entry> {
    let mut m = status(state.run.as_ref());
    m.push(Entry::Separator);
    m.extend(run_items(state));
    m.push(Entry::Separator);
    m.extend(look_items(state));
    m.push(Entry::Separator);
    // No on/off for the deck widget: it is the only overlay, so it always shows (John, 19 Nov).
    m.push(check(
        state,
        "hide",
        "Hide from screen sharing",
        None,
        state.hidden,
        true,
    ));
    m.push(Entry::Separator);
    m.push(check(
        state,
        "panel",
        "Look panel",
        Some("panel"),
        state.panel_open,
        true,
    ));
    m.push(item(state, "show", "Open Oversay", Some("show"), true));
    m.push(item(state, "settings", "Settings…", None, true));
    m.push(Entry::Separator);
    m.push(item(state, "quit", "Quit Oversay", None, true));
    m
}

/// The key registered for `action`, if any: one another app has taken is shown without one.
fn key(state: &MenuState, action: Option<&str>) -> Option<String> {
    action.and_then(|a| state.keys.get(a).cloned())
}

fn item(state: &MenuState, id: &str, label: &str, action: Option<&str>, enabled: bool) -> Entry {
    Entry::Item {
        id: id.to_string(),
        label: label.to_string(),
        key: key(state, action),
        enabled,
    }
}

fn check(
    state: &MenuState,
    id: &str,
    label: &str,
    action: Option<&str>,
    checked: bool,
    enabled: bool,
) -> Entry {
    Entry::Check {
        id: id.to_string(),
        label: label.to_string(),
        key: key(state, action),
        checked,
        enabled,
    }
}

/// The greyed lines at the top: the deck and where it is, or that nothing runs.
fn status(run: Option<&Run>) -> Vec<Entry> {
    match run {
        None => vec![Entry::Status("No deck running".into())],
        Some(Run::Ready { deck, .. }) => vec![
            Entry::Status(deck.clone()),
            Entry::Status("Ready · press Start".into()),
        ],
        Some(Run::Running {
            deck,
            card,
            cards,
            title,
            paused,
        }) => vec![
            Entry::Status(deck.clone()),
            Entry::Status(format!(
                "Card {} of {cards} · {title}{}",
                card + 1,
                if *paused { " · paused" } else { "" }
            )),
        ],
    }
}

/// The run's buttons, or Show a deck ▸ with nothing running.
fn run_items(state: &MenuState) -> Vec<Entry> {
    match &state.run {
        None => {
            let mut decks = vec![];
            if !state.pinned.is_empty() {
                decks.push(Entry::Status("Pinned".into()));
                for d in &state.pinned {
                    decks.push(item(state, &deck_id(&d.id), &d.name, None, true));
                }
                decks.push(Entry::Separator);
            }
            decks.push(item(state, "library", "Open Library…", None, true));
            vec![Entry::Submenu {
                label: "Show a deck".into(),
                entries: decks,
            }]
        }
        Some(Run::Ready { .. }) => vec![
            item(state, "start", "Start", Some("next"), true),
            item(state, "next", "Next", Some("next"), false),
            item(state, "previous", "Previous", Some("previous"), false),
            // Stops at once: picking it in a menu is already deliberate (the design's Decide screen).
            item(state, "end", "Stop deck", Some("end"), true),
        ],
        Some(Run::Running { card, paused, .. }) => vec![
            item(
                state,
                "pause",
                if *paused { "Resume" } else { "Pause" },
                Some("pause"),
                true,
            ),
            item(state, "next", "Next", Some("next"), true),
            item(state, "previous", "Previous", Some("previous"), *card > 0),
            item(state, "end", "Stop deck", Some("end"), true),
        ],
    }
}

/// See-through / Solid, the Opacity ▸ steps, and Dark / Light.
fn look_items(state: &MenuState) -> Vec<Entry> {
    let look = state.look;
    let see_through = if look.solid {
        "See-through".to_string()
    } else {
        format!("See-through · {}%", look.opacity)
    };
    let mut steps: Vec<Entry> = OPACITY_STEPS
        .iter()
        .map(|p| {
            let on = !look.solid && look.opacity == *p;
            check(state, &format!("op{p}"), &format!("{p}%"), None, on, true)
        })
        .collect();
    steps.push(Entry::Separator);
    steps.push(item(
        state,
        "darker",
        "More solid",
        Some("darker"),
        !look.solid && look.opacity < 100,
    ));
    steps.push(item(
        state,
        "lighter",
        "More see-through",
        Some("lighter"),
        !look.solid && look.opacity > MIN_OPACITY,
    ));
    vec![
        check(state, "seethrough", &see_through, None, !look.solid, true),
        check(state, "solid", "Solid", None, look.solid, true),
        Entry::Submenu {
            label: "Opacity".into(),
            entries: steps,
        },
        Entry::Separator,
        check(state, "dark", "Dark panel", None, !look.light, true),
        check(state, "light", "Light panel", None, look.light, true),
        check(state, "card", "Card view", None, !look.agenda, true),
        check(state, "agenda", "Agenda view", None, look.agenda, true),
    ]
}

/// What the icon carries besides its glyph.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Marks {
    /// A dot while a deck runs: Windows only, which has no text beside a tray icon.
    pub running: bool,
    /// An amber dot while the deck widget is visible in screen shares, on both.
    pub shared: bool,
}

/// The icon's marks for this run and sharing setting.
pub fn marks(run: Option<&Run>, hidden: bool, windows: bool) -> Marks {
    Marks {
        running: windows && deck_of(run).is_some(),
        shared: !hidden,
    }
}

/// The running deck's name; None with nothing running.
fn deck_of(run: Option<&Run>) -> Option<&str> {
    match run {
        Some(Run::Ready { deck, .. } | Run::Running { deck, .. }) => Some(deck),
        None => None,
    }
}

/// The icon's tooltip: on Windows it carries the time the Mac shows beside the icon (`title`,
/// from `trayTitle` in src/lib/session/tray.ts: Ready, Paused, 1:42, +0:23 or 1:42 ↑).
pub fn tooltip(run: Option<&Run>, title: &str, hidden: bool) -> String {
    let Some(deck) = deck_of(run) else {
        return "Oversay".into();
    };
    let time = if let Some(over) = title.strip_prefix('+') {
        format!("{over} over")
    } else if let Some(so_far) = title.strip_suffix(" ↑") {
        format!("{so_far} so far")
    } else if title.starts_with(|c: char| c.is_ascii_digit()) {
        format!("{title} left")
    } else {
        title.to_string()
    };
    let mut tip = format!("Oversay · {deck}");
    if !time.is_empty() {
        tip.push_str(&format!(" · {time}"));
    }
    if !hidden {
        tip.push_str(" · visible in screen shares");
    }
    tip
}

#[cfg(test)]
mod tests {
    use super::*;

    fn keys() -> BTreeMap<String, String> {
        [
            ("next", "Control+Alt+ArrowRight"),
            ("previous", "Control+Alt+ArrowLeft"),
            ("pause", "Control+Alt+Space"),
            ("end", "Control+Alt+KeyE"),
            ("show", "Control+Alt+KeyO"),
            ("darker", "Control+Alt+ArrowUp"),
            ("lighter", "Control+Alt+ArrowDown"),
            ("panel", "Control+Alt+KeyP"),
        ]
        .into_iter()
        .map(|(a, k)| (a.to_string(), k.to_string()))
        .collect()
    }

    fn running(card: usize, paused: bool) -> Run {
        Run::Running {
            deck: "Why bees matter".into(),
            card,
            cards: 6,
            title: "Pollination".into(),
            paused,
        }
    }

    fn state(run: Option<Run>) -> MenuState {
        MenuState {
            run,
            look: Look::default(),
            hidden: true,
            panel_open: false,
            pinned: vec![
                PinnedDeck {
                    id: "d_1".into(),
                    name: "Why bees matter".into(),
                },
                PinnedDeck {
                    id: "d_2".into(),
                    name: "Stand-up · Monday".into(),
                },
            ],
            keys: keys(),
        }
    }

    /// The menu as lines of text, the way the design page lists it: `---` a separator, `( )` a
    /// greyed line, `[x]` / `[ ]` a tick, `▸` a submenu, `⌁` a disabled item, then `  ⟨key⟩`.
    fn text(entries: &[Entry]) -> Vec<String> {
        entries
            .iter()
            .map(|e| match e {
                Entry::Separator => "---".to_string(),
                Entry::Status(s) => format!("({s})"),
                Entry::Item {
                    label,
                    key,
                    enabled,
                    ..
                } => format!(
                    "{}{label}{}",
                    if *enabled { "" } else { "⌁" },
                    key.as_ref().map_or(String::new(), |k| format!("  ⟨{k}⟩"))
                ),
                Entry::Check {
                    label,
                    key,
                    checked,
                    enabled,
                    ..
                } => format!(
                    "{}{}{label}{}",
                    if *checked { "[x] " } else { "[ ] " },
                    if *enabled { "" } else { "⌁" },
                    key.as_ref().map_or(String::new(), |k| format!("  ⟨{k}⟩"))
                ),
                Entry::Submenu { label, .. } => format!("{label} ▸"),
            })
            .collect()
    }

    fn submenu<'a>(entries: &'a [Entry], name: &str) -> &'a [Entry] {
        entries
            .iter()
            .find_map(|e| match e {
                Entry::Submenu { label, entries } if label == name => Some(entries.as_slice()),
                _ => None,
            })
            .unwrap_or_else(|| panic!("no submenu {name}"))
    }

    #[test]
    fn running_it_lists_five_groups_in_the_designs_order_and_words() {
        let m = menu(&state(Some(running(1, false))));
        assert_eq!(
            text(&m),
            [
                "(Why bees matter)",
                "(Card 2 of 6 · Pollination)",
                "---",
                "Pause  ⟨Control+Alt+Space⟩",
                "Next  ⟨Control+Alt+ArrowRight⟩",
                "Previous  ⟨Control+Alt+ArrowLeft⟩",
                "Stop deck  ⟨Control+Alt+KeyE⟩",
                "---",
                "[x] See-through · 75%",
                "[ ] Solid",
                "Opacity ▸",
                "---",
                "[x] Dark panel",
                "[ ] Light panel",
                "[x] Card view",
                "[ ] Agenda view",
                "---",
                "[x] Hide from screen sharing",
                "---",
                "[ ] Look panel  ⟨Control+Alt+KeyP⟩",
                "Open Oversay  ⟨Control+Alt+KeyO⟩",
                "Settings…",
                "---",
                "Quit Oversay",
            ]
        );
    }

    #[test]
    fn the_opacity_submenu_ticks_the_step_and_steps_by_key() {
        let m = menu(&state(Some(running(1, false))));
        assert_eq!(
            text(submenu(&m, "Opacity")),
            [
                "[ ] 90%",
                "[x] 75%",
                "[ ] 60%",
                "[ ] 50%",
                "[ ] 40%",
                "---",
                "More solid  ⟨Control+Alt+ArrowUp⟩",
                "More see-through  ⟨Control+Alt+ArrowDown⟩",
            ]
        );
        // Between steps nothing is ticked; at the ends the step that can't go further is greyed.
        let mut s = state(None);
        s.look.opacity = 40;
        let low = menu(&s);
        let sub = text(submenu(&low, "Opacity"));
        assert_eq!(sub[4], "[x] 40%");
        assert_eq!(sub[7], "⌁More see-through  ⟨Control+Alt+ArrowDown⟩");
        s.look.opacity = 63;
        let between = menu(&s);
        assert!(
            text(submenu(&between, "Opacity"))
                .iter()
                .take(5)
                .all(|l| l.starts_with("[ ]"))
        );
        s.look.opacity = 100;
        let top = menu(&s);
        assert_eq!(
            text(submenu(&top, "Opacity"))[6],
            "⌁More solid  ⟨Control+Alt+ArrowUp⟩"
        );
    }

    #[test]
    fn solid_ticks_solid_and_greys_the_steps_keys() {
        let mut s = state(Some(running(1, false)));
        s.look = Look {
            opacity: 60,
            solid: true,
            light: true,
            agenda: true,
        };
        let m = menu(&s);
        let t = text(&m);
        assert!(t.contains(&"[ ] See-through".to_string()));
        assert!(t.contains(&"[x] Solid".to_string()));
        assert!(t.contains(&"[ ] Dark panel".to_string()));
        assert!(t.contains(&"[x] Light panel".to_string()));
        assert!(t.contains(&"[ ] Card view".to_string()));
        assert!(t.contains(&"[x] Agenda view".to_string()));
        let sub = text(submenu(&m, "Opacity"));
        assert!(sub.iter().take(5).all(|l| l.starts_with("[ ]")), "{sub:?}");
        assert!(
            sub[6].starts_with('⌁') && sub[7].starts_with('⌁'),
            "{sub:?}"
        );
    }

    #[test]
    fn ready_offers_start_and_greys_next_and_previous() {
        let m = menu(&state(Some(Run::Ready {
            deck: "Why bees matter".into(),
            cards: 6,
        })));
        assert_eq!(
            text(&m)[..7],
            [
                "(Why bees matter)",
                "(Ready · press Start)",
                "---",
                "Start  ⟨Control+Alt+ArrowRight⟩",
                "⌁Next  ⟨Control+Alt+ArrowRight⟩",
                "⌁Previous  ⟨Control+Alt+ArrowLeft⟩",
                "Stop deck  ⟨Control+Alt+KeyE⟩",
            ]
        );
    }

    #[test]
    fn paused_says_so_and_offers_resume_and_the_first_card_has_no_previous() {
        let t = text(&menu(&state(Some(running(0, true)))));
        assert_eq!(t[1], "(Card 1 of 6 · Pollination · paused)");
        assert_eq!(t[3], "Resume  ⟨Control+Alt+Space⟩");
        assert_eq!(t[5], "⌁Previous  ⟨Control+Alt+ArrowLeft⟩");
    }

    #[test]
    fn idle_offers_the_pinned_decks_and_the_library() {
        let m = menu(&state(None));
        let t = text(&m);
        assert_eq!(t[..4], ["(No deck running)", "---", "Show a deck ▸", "---"]);
        assert_eq!(
            text(submenu(&m, "Show a deck")),
            [
                "(Pinned)",
                "Why bees matter",
                "Stand-up · Monday",
                "---",
                "Open Library…"
            ]
        );
        // No pinned deck: the library alone.
        let mut none = state(None);
        none.pinned.clear();
        assert_eq!(
            text(submenu(&menu(&none), "Show a deck")),
            ["Open Library…"]
        );
    }

    #[test]
    fn an_item_shows_only_a_registered_key() {
        // With nothing running only the Look card's key is registered (ADR 0028).
        let mut s = state(None);
        s.keys = BTreeMap::from([("panel".to_string(), "Control+Alt+KeyP".to_string())]);
        let t = text(&menu(&s));
        assert!(t.contains(&"[ ] Look panel  ⟨Control+Alt+KeyP⟩".to_string()));
        assert!(t.contains(&"Open Oversay".to_string()));
    }

    #[test]
    fn the_look_panel_and_sharing_are_ticked_as_they_are() {
        let mut s = state(None);
        s.panel_open = true;
        s.hidden = false;
        let t = text(&menu(&s));
        assert!(t.contains(&"[x] Look panel  ⟨Control+Alt+KeyP⟩".to_string()));
        assert!(t.contains(&"[ ] Hide from screen sharing".to_string()));
    }

    #[test]
    fn nothing_from_the_timeline_and_no_on_off_for_the_widget() {
        for run in [None, Some(running(2, false))] {
            let all = format!("{:?}", menu(&state(run)));
            for gone in [
                "Timeline",
                "style",
                "Waveform",
                "Edge strip",
                "Show deck widget",
                "On screen",
            ] {
                assert!(!all.contains(gone), "{gone} in {all}");
            }
        }
    }

    #[test]
    fn every_item_id_reads_back_as_its_choice() {
        let mut ids = vec![];
        fn collect(entries: &[Entry], ids: &mut Vec<String>) {
            for e in entries {
                match e {
                    Entry::Item { id, .. } | Entry::Check { id, .. } => ids.push(id.clone()),
                    Entry::Submenu { entries, .. } => collect(entries, ids),
                    _ => {}
                }
            }
        }
        for run in [
            None,
            Some(running(2, false)),
            Some(Run::Ready {
                deck: "D".into(),
                cards: 2,
            }),
        ] {
            collect(&menu(&state(run)), &mut ids);
        }
        for id in &ids {
            assert!(choice(id).is_some(), "{id}");
        }
        assert_eq!(choice("start"), Some(Choice::Action("next")));
        assert_eq!(choice("next"), Some(Choice::Action("next")));
        assert_eq!(choice("end"), Some(Choice::Action("end")));
        assert_eq!(choice("panel"), Some(Choice::Action("panel")));
        assert_eq!(choice("op60"), Some(Choice::Opacity(60)));
        assert_eq!(choice("op61"), None);
        assert_eq!(choice("light"), Some(Choice::Panel { light: true }));
        assert_eq!(choice("hide"), Some(Choice::ToggleHidden));
        assert_eq!(choice("agenda"), Some(Choice::DeckView { agenda: true }));
        assert_eq!(choice("card"), Some(Choice::DeckView { agenda: false }));
        assert_eq!(choice("deck:d_2"), Some(Choice::ShowDeck("d_2".into())));
        assert_eq!(choice("deck:"), None);
        assert_eq!(choice("quit"), Some(Choice::Quit));
        assert_eq!(choice("style"), None);
    }

    #[test]
    fn the_look_is_read_from_the_overlay_settings() {
        let v = serde_json::json!({ "opacity": 60, "solid": true, "panel": "light", "deckView": "agenda", "timelineStyle": "strip" });
        assert_eq!(
            Look::from_settings(&v),
            Look {
                opacity: 60,
                solid: true,
                light: true,
                agenda: true
            }
        );
        assert_eq!(
            Look::from_settings(&serde_json::Value::Null),
            Look::default()
        );
        assert_eq!(
            Look::from_settings(&serde_json::json!({ "opacity": 10 })).opacity,
            40
        );
    }

    #[test]
    fn the_icon_has_a_run_dot_on_windows_and_a_shared_dot_on_both() {
        let run = running(1, false);
        assert_eq!(
            marks(Some(&run), true, true),
            Marks {
                running: true,
                shared: false
            }
        );
        assert_eq!(
            marks(Some(&run), true, false),
            Marks {
                running: false,
                shared: false
            }
        );
        assert_eq!(
            marks(Some(&run), false, false),
            Marks {
                running: false,
                shared: true
            }
        );
        assert_eq!(
            marks(None, false, true),
            Marks {
                running: false,
                shared: true
            }
        );
        let ready = Run::Ready {
            deck: "D".into(),
            cards: 2,
        };
        assert!(marks(Some(&ready), true, true).running);
    }

    #[test]
    fn the_tooltip_carries_the_deck_and_its_time() {
        let run = running(1, false);
        assert_eq!(
            tooltip(Some(&run), "1:42", true),
            "Oversay · Why bees matter · 1:42 left"
        );
        assert_eq!(
            tooltip(Some(&run), "+0:23", true),
            "Oversay · Why bees matter · 0:23 over"
        );
        assert_eq!(
            tooltip(Some(&run), "1:42 ↑", true),
            "Oversay · Why bees matter · 1:42 so far"
        );
        assert_eq!(
            tooltip(Some(&run), "Paused", true),
            "Oversay · Why bees matter · Paused"
        );
        assert_eq!(
            tooltip(Some(&run), "1:42", false),
            "Oversay · Why bees matter · 1:42 left · visible in screen shares"
        );
        let ready = Run::Ready {
            deck: "D".into(),
            cards: 2,
        };
        assert_eq!(tooltip(Some(&ready), "Ready", true), "Oversay · D · Ready");
        // Before the first second's title, the deck alone.
        assert_eq!(tooltip(Some(&run), "", true), "Oversay · Why bees matter");
        assert_eq!(tooltip(None, "", true), "Oversay");
    }
}
