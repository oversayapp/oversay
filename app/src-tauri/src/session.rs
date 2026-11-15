//! The session engine (spec §5, 006): runs a talk live. It lives in the Rust core so that
//! closing or reloading a window never disturbs a session (ADR 0005), and broadcasts the whole
//! session on the `session` channel. Windows work out elapsed times and the projected end from
//! the timestamped event log (src/lib/session/clock.ts), so nothing here ticks.
//!
//! ready ──next──▶ running(0) ──next──▶ running(1) … ──next on last──▶ finished
//! previous goes back one segment (never before the first); end finishes from anywhere.
//! Pause stops the clock while running; Next and Previous resume first. An open-ended segment
//! needs nothing here: the windows count it up (clock.ts `planPaused`).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

use crate::state::StateHub;

/// The channel windows read the session from (`session` in src/lib/session/store.ts).
pub const CHANNEL: &str = "session";

/// One segment as planned when the session opened; the snapshot a recorded session keeps.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedSegment {
    pub segment_id: String,
    pub name: String,
    pub planned_seconds: u32,
    pub open_ended: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum EventType {
    Start,
    Next,
    Previous,
    Pause,
    Resume,
    End,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct SessionEvent {
    /// ISO 8601 UTC, to the millisecond.
    pub at: String,
    #[serde(rename = "type")]
    pub kind: EventType,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    /// Open, waiting for the first Next to start the clock.
    Ready,
    Running,
    Finished,
}

/// The session as broadcast to every window.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Session {
    pub status: Status,
    /// The current segment while running; 0 before the start.
    pub index: usize,
    /// Running but stopped for an interruption: no time counts until Resume (006/05).
    pub paused: bool,
    pub plan: Vec<PlannedSegment>,
    pub events: Vec<SessionEvent>,
    /// The talk being presented, as the frontend sent it (ADR 0007: the frontend owns its
    /// format). Overlays can't see the manager's project, so they read the talk from here.
    pub talk: Value,
    /// The hotkeys for this session, action → accelerator (hotkeys.rs).
    pub shortcuts: BTreeMap<String, String>,
    /// Actions whose hotkey couldn't be registered (another app or the system has it).
    pub unavailable: Vec<String>,
    /// A quick note shown on screen (ADR 0026), not a talk: it starts at once, Next
    /// stops at the last topic, closing its overlay ends it, and nothing is recorded.
    pub note: bool,
    /// A deck of flashcards on the flashcard widget (ADR 0036). It opens Ready, like a
    /// talk, and Pause/Resume (Space) starts it too; Next stops at the last card, which Stop (End)
    /// ends; closing its widget ends it. Not recorded into a project.
    pub deck: bool,
    /// A sample talk on screen while the control panel is open with nothing running, so the look
    /// can be set (ADR 0028). It starts at once, has no hotkeys or menu of its own, is never
    /// recorded, and a real session or a note replaces it. With `deck` too it is the deck editor's
    /// preview of a deck on screen: the same, but its own, and it follows the editor
    /// (`preview_deck`) rather than the panel.
    pub preview: bool,
}

impl Session {
    pub fn new(plan: Vec<PlannedSegment>, talk: Value) -> Self {
        Session {
            status: Status::Ready,
            index: 0,
            paused: false,
            plan,
            events: vec![],
            talk,
            shortcuts: BTreeMap::new(),
            unavailable: vec![],
            note: false,
            deck: false,
            preview: false,
        }
    }

    fn log(&mut self, kind: EventType, at: &str) {
        self.events.push(SessionEvent {
            at: at.to_string(),
            kind,
        });
    }

    /// Starts the clock, or moves to the next segment; on the last segment, finishes.
    /// Returns whether anything changed.
    pub fn next(&mut self, at: &str) -> bool {
        self.resume_to_move_on(at);
        match self.status {
            Status::Ready if !self.plan.is_empty() => {
                self.status = Status::Running;
                self.log(EventType::Start, at);
            }
            Status::Running if self.index + 1 < self.plan.len() => {
                self.index += 1;
                self.log(EventType::Next, at);
            }
            // A note, a deck or a preview stays on its last part until it is closed or stopped.
            Status::Running if self.note || self.deck || self.preview => return false,
            // Next on the last segment ends the talk; the log records it as the end.
            Status::Running => self.finish(at),
            _ => return false,
        }
        true
    }

    /// A deck's card has run its time (Auto-advance, ADR 0036): the next card, but only if the deck
    /// is still running unpaused on card `from`. Every window that sees the card's time up may ask,
    /// and a late or second ask finds the card already moved on and changes nothing.
    pub fn advance(&mut self, from: usize, at: &str) -> bool {
        if !self.deck || self.status != Status::Running || self.paused || self.index != from {
            return false;
        }
        self.next(at)
    }

    /// The deck editor's preview shows the deck as it is now, on card `index`. Only a deck preview
    /// changes: anything else is left alone.
    pub fn preview_deck(&mut self, plan: Vec<PlannedSegment>, talk: Value, index: usize) -> bool {
        if !self.preview || !self.deck || self.status != Status::Running || plan.is_empty() {
            return false;
        }
        self.index = index.min(plan.len() - 1);
        self.plan = plan;
        self.talk = talk;
        true
    }

    /// Goes back to the previous segment (after an accidental Next). Logged, not erased.
    pub fn previous(&mut self, at: &str) -> bool {
        if self.status != Status::Running || self.index == 0 {
            return false;
        }
        self.resume_to_move_on(at);
        self.index -= 1;
        self.log(EventType::Previous, at);
        true
    }

    /// Finishes the session from any state. Before the start there is nothing to log.
    pub fn end(&mut self, at: &str) -> bool {
        match self.status {
            Status::Finished => false,
            Status::Ready => {
                self.status = Status::Finished;
                true
            }
            Status::Running => {
                self.finish(at);
                true
            }
        }
    }

    /// Pauses a running session (an interruption: the clock stops) or resumes a paused one.
    pub fn toggle_pause(&mut self, at: &str) -> bool {
        // A deck starts with Start or Space, the same key as Pause.
        if self.deck && self.status == Status::Ready {
            return self.next(at);
        }
        if self.status != Status::Running {
            return false;
        }
        self.paused = !self.paused;
        self.log(
            if self.paused {
                EventType::Pause
            } else {
                EventType::Resume
            },
            at,
        );
        true
    }

    /// Moving to another segment means presenting again: a paused session resumes first.
    fn resume_to_move_on(&mut self, at: &str) {
        if self.status == Status::Running && self.paused {
            self.paused = false;
            self.log(EventType::Resume, at);
        }
    }

    fn finish(&mut self, at: &str) {
        self.status = Status::Finished;
        self.paused = false;
        self.log(EventType::End, at);
    }
}

/// The open session, if any. Changes go through `apply` so each is broadcast in order.
#[derive(Default)]
pub struct Engine {
    session: Mutex<Option<Session>>,
    /// Held while a session's hotkeys, icon and overlays are set up or taken down, so opening a
    /// session straight after closing one can't have its setup undone by the old one's cleanup.
    windows: Mutex<()>,
}

fn now() -> String {
    chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string()
}

/// Whether an open session has registered keys of its own: any but the panel's preview, which
/// keeps the idle key and menu.
pub fn holds_keys(app: &AppHandle) -> bool {
    app.state::<Engine>()
        .session
        .lock()
        .unwrap()
        .as_ref()
        .is_some_and(|s| s.status != Status::Finished && !s.preview)
}

/// Over: no session, or a finished one. Hotkeys and overlays belong to a session that isn't.
fn is_over(session: &Option<Session>) -> bool {
    session
        .as_ref()
        .is_none_or(|s| s.status == Status::Finished)
}

impl Engine {
    /// Runs `change` on the open session and, if it changed anything (`Ok(true)`), broadcasts
    /// the result. The lock is held while broadcasting, so windows get updates in the order they
    /// happened. An error from `change` is returned with nothing broadcast.
    fn apply(
        &self,
        app: &AppHandle,
        hub: &StateHub,
        change: impl FnOnce(&mut Option<Session>) -> Result<bool, String>,
    ) -> Result<(), String> {
        let (just_ended, was_preview) = {
            let mut session = self.session.lock().unwrap();
            let was_over = is_over(&session);
            let was_preview = session.as_ref().is_some_and(|s| s.preview);
            if !change(&mut session)? {
                return Ok(());
            }
            let value = serde_json::to_value(&*session).map_err(|e| e.to_string())?;
            hub.update(app, CHANNEL, |_| value);
            (!was_over && is_over(&session), was_preview)
        };
        // The talk is over: its overlays go away (the manager shows the result) and its hotkeys
        // are released for other apps. In a task of its own, after the lock is released: when a
        // hotkey ended the session we are inside the shortcut plugin's handler, which holds the
        // plugin's lock, so releasing the hotkeys from here would wait for ourselves (006/03).
        if just_ended {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                app.state::<Engine>().clean_up(&app, was_preview)
            });
        }
        Ok(())
    }

    /// Takes down the ended session's overlays, icon and hotkeys, unless a new
    /// session has opened since (`session_open` set those up for itself). The manager comes back
    /// after a talk or a note, not after the panel's preview: the slides keep focus (ADR 0028).
    fn clean_up(&self, app: &AppHandle, preview: bool) {
        let _windows = self.windows.lock().unwrap();
        if !is_over(&self.session.lock().unwrap()) {
            return;
        }
        crate::overlay::hide_all(app);
        // The icon and the control panel's hotkey stay for the panel (ADR 0028).
        crate::tray::show_idle(app);
        crate::hotkeys::register_idle(app);
        if !preview {
            bring_back_manager(app);
        }
    }
}

/// Starting a session minimises the manager (011/03); once the session is over it comes back
/// with the summary, whichever window or hotkey ended it.
fn bring_back_manager(app: &AppHandle) {
    let Some(manager) = app.get_webview_window(crate::MANAGER_LABEL) else {
        return;
    };
    if !manager.is_minimized().unwrap_or(false) {
        return;
    }
    if let Err(e) = manager.unminimize().and_then(|_| manager.set_focus()) {
        log::warn!("manager not brought back: {e}");
    }
}

/// What a button or a hotkey asks the session to do.
#[derive(Clone, Copy, Debug)]
pub enum Action {
    Next,
    Previous,
    TogglePause,
    End,
    /// Brings the main window back (the session icon's menu, or its hotkey); the session itself
    /// is untouched.
    ShowManager,
    /// Switches the Timeline to its next style (the session icon's menu, or its hotkey). The
    /// manager does it, because it owns the saved settings (`CYCLE_STYLE_EVENT`).
    CycleStyle,
    /// Makes every overlay's panels more solid, or more see-through. The manager does it,
    /// as for the style (`overlay::OPACITY_EVENT`).
    Darker,
    Lighter,
    /// Opens or closes the control panel (ADR 0028); the session is untouched.
    TogglePanel,
}

impl Action {
    /// The overlay opacity change this action asks the manager for (`overlay::OPACITY_CHANGES`).
    pub fn opacity_change(self) -> Option<&'static str> {
        match self {
            Action::Darker => Some("darker"),
            Action::Lighter => Some("lighter"),
            _ => None,
        }
    }
}

/// Does `action` to the open session, from a command or a hotkey.
pub fn act(app: &AppHandle, action: Action) -> Result<(), String> {
    if matches!(action, Action::ShowManager) {
        crate::tray::show_manager(app);
        return Ok(());
    }
    if matches!(action, Action::TogglePanel) {
        // In a task of its own: a hotkey or menu handler mustn't build a window itself (it would
        // wait on the thread that does the work; see overlay::open_overlay).
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = crate::control_panel::toggle(&app) {
                log::warn!("control panel: {e}");
            }
        });
        return Ok(());
    }
    if matches!(action, Action::CycleStyle) {
        return app
            .emit_to(crate::MANAGER_LABEL, crate::overlay::CYCLE_STYLE_EVENT, ())
            .map_err(|e| format!("Timeline style not changed: {e}"));
    }
    if let Some(change) = action.opacity_change() {
        return crate::overlay::change_opacity(app, change);
    }
    let engine = app.state::<Engine>();
    let hub = app.state::<StateHub>();
    let at = now();
    engine.apply(app, &hub, |s| {
        Ok(s.as_mut().is_some_and(|s| match action {
            Action::Next => s.next(&at),
            Action::Previous => s.previous(&at),
            Action::TogglePause => s.toggle_pause(&at),
            Action::End => s.end(&at),
            Action::ShowManager
            | Action::CycleStyle
            | Action::Darker
            | Action::Lighter
            | Action::TogglePanel => false,
        }))
    })
}

/// An overlay's close button was used: a shown note ends with it (its only overlay), a deck with
/// its flashcard widget; a talk carries on with the overlay hidden.
pub fn overlay_closed(app: &AppHandle, label: &str) {
    let note = app
        .state::<Engine>()
        .session
        .lock()
        .unwrap()
        .as_ref()
        .is_some_and(|s| ends_with(s, label) && s.status != Status::Finished);
    if note && let Err(e) = act(app, Action::End) {
        log::warn!("note not closed: {e}");
    }
}

/// Whether closing the overlay `label` ends `session`: a note's only overlay, or a deck's flashcard
/// widget. Closing a deck's timeline widget leaves the deck running.
fn ends_with(session: &Session, label: &str) -> bool {
    session.note || (session.deck && label == FLASHCARD_LABEL)
}

/// The flashcard widget's window (`overlay-` and the plugin id in src/plugins/flashcard).
const FLASHCARD_LABEL: &str = "overlay-flashcard";

/// Ends the control panel's preview, if it is showing: the panel has closed (ADR 0028).
pub fn end_preview(app: &AppHandle) {
    let preview = app
        .state::<Engine>()
        .session
        .lock()
        .unwrap()
        .as_ref()
        .is_some_and(|s| s.preview && !s.deck && s.status != Status::Finished);
    if preview && let Err(e) = act(app, Action::End) {
        log::warn!("preview not ended: {e}");
    }
}

// Session commands are async so they don't run on the main thread, which handles window events
// (like the overlay windows' commands, ADR 0004).

/// Opens a session for `plan` (from `talk`) in `ready`, with its hotkeys (action → accelerator).
/// Refused while another session is running.
#[tauri::command]
pub async fn session_open(
    app: AppHandle,
    engine: tauri::State<'_, Engine>,
    hub: tauri::State<'_, StateHub>,
    plan: Vec<PlannedSegment>,
    talk: Value,
    shortcuts: BTreeMap<String, String>,
    mode: Option<String>,
) -> Result<(), String> {
    // `talk` (or none), `note`, `deck`, `preview` or `deck-preview`: the same names as
    // `SessionMode` in src/lib/session/store.ts.
    let note = mode.as_deref() == Some("note");
    let deck_preview = mode.as_deref() == Some("deck-preview");
    let preview = mode.as_deref() == Some("preview") || deck_preview;
    let deck = mode.as_deref() == Some("deck") || deck_preview;
    // A preview gives way to anything, and opens only when nothing else is open.
    let running = |s: &Option<Session>| {
        s.as_ref().is_some_and(|s| {
            if preview {
                s.status != Status::Finished && !s.preview
            } else {
                s.status == Status::Running && !s.preview
            }
        })
    };
    const REFUSED: &str = "A session is already running. End it first.";
    // The preview is the open panel's: none once it has closed (it may close while the panel's
    // page is still asking for one).
    if preview && !deck_preview && !crate::control_panel::is_open(&app) {
        return Err("The control panel is closed.".into());
    }
    let _windows = engine.windows.lock().unwrap();
    let replacing_preview = {
        let session = engine.session.lock().unwrap();
        if running(&session) {
            return Err(REFUSED.into());
        }
        session
            .as_ref()
            .is_some_and(|s| s.preview && s.status != Status::Finished)
    };
    // A note or a talk takes the preview's place: its overlays go, and the new session opens its own.
    if replacing_preview && !preview {
        crate::overlay::hide_all(&app);
    }
    // Registered before taking the session lock: registering needs the main thread (see `apply`).
    // A preview keeps the idle key and menu: it is only the panel's.
    let unavailable = if preview {
        vec![]
    } else {
        let unavailable = crate::hotkeys::register(&app, &shortcuts);
        crate::tray::show_tray(&app, &shortcuts, &unavailable);
        unavailable
    };
    engine.apply(&app, &hub, |session| {
        // Started (by a hotkey) while the new one's hotkeys were being registered.
        if running(session) {
            return Err(REFUSED.into());
        }
        log::debug!("session open, {} segments", plan.len());
        let mut opened = Session::new(plan, talk);
        opened.shortcuts = shortcuts;
        opened.unavailable = unavailable;
        // A deck opens Ready on its first card, like a talk, until Start or Space.
        opened.deck = deck;
        // A note or a preview is shown straight away: its clock counts up from now.
        if note || preview {
            opened.note = note;
            opened.preview = preview;
            opened.next(&now());
        }
        *session = Some(opened);
        Ok(true)
    })
}

/// The deck editor's preview follows the deck as it is edited: its cards now, on card `index`.
#[tauri::command]
pub async fn session_preview_deck(
    app: AppHandle,
    engine: tauri::State<'_, Engine>,
    hub: tauri::State<'_, StateHub>,
    plan: Vec<PlannedSegment>,
    talk: Value,
    index: usize,
) -> Result<(), String> {
    engine.apply(&app, &hub, |session| {
        Ok(session
            .as_mut()
            .is_some_and(|s| s.preview_deck(plan, talk, index)))
    })
}

/// Closes a session that hasn't started or has finished. Returns whether it changed anything;
/// a running session must be ended first.
fn close(session: &mut Option<Session>) -> Result<bool, String> {
    match session {
        Some(s) if s.status == Status::Running => Err("End the session before closing it.".into()),
        Some(_) => {
            *session = None;
            Ok(true)
        }
        None => Ok(false),
    }
}

#[tauri::command]
pub async fn session_close(
    app: AppHandle,
    engine: tauri::State<'_, Engine>,
    hub: tauri::State<'_, StateHub>,
) -> Result<(), String> {
    engine.apply(&app, &hub, close)
}

#[tauri::command]
pub async fn session_next(app: AppHandle) -> Result<(), String> {
    act(&app, Action::Next)
}

/// A deck's card `from` has run its time: the next card, if it is still the one showing.
#[tauri::command]
pub async fn session_advance(app: AppHandle, from: usize) -> Result<(), String> {
    let engine = app.state::<Engine>();
    let hub = app.state::<StateHub>();
    let at = now();
    engine.apply(&app, &hub, |s| {
        Ok(s.as_mut().is_some_and(|s| s.advance(from, &at)))
    })
}

#[tauri::command]
pub async fn session_previous(app: AppHandle) -> Result<(), String> {
    act(&app, Action::Previous)
}

#[tauri::command]
pub async fn session_toggle_pause(app: AppHandle) -> Result<(), String> {
    act(&app, Action::TogglePause)
}

#[tauri::command]
pub async fn session_end(app: AppHandle) -> Result<(), String> {
    act(&app, Action::End)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plan(n: usize) -> Vec<PlannedSegment> {
        (0..n)
            .map(|i| PlannedSegment {
                segment_id: format!("s_{i}"),
                name: format!("Segment {i}"),
                planned_seconds: 60,
                open_ended: false,
            })
            .collect()
    }

    impl Session {
        fn new_plan(plan: Vec<PlannedSegment>) -> Self {
            Session::new(plan, Value::Null)
        }
    }

    #[test]
    fn a_preview_stays_on_its_last_part() {
        let mut s = Session::new_plan(plan(1));
        s.preview = true;
        assert!(s.next("t0"));
        assert!(!s.next("t1"));
        assert_eq!(s.status, Status::Running);
    }

    #[test]
    fn a_note_stays_on_its_last_topic() {
        let mut s = Session::new_plan(plan(2));
        s.note = true;
        assert!(s.next("t0"));
        assert!(s.next("t1"));
        assert!(!s.next("t2"));
        assert_eq!((s.status, s.index), (Status::Running, 1));
        assert!(s.previous("t3"));
        assert!(s.end("t4"));
        assert_eq!(s.status, Status::Finished);
    }

    #[test]
    fn a_deck_starts_with_space_and_stays_on_its_last_card_until_stop() {
        let mut s = Session::new_plan(plan(2));
        s.deck = true;
        assert_eq!(s.status, Status::Ready);
        assert!(s.toggle_pause("t0"));
        assert_eq!((s.status, s.index, s.paused), (Status::Running, 0, false));
        assert!(s.next("t1"));
        assert!(!s.next("t2"));
        assert_eq!((s.status, s.index), (Status::Running, 1));
        assert!(s.end("t3"));
        assert_eq!(
            kinds(&s),
            [EventType::Start, EventType::Next, EventType::End]
        );
    }

    #[test]
    fn a_deck_advances_only_from_the_card_still_showing() {
        let mut s = Session::new_plan(plan(3));
        s.deck = true;
        assert!(!s.advance(0, "t0"), "not before the start");
        s.next("t0");
        assert!(s.advance(0, "t1"));
        assert!(
            !s.advance(0, "t2"),
            "a second ask for the same card does nothing"
        );
        s.toggle_pause("t3");
        assert!(!s.advance(1, "t4"), "not while paused");
        s.toggle_pause("t5");
        assert!(s.advance(1, "t6"));
        assert!(!s.advance(2, "t7"), "the last card stays");
        assert_eq!(s.index, 2);
        let mut talk = Session::new_plan(plan(2));
        talk.next("t0");
        assert!(!talk.advance(0, "t1"), "a talk never moves on by itself");
    }

    #[test]
    fn closing_a_decks_timeline_leaves_the_deck_running() {
        let mut deck = Session::new_plan(plan(2));
        deck.deck = true;
        assert!(ends_with(&deck, "overlay-flashcard"));
        assert!(!ends_with(&deck, "overlay-deck-timeline"));
        let mut note = Session::new_plan(plan(2));
        note.note = true;
        assert!(ends_with(&note, "overlay-talking-points"));
        assert!(
            !ends_with(&Session::new_plan(plan(2)), "overlay-flashcard"),
            "a talk is never ended by an overlay"
        );
    }

    #[test]
    fn only_a_deck_preview_follows_the_editor() {
        let mut s = Session::new_plan(plan(3));
        s.deck = true;
        s.preview = true;
        s.next("t0");
        assert!(s.preview_deck(plan(2), Value::Null, 5));
        assert_eq!((s.index, s.plan.len()), (1, 2), "on the last card it has");
        assert!(
            !s.preview_deck(vec![], Value::Null, 0),
            "a deck with no cards is not shown"
        );
        assert_eq!(kinds(&s), vec![EventType::Start], "nothing is logged");
        let mut shown = Session::new_plan(plan(3));
        shown.deck = true;
        shown.next("t0");
        assert!(
            !shown.preview_deck(plan(2), Value::Null, 1),
            "a deck being shown is left alone"
        );
    }

    fn kinds(s: &Session) -> Vec<EventType> {
        s.events.iter().map(|e| e.kind).collect()
    }

    #[test]
    fn opens_ready_and_the_first_next_starts_the_clock() {
        let mut s = Session::new_plan(plan(3));
        assert_eq!((s.status, s.index), (Status::Ready, 0));
        assert!(s.events.is_empty());
        assert!(s.next("t1"));
        assert_eq!((s.status, s.index), (Status::Running, 0));
        assert_eq!(kinds(&s), vec![EventType::Start]);
    }

    #[test]
    fn next_moves_on_and_previous_goes_back_logged() {
        let mut s = Session::new_plan(plan(3));
        s.next("t1");
        s.next("t2");
        assert_eq!(s.index, 1);
        assert!(s.previous("t3"));
        assert_eq!(s.index, 0);
        assert_eq!(
            kinds(&s),
            vec![EventType::Start, EventType::Next, EventType::Previous]
        );
    }

    #[test]
    fn previous_at_the_first_segment_does_nothing() {
        let mut s = Session::new_plan(plan(3));
        assert!(!s.previous("t0"), "not started yet");
        s.next("t1");
        assert!(!s.previous("t2"));
        assert_eq!((s.index, kinds(&s)), (0, vec![EventType::Start]));
    }

    #[test]
    fn next_on_the_last_segment_finishes() {
        let mut s = Session::new_plan(plan(2));
        s.next("t1");
        s.next("t2");
        assert!(s.next("t3"));
        assert_eq!(s.status, Status::Finished);
        assert_eq!(
            kinds(&s),
            vec![EventType::Start, EventType::Next, EventType::End]
        );
        assert!(!s.next("t4"), "nothing happens after the end");
        assert!(!s.previous("t4"));
    }

    #[test]
    fn end_finishes_from_anywhere_once() {
        let mut running = Session::new_plan(plan(3));
        running.next("t1");
        assert!(running.end("t2"));
        assert_eq!(running.status, Status::Finished);
        assert_eq!(kinds(&running), vec![EventType::Start, EventType::End]);
        assert!(!running.end("t3"));

        let mut ready = Session::new_plan(plan(3));
        assert!(ready.end("t1"));
        assert_eq!(ready.status, Status::Finished);
        assert!(ready.events.is_empty(), "never started, nothing to log");
    }

    #[test]
    fn pause_and_resume_are_logged_and_only_while_running() {
        let mut s = Session::new_plan(plan(3));
        assert!(!s.toggle_pause("t0"), "nothing to pause before the start");
        s.next("t1");
        assert!(s.toggle_pause("t2"));
        assert!(s.paused);
        assert!(s.toggle_pause("t3"));
        assert!(!s.paused);
        assert_eq!(
            kinds(&s),
            vec![EventType::Start, EventType::Pause, EventType::Resume]
        );
    }

    #[test]
    fn moving_on_while_paused_resumes_first() {
        let mut s = Session::new_plan(plan(3));
        s.next("t1");
        s.toggle_pause("t2");
        assert!(s.next("t3"));
        assert!(!s.paused);
        assert_eq!(s.index, 1);
        assert_eq!(
            kinds(&s),
            vec![
                EventType::Start,
                EventType::Pause,
                EventType::Resume,
                EventType::Next
            ]
        );
        s.toggle_pause("t4");
        assert!(s.previous("t5"));
        assert_eq!(
            &kinds(&s)[4..],
            &[EventType::Pause, EventType::Resume, EventType::Previous]
        );
    }

    #[test]
    fn ending_while_paused_ends_without_resuming() {
        let mut s = Session::new_plan(plan(2));
        s.next("t1");
        s.toggle_pause("t2");
        assert!(s.end("t3"));
        assert!(!s.paused);
        assert_eq!(
            kinds(&s),
            vec![EventType::Start, EventType::Pause, EventType::End]
        );
        assert!(!s.toggle_pause("t4"), "nothing to pause after the end");
    }

    #[test]
    fn an_empty_plan_never_starts() {
        let mut s = Session::new_plan(vec![]);
        assert!(!s.next("t1"));
        assert_eq!(s.status, Status::Ready);
    }

    #[test]
    fn only_a_session_that_is_not_running_can_be_closed() {
        let mut open = Some(Session::new_plan(plan(2)));
        open.as_mut().unwrap().next("t1");
        assert!(close(&mut open).is_err());
        assert!(open.is_some());
        open.as_mut().unwrap().end("t2");
        assert_eq!(close(&mut open), Ok(true));
        assert!(open.is_none());
        assert_eq!(close(&mut open), Ok(false));
        let mut ready = Some(Session::new_plan(plan(2)));
        assert_eq!(close(&mut ready), Ok(true));
    }

    #[test]
    fn session_payload_matches_the_frontend() {
        // Same example as `SESSION_EXAMPLE` in src/lib/session/clock.test.ts.
        let mut s = Session::new(
            vec![
                PlannedSegment {
                    segment_id: "s_1".into(),
                    name: "Intro".into(),
                    planned_seconds: 120,
                    open_ended: false,
                },
                PlannedSegment {
                    segment_id: "s_2".into(),
                    name: "Topic".into(),
                    planned_seconds: 300,
                    open_ended: false,
                },
            ],
            serde_json::json!({ "id": "t_1", "name": "Launch" }),
        );
        s.shortcuts = BTreeMap::from([("next".into(), "Control+Alt+ArrowRight".into())]);
        s.unavailable = vec!["end".into()];
        s.next("2026-10-20T14:00:00.000Z");
        s.next("2026-10-20T14:02:30.000Z");
        assert_eq!(
            serde_json::to_string(&s).unwrap(),
            r#"{"status":"running","index":1,"paused":false,"plan":[{"segmentId":"s_1","name":"Intro","plannedSeconds":120,"openEnded":false},{"segmentId":"s_2","name":"Topic","plannedSeconds":300,"openEnded":false}],"events":[{"at":"2026-10-20T14:00:00.000Z","type":"start"},{"at":"2026-10-20T14:02:30.000Z","type":"next"}],"talk":{"id":"t_1","name":"Launch"},"shortcuts":{"next":"Control+Alt+ArrowRight"},"unavailable":["end"],"note":false,"deck":false,"preview":false}"#
        );
    }
}
