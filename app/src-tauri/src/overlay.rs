//! Overlay windows: one per plugin, labelled `overlay-<plugin id>`.
//!
//! Window settings are the ones proven in the proof of concept: frameless,
//! transparent, always on top. Position, size and display are remembered by
//! tauri-plugin-window-state, which restores them only if that display is
//! still connected; otherwise the window opens centred on the primary display.
//! The Timeline is the exception (ADR 0021): its window is a different shape for each style, so
//! `Layouts` remembers a frame per style (`overlay-layouts.json`) and the plugin is denied for it.

use crate::state::StateHub;
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub const LABEL_PREFIX: &str = "overlay-";

/// State channel: whether overlays are hidden from screen capture (spec §5).
pub const CAPTURE_CHANNEL: &str = "capture-hidden";

/// State channel: how the overlays look (Settings › Overlays, 007/02). Same name as
/// `OVERLAY_SETTINGS_CHANNEL` in src/lib/settings/overlays.ts. The manager sends it whenever the
/// settings load or change; Rust only carries it to the overlay windows.
pub const SETTINGS_CHANNEL: &str = "overlay-settings";

/// State channel: the point the Timeline's waveform is held at, so Talking Points shows that
/// segment's notes; null when nothing is held. Same name as `LOOK_BACK_CHANNEL` in
/// src/lib/session/look-back.ts. It only looks: the session is not changed.
pub const LOOK_BACK_CHANNEL: &str = "look-back";

/// Sent to the manager to switch the Timeline to its next style. Same name as
/// `CYCLE_TIMELINE_STYLE_EVENT` in src/lib/settings/overlays.ts.
pub const CYCLE_STYLE_EVENT: &str = "cycle-timeline-style";

/// Sent to the manager to make the overlays darker, lighter, solid or see-through again:
/// from an overlay's ⋯ menu or a hotkey. The manager owns the saved settings. Same name as
/// `OVERLAY_OPACITY_EVENT` in src/lib/settings/overlays.ts.
pub const OPACITY_EVENT: &str = "overlay-opacity";

/// The changes `OPACITY_EVENT` carries. Same values as `OPACITY_CHANGES` in overlays.ts.
pub const OPACITY_CHANGES: [&str; 4] = ["darker", "lighter", "solid", "see-through"];

/// Asks the manager for an opacity change (one of `OPACITY_CHANGES`).
pub fn change_opacity(app: &AppHandle, change: &str) -> Result<(), String> {
    if !OPACITY_CHANGES.contains(&change) {
        return Err(format!("Unknown opacity change: {change:?}"));
    }
    app.emit_to(crate::MANAGER_LABEL, OPACITY_EVENT, change)
        .map_err(|e| format!("Overlay opacity not changed: {e}"))
}

/// Hidden from screen capture unless the user has switched it off.
pub fn hidden_from_capture(hub: &StateHub) -> bool {
    hub.get(CAPTURE_CHANNEL)
        .and_then(|v| v.value.as_bool())
        .unwrap_or(true)
}

pub fn label(plugin_id: &str) -> String {
    format!("{LABEL_PREFIX}{plugin_id}")
}

/// A screen region in logical pixels, top-left origin.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Area {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Area {
    /// Top-left position that centres a `width` × `height` window in this area.
    pub fn centred(&self, width: f64, height: f64) -> (f64, f64) {
        (
            self.x + (self.width - width) / 2.0,
            self.y + (self.height - height) / 2.0,
        )
    }
}

/// Where a new overlay goes before any saved position applies: the built-in
/// (laptop) display if there is one, so it doesn't land on a projector set as
/// primary; otherwise the primary display's work area.
fn first_open_area(app: &AppHandle) -> Option<Area> {
    crate::platform::builtin_display_area().or_else(|| {
        let monitor = app.primary_monitor().ok().flatten()?;
        let scale = monitor.scale_factor();
        let work = monitor.work_area();
        Some(Area {
            x: work.position.x as f64 / scale,
            y: work.position.y as f64 / scale,
            width: work.size.width as f64 / scale,
            height: work.size.height as f64 / scale,
        })
    })
}

/// Hides every overlay (they are never closed while the app runs; see platform::exit_now).
pub fn hide_all(app: &AppHandle) {
    for (label, window) in app.webview_windows() {
        if label.starts_with(LABEL_PREFIX)
            && let Err(e) = window.hide()
        {
            log::warn!("{label}: not hidden: {e}");
        }
    }
}

/// Plugin ids are lowercase words joined by single hyphens, e.g.
/// `talking-points`. Same rule as `isValidPluginId` in `src/lib/windows.ts`.
pub fn is_valid_plugin_id(id: &str) -> bool {
    id.split('-').all(|word| {
        !word.is_empty()
            && word
                .chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
    })
}

/// Where an overlay goes on a display when it has no remembered place (007/10).
#[derive(Debug, Clone, Copy, Default, serde::Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum Place {
    /// The middle of the display.
    #[default]
    Centre,
    /// A card in the bottom right corner.
    BottomRight,
    /// A card in the top right corner.
    TopRight,
    /// A card in the top left corner (Talking Points, clear of every Timeline style).
    TopLeft,
    /// A card in the upper left of the display, in from its corner (the flashcard widget, ADR 0036).
    UpperLeft,
    /// A wide card centred along the bottom (the square wave).
    BottomCentre,
    /// Tall: the display's height less a margin, against the right edge.
    RightRail,
    /// Wide: the display's whole width, flush with its bottom edge.
    BottomStrip,
}

/// What a strip is kept inside: the usable part of the display (clear of the Dock, taskbar and
/// menu bar) or the display's whole screen.
#[derive(Debug, Clone, Copy, Default, serde::Deserialize, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum Against {
    /// Above the Dock or taskbar, below the menu bar.
    WorkArea,
    /// The very edge of the screen, over the Dock or taskbar. The product's default
    /// (`stripEdge` in src/lib/settings/overlays.ts), so a missing value means it too.
    #[default]
    Screen,
}

/// An overlay's window size from its plugin (`OverlayWindowSize` in src/lib/windows.ts).
#[derive(Debug, Clone, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WindowSize {
    pub width: f64,
    pub height: f64,
    /// The smallest the window may be; a remembered or reused window smaller than this is enlarged.
    pub min_width: Option<f64>,
    pub min_height: Option<f64>,
    /// Where it opens when nothing is remembered; `Centre` when missing.
    pub place: Option<Place>,
    /// What a strip layout keeps to; the edge of the screen when missing.
    pub against: Option<Against>,
    /// Names the overlay's layout (a Timeline style): each layout remembers its own size and place
    /// while the app runs, and switching layouts on an open overlay restores that one.
    pub layout: Option<String>,
}

/// A window's outer frame in logical pixels.
#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct Frame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// Space left between a placed card and the display's edge.
const MARGIN: f64 = 24.0;
/// A card at the top sits this far down, clear of a menu bar.
const TOP_MARGIN: f64 = MARGIN * 2.0;
/// The rail's top and bottom, clear of a menu bar and a dock.
const RAIL_MARGIN: f64 = 30.0;
/// How far in from the display's top left corner an upper-left card sits, as shares of its size.
const UPPER_LEFT_IN: (f64, f64) = (0.08, 0.12);

/// The frame a layout takes in `area` when nothing is remembered for it.
pub fn place_in(area: Area, place: Place, width: f64, height: f64) -> Frame {
    match place {
        Place::Centre => {
            let (x, y) = area.centred(width, height);
            Frame {
                x,
                y,
                width,
                height,
            }
        }
        Place::BottomRight => Frame {
            x: area.x + area.width - width - MARGIN,
            y: area.y + area.height - height - MARGIN,
            width,
            height,
        },
        Place::TopRight => Frame {
            x: area.x + area.width - width - MARGIN,
            y: area.y + TOP_MARGIN,
            width,
            height,
        },
        Place::TopLeft => Frame {
            x: area.x + MARGIN,
            y: area.y + TOP_MARGIN,
            width,
            height,
        },
        Place::UpperLeft => Frame {
            x: area.x + (area.width * UPPER_LEFT_IN.0).round(),
            y: area.y + (area.height * UPPER_LEFT_IN.1).round(),
            width,
            height,
        },
        Place::BottomCentre => Frame {
            x: area.x + (area.width - width) / 2.0,
            y: area.y + area.height - height - MARGIN,
            width,
            height,
        },
        Place::RightRail => {
            let height = (area.height - RAIL_MARGIN * 2.0).max(height);
            Frame {
                x: area.x + area.width - width - MARGIN,
                y: area.y + RAIL_MARGIN,
                width,
                height,
            }
        }
        Place::BottomStrip => Frame {
            x: area.x,
            y: area.y + area.height - height,
            width: area.width,
            height,
        },
    }
}

/// A strip is always the display's whole width and flush with its bottom edge (John: never
/// the top): where a drag or a resize left it, this is where it goes, on the nearest display.
/// `None` when there is no display.
pub fn snap_to_bottom(frame: Frame, areas: &[Area]) -> Option<Frame> {
    let (cx, cy) = (frame.x + frame.width / 2.0, frame.y + frame.height / 2.0);
    let distance = |a: &Area| {
        let dx = (cx - a.x).max(0.0).max(cx - (a.x + a.width));
        let dy = (cy - a.y).max(0.0).max(cy - (a.y + a.height));
        dx * dx + dy * dy
    };
    let area = areas
        .iter()
        .min_by(|a, b| distance(a).total_cmp(&distance(b)))?;
    let height = frame.height.min(area.height);
    Some(Frame {
        x: area.x,
        y: area.y + area.height - height,
        width: area.width,
        height,
    })
}

/// Whether sending a window from `now` to `snapped` was already tried (`tried` is the last snap,
/// from where to where): the system didn't put it there, so asking again would never end.
fn already_tried(tried: Option<(Frame, Frame)>, now: Frame, snapped: Frame) -> bool {
    tried.is_some_and(|(at, to)| same_frame(at, now) && same_frame(to, snapped))
}

/// Whether two frames are the same to within a pixel.
pub(crate) fn same_frame(a: Frame, b: Frame) -> bool {
    let same = |a: f64, b: f64| (a - b).abs() < 1.0;
    same(a.x, b.x) && same(a.y, b.y) && same(a.width, b.width) && same(a.height, b.height)
}

/// The frames each overlay has had in each of its layouts (a Timeline style), remembered across
/// restarts in `overlay-layouts.json` beside the app's other data. The window-state plugin doesn't
/// handle these windows: it remembers one frame per window, and a corner card, a rail and a strip
/// don't share one.
#[derive(Default)]
pub struct Layouts {
    inner: std::sync::Mutex<LayoutBook>,
}

#[derive(Default)]
struct LayoutBook {
    loaded: bool,
    /// What each window is showing now, by its label.
    windows: std::collections::HashMap<String, WindowBook>,
    /// `"<label>/<layout>"` → the frame it was last left or hidden in.
    frames: std::collections::HashMap<String, Frame>,
}

/// One overlay window as the book knows it.
#[derive(Default)]
struct WindowBook {
    /// The layout it shows now.
    layout: Option<String>,
    /// Where that layout opens (its plugin's `place`). A strip is the layout whose place is
    /// `BottomStrip`: it is kept to an edge (`dock_strip`).
    place: Place,
    /// What a strip keeps to.
    against: Against,
    /// How many times it has moved or resized, and whether a thread is waiting for that to stop.
    moves: u64,
    settling: bool,
    /// The last snap it was given, as (where it was, where it was sent): a window the system
    /// won't put there (a menu bar in the way) is not sent again from the same place.
    snapped: Option<(Frame, Frame)>,
}

fn frame_key(label: &str, layout: &str) -> String {
    format!("{label}/{layout}")
}

const LAYOUTS_FILE: &str = "overlay-layouts.json";

impl Layouts {
    fn with_book<R>(&self, app: &AppHandle, f: impl FnOnce(&mut LayoutBook) -> R) -> R {
        let mut book = self.inner.lock().unwrap();
        if !book.loaded {
            book.loaded = true;
            if let Ok(dir) = app.path().app_data_dir()
                && let Ok(text) = std::fs::read_to_string(dir.join(LAYOUTS_FILE))
            {
                match serde_json::from_str(&text) {
                    Ok(frames) => book.frames = frames,
                    Err(e) => log::warn!("{LAYOUTS_FILE} not read: {e}"),
                }
            }
        }
        f(&mut book)
    }

    fn save(app: &AppHandle, frames: &std::collections::HashMap<String, Frame>) {
        let Ok(dir) = app.path().app_data_dir() else {
            return;
        };
        let result = std::fs::create_dir_all(&dir).and_then(|()| {
            let text = serde_json::to_string_pretty(frames).map_err(std::io::Error::other)?;
            std::fs::write(dir.join(LAYOUTS_FILE), text)
        });
        if let Err(e) = result {
            log::warn!("{LAYOUTS_FILE} not written: {e}");
        }
    }
}

/// Whether most of a remembered frame is still on a connected display: its middle must be.
pub fn on_a_display(frame: Frame, areas: &[Area]) -> bool {
    let (cx, cy) = (frame.x + frame.width / 2.0, frame.y + frame.height / 2.0);
    areas
        .iter()
        .any(|a| cx >= a.x && cx <= a.x + a.width && cy >= a.y && cy <= a.y + a.height)
}

/// The window's scale factor. Every area is divided by it, not by its own display's, so areas and
/// the window's frame (`frame_of`, `move_to`) are in the same logical pixels on mixed-DPI displays.
fn window_scale(window: &tauri::WebviewWindow) -> f64 {
    window.scale_factor().unwrap_or(1.0)
}

/// A display's area: its whole screen (menu bar and Dock included) or the part apps may use.
fn monitor_area(m: &tauri::Monitor, against: Against, s: f64) -> Area {
    let (position, size) = match against {
        Against::Screen => (*m.position(), *m.size()),
        Against::WorkArea => (m.work_area().position, m.work_area().size),
    };
    Area {
        x: position.x as f64 / s,
        y: position.y as f64 / s,
        width: size.width as f64 / s,
        height: size.height as f64 / s,
    }
}

/// Each connected display's area.
fn areas(window: &tauri::WebviewWindow, against: Against) -> Vec<Area> {
    let scale = window_scale(window);
    window
        .available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|m| monitor_area(m, against, scale))
        .collect()
}

/// The area of the display the window is on, or of the first display.
pub(crate) fn current_area(window: &tauri::WebviewWindow, against: Against) -> Option<Area> {
    let on = window.current_monitor().ok().flatten();
    on.map(|m| monitor_area(&m, against, window_scale(window)))
        .or_else(|| areas(window, against).first().copied())
}

/// Sizes and places a window at `frame`.
pub(crate) fn move_to(window: &tauri::WebviewWindow, frame: Frame) {
    let label = window.label();
    if let Err(e) = window.set_size(tauri::LogicalSize::new(frame.width, frame.height)) {
        log::warn!("{label}: not resized: {e}");
    }
    if let Err(e) = window.set_position(tauri::LogicalPosition::new(frame.x, frame.y)) {
        log::warn!("{label}: not moved: {e}");
    }
}

pub(crate) fn frame_of(window: &tauri::WebviewWindow) -> Option<Frame> {
    let scale = window.scale_factor().ok()?;
    let p = window.outer_position().ok()?.to_logical::<f64>(scale);
    let s = window.outer_size().ok()?.to_logical::<f64>(scale);
    Some(Frame {
        x: p.x,
        y: p.y,
        width: s.width,
        height: s.height,
    })
}

// Window commands are async: on Windows, creating or changing windows from a
// synchronous command blocks the thread that has to do the work, and hangs.
#[tauri::command]
pub async fn open_overlay(
    app: AppHandle,
    hub: tauri::State<'_, StateHub>,
    layouts: tauri::State<'_, Layouts>,
    plugin_id: String,
    title: String,
    size: WindowSize,
) -> Result<(), String> {
    let (width, height) = (size.width, size.height);
    if !is_valid_plugin_id(&plugin_id) {
        return Err(format!("Invalid plugin id: {plugin_id:?}"));
    }
    let label = label(&plugin_id);
    // Already open: just show it. Focusing it would activate the app and pull
    // focus from the presenting app, which overlays must never do.
    if let Some(window) = app.get_webview_window(&label) {
        log::debug!("{label}: already open, showing it");
        apply_layout(&app, &window, &layouts, &size);
        window.show().map_err(|e| e.to_string())?;
        crate::state::resync(&app, &label);
        return Ok(());
    }

    // Centre on the first-open display; the window-state plugin then moves it
    // to its saved position when the window is ready, if there is one.
    let mut builder = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title(title)
        .inner_size(width, height)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        // Follow the user across Spaces/desktops, including full-screen apps' Spaces.
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .resizable(true)
        // Shown by platform::float_over_fullscreen once it's set up; on macOS
        // the window must become a panel before it's ever on screen.
        .visible(false)
        // NSWindow.sharingType = .none on Mac, WDA_EXCLUDEFROMCAPTURE on Windows.
        .content_protected(hidden_from_capture(&hub));
    // Placed for its layout (a corner card, a rail, a strip); the window-state plugin then moves
    // it to where it was last, if there is a saved place.
    let place = size.place.unwrap_or_default();
    if let Some(area) = first_open_area(&app) {
        let frame = place_in(area, place, width, height);
        builder = builder
            .inner_size(frame.width, frame.height)
            .position(frame.x, frame.y);
    }
    log::debug!("{label}: building window");
    let window = builder.build().map_err(|e| e.to_string())?;
    log::debug!("{label}: window built");
    apply_layout(&app, &window, &layouts, &size);
    crate::platform::float_over_fullscreen(&window).map_err(|e| e.to_string())?;
    crate::control_panel::keep_clear(&app, None);
    Ok(())
}

/// Gives an overlay the window its plugin describes for its layout. A layout the window already
/// has only keeps its minimum. Changing layout remembers the frame the window leaves, then takes
/// the new layout's remembered frame (if it is still on a display) or its place on the display
/// the window is on. A window shown for the first time takes its layout's remembered frame, if any.
fn apply_layout(
    app: &AppHandle,
    window: &tauri::WebviewWindow,
    layouts: &Layouts,
    size: &WindowSize,
) {
    let label = window.label().to_string();
    let Some(layout) = size.layout.clone() else {
        // One frame for every look (Talking Points stays where it is through a change of style);
        // its place is kept for `keep_overlays_apart`.
        layouts.with_book(app, |book| {
            book.windows.entry(label.clone()).or_default().place = size.place.unwrap_or_default()
        });
        fit_minimum(window, size);
        log::debug!("{label}: at {:?}", frame_of(window));
        return;
    };
    let place = size.place.unwrap_or_default();
    let against = size.against.unwrap_or_default();
    // A strip is kept to its own area (the whole screen or the work area); the cards to the work area.
    let judged = if place == Place::BottomStrip {
        against
    } else {
        Against::WorkArea
    };
    let displays = areas(window, judged);
    let now = frame_of(window);
    let mut changed = false;
    let target = layouts.with_book(app, |book| {
        let w = book.windows.entry(label.clone()).or_default();
        w.place = place;
        w.against = against;
        let before = w.layout.replace(layout.clone());
        if before.as_deref() == Some(layout.as_str()) {
            return None;
        }
        changed = before.is_some();
        if let (Some(before), Some(now)) = (before.as_ref(), now) {
            book.frames.insert(frame_key(&label, before), now);
            Layouts::save(app, &book.frames);
        }
        let remembered = book
            .frames
            .get(&frame_key(&label, &layout))
            .copied()
            .filter(|f| on_a_display(*f, &displays));
        match (remembered, before) {
            (Some(f), _) => Some(f),
            // Opened for the first time: the builder has already placed it.
            (None, None) => None,
            (None, Some(_)) => {
                current_area(window, judged).map(|a| place_in(a, place, size.width, size.height))
            }
        }
    });
    // The minimum first, so the new size is never clamped by the old layout's.
    let min = tauri::LogicalSize::new(
        size.min_width.unwrap_or(0.0),
        size.min_height.unwrap_or(0.0),
    );
    if let Err(e) = window.set_min_size(Some(min)) {
        log::warn!("{label}: minimum size not set: {e}");
    }
    if let Some(f) = target {
        log::debug!("{label}: layout {layout:?} → {f:?}");
        move_to(window, f);
    }
    fit_minimum(window, size);
    // The window's position may not have caught up with what was just set, so say where it is.
    dock_strip(app, window, target);
    // A style just chosen is in front: it is never hidden under Talking Points.
    if changed && window.is_visible().unwrap_or(false) {
        crate::platform::raise(window);
    }
}

/// Whether two frames cover any of the same pixels.
pub fn overlap(a: Frame, b: Frame) -> bool {
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/// When a session starts: an overlay with one frame for every look (no `layout`; Talking Points)
/// that sits over or under an overlay with layouts (the Timeline) goes back to its own place, so
/// neither hides the other. It is not moved when the style changes later: it stays where the
/// presenter has it.
#[tauri::command]
pub async fn keep_overlays_apart(
    app: AppHandle,
    layouts: tauri::State<'_, Layouts>,
) -> Result<(), String> {
    let shown: Vec<_> = app
        .webview_windows()
        .into_values()
        .filter(|w| w.label().starts_with(LABEL_PREFIX) && w.is_visible().unwrap_or(false))
        .collect();
    let (styled, free): (Vec<_>, Vec<_>) = layouts.with_book(&app, |book| {
        shown.into_iter().partition(|w| {
            book.windows
                .get(w.label())
                .is_some_and(|b| b.layout.is_some())
        })
    });
    let taken: Vec<Frame> = styled.iter().filter_map(frame_of).collect();
    for window in free {
        let Some(now) = frame_of(&window) else {
            continue;
        };
        if !taken.iter().any(|t| overlap(now, *t)) {
            continue;
        }
        let place = layouts.with_book(&app, |book| {
            book.windows
                .get(window.label())
                .map(|b| b.place)
                .unwrap_or_default()
        });
        if let Some(area) = current_area(&window, Against::WorkArea) {
            let to = place_in(area, place, now.width, now.height);
            log::debug!(
                "{}: over an overlay with layouts, back to its place → {to:?}",
                window.label()
            );
            move_to(&window, to);
        }
    }
    Ok(())
}

/// How long an overlay must sit still before it is settled (docked, if a strip, and its place
/// remembered): doing so during a drag fights it, and a strip could never be carried across the
/// middle of the display.
const SETTLE_AFTER: std::time::Duration = std::time::Duration::from_millis(250);

/// Called on every move or resize of an overlay. One thread waits for the moving to stop, then
/// docks a strip and remembers where the window is.
pub fn overlay_moved(app: &AppHandle, label: &str) {
    let layouts = app.state::<Layouts>();
    let start = layouts.with_book(app, |book| {
        let w = book.windows.entry(label.to_string()).or_default();
        w.moves += 1;
        !std::mem::replace(&mut w.settling, true)
    });
    if !start {
        return;
    }
    let (app, label) = (app.clone(), label.to_string());
    std::thread::spawn(move || {
        loop {
            let seen = app
                .state::<Layouts>()
                .with_book(&app, |book| book.windows.get(&label).map_or(0, |w| w.moves));
            std::thread::sleep(SETTLE_AFTER);
            let still = app.state::<Layouts>().with_book(&app, |book| {
                let w = book.windows.entry(label.clone()).or_default();
                let still = w.moves == seen;
                w.settling = !still;
                still
            });
            if still {
                break;
            }
        }
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            if let Some(window) = handle.get_webview_window(&label) {
                dock_strip(&handle, &window, None);
                remember_frame(&handle, &window, &handle.state::<Layouts>());
            }
        });
    });
}

/// A strip layout stays the display's whole width and against its bottom edge. Called when the
/// window has stopped moving, and when a layout is applied (`placed` is then the frame just set,
/// which the window may not report yet).
pub fn dock_strip(app: &AppHandle, window: &tauri::WebviewWindow, placed: Option<Frame>) {
    let layouts = app.state::<Layouts>();
    let label = window.label().to_string();
    let (place, against) = layouts.with_book(app, |book| {
        let w = book.windows.entry(label.clone()).or_default();
        (w.place, w.against)
    });
    if place != Place::BottomStrip {
        return;
    }
    let displays = areas(window, against);
    let Some(now) = placed.or_else(|| frame_of(window)) else {
        return;
    };
    let Some(snapped) = snap_to_bottom(now, &displays) else {
        return;
    };
    let gave_up = layouts.with_book(app, |book| {
        let w = book.windows.entry(label.clone()).or_default();
        if same_frame(snapped, now) {
            w.snapped = None;
            return false;
        }
        let again = already_tried(w.snapped, now, snapped);
        if !again {
            w.snapped = Some((now, snapped));
        }
        again
    });
    if gave_up {
        log::debug!("{label}: not docked again from {now:?}: the system keeps it there");
    } else if !same_frame(snapped, now) {
        log::debug!("{label}: docked → {snapped:?}");
        move_to(window, snapped);
    }
}

/// Changes an open overlay's layout (Timeline style) without reopening it (007/10).
#[tauri::command]
pub async fn set_overlay_layout(
    app: AppHandle,
    layouts: tauri::State<'_, Layouts>,
    plugin_id: String,
    size: WindowSize,
) -> Result<(), String> {
    if !is_valid_plugin_id(&plugin_id) {
        return Err(format!("Invalid plugin id: {plugin_id:?}"));
    }
    if let Some(window) = app.get_webview_window(&label(&plugin_id)) {
        // The new style has its own place: where the old one was pushed from no longer applies.
        crate::control_panel::forget(&label(&plugin_id));
        apply_layout(&app, &window, &layouts, &size);
    }
    // A style that sits at the right edge (D) moves out from under the control panel (ADR 0028).
    crate::control_panel::keep_clear(&app, None);
    Ok(())
}

/// The height an overlay that fits its content may take: `wanted`, no less than `min`, and
/// no lower than the bottom of `area` less the margin, from where the window's top is.
pub fn fitted_height(wanted: f64, min: f64, top: f64, area: Area) -> f64 {
    let room = (area.y + area.height - MARGIN - top).max(min);
    wanted.clamp(min, room)
}

/// An overlay sizes itself to what it shows (the flashcard widget): its height changes, its
/// width (the person's) stays, and it never runs past the bottom of the display it is on.
#[tauri::command]
pub async fn fit_overlay(window: tauri::WebviewWindow, height: f64) -> Result<(), String> {
    if !window.label().starts_with(LABEL_PREFIX) || !height.is_finite() {
        return Err("Only an overlay sizes itself.".into());
    }
    let Some(frame) = frame_of(&window) else {
        return Ok(());
    };
    let min = 120.0;
    let height = match current_area(&window, Against::WorkArea) {
        Some(area) => fitted_height(height, min, frame.y, area),
        None => height.max(min),
    };
    if (height - frame.height).abs() < 0.5 {
        return Ok(());
    }
    window
        .set_size(tauri::LogicalSize::new(frame.width, height))
        .map_err(|e| e.to_string())
}

/// Keeps an overlay at least the size its plugin needs: no smaller by resizing, and enlarged when a
/// remembered size (window-state plugin) or a window kept from earlier is smaller (007/01, after the
/// Timeline grew and an old, smaller window cut it off).
fn fit_minimum(window: &tauri::WebviewWindow, size: &WindowSize) {
    let (min_width, min_height) = (
        size.min_width.unwrap_or(0.0),
        size.min_height.unwrap_or(0.0),
    );
    if min_width <= 0.0 && min_height <= 0.0 {
        return;
    }
    let min = tauri::LogicalSize::new(min_width, min_height);
    if let Err(e) = window.set_min_size(Some(min)) {
        log::warn!("{}: minimum size not set: {e}", window.label());
    }
    let Ok(scale) = window.scale_factor() else {
        return;
    };
    let Ok(now) = window.inner_size().map(|s| s.to_logical::<f64>(scale)) else {
        return;
    };
    if now.width < min_width || now.height < min_height {
        let fitted = tauri::LogicalSize::new(now.width.max(min_width), now.height.max(min_height));
        log::debug!("{}: enlarged to {fitted:?}", window.label());
        if let Err(e) = window.set_size(fitted) {
            log::warn!("{}: not enlarged: {e}", window.label());
        }
    }
}

/// Windows covered by the capture setting: everything shown while presenting
/// (the overlays), not the Manager.
fn follows_capture_setting(label: &str) -> bool {
    // The control panel is never shared, whatever the setting (ADR 0028).
    label != crate::MANAGER_LABEL && label != crate::control_panel::LABEL
}

/// Sets the default for hiding windows from screen shares and recordings, and
/// applies it to every presenting window.
#[tauri::command]
pub async fn set_hidden_from_capture(
    app: AppHandle,
    hub: tauri::State<'_, StateHub>,
    hidden: bool,
) -> Result<(), String> {
    // Record the setting first so an overlay opened concurrently picks it up.
    hub.update(&app, CAPTURE_CHANNEL, |_| Value::from(hidden));
    for (label, window) in app.webview_windows() {
        if follows_capture_setting(&label) {
            window
                .set_content_protected(hidden)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Sends the overlays' look to every window (and to any overlay opened later).
#[tauri::command]
pub async fn set_overlay_settings(
    app: AppHandle,
    hub: tauri::State<'_, StateHub>,
    settings: Value,
) -> Result<(), String> {
    hub.update(&app, SETTINGS_CHANNEL, |_| settings);
    Ok(())
}

/// The Timeline's wave is held at a point, or let go (null): carried to every overlay.
#[tauri::command]
pub async fn set_look_back(
    app: AppHandle,
    hub: tauri::State<'_, StateHub>,
    look: Value,
) -> Result<(), String> {
    hub.update(&app, LOOK_BACK_CHANNEL, |_| look);
    Ok(())
}

/// Hides or shows one window in screen shares and recordings, without
/// changing the default.
#[tauri::command]
pub async fn set_window_hidden_from_capture(
    app: AppHandle,
    label: String,
    hidden: bool,
) -> Result<(), String> {
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("No window {label:?}"))?;
    window
        .set_content_protected(hidden)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn close_overlay(
    app: AppHandle,
    layouts: tauri::State<'_, Layouts>,
    plugin_id: String,
) -> Result<(), String> {
    // Hidden, not closed: destroying an overlay crashes on a Mac (platform::exit_now).
    // open_overlay shows it again.
    match app.get_webview_window(&label(&plugin_id)) {
        Some(window) => {
            remember_frame(&app, &window, &layouts);
            window.hide().map_err(|e| e.to_string())
        }
        None => Ok(()),
    }
}

/// An open overlay's layout now, and whether that layout is a strip (kept to an edge).
pub(crate) fn layout_now(app: &AppHandle, label: &str) -> (Option<String>, bool) {
    app.state::<Layouts>().with_book(app, |book| {
        book.windows.get(label).map_or((None, false), |w| {
            (w.layout.clone(), w.place == Place::BottomStrip)
        })
    })
}

/// Keeps where a window is for its current layout, so the next run opens it there. An overlay the
/// control panel pushed aside keeps the place it was pushed from.
fn remember_frame(app: &AppHandle, window: &tauri::WebviewWindow, layouts: &Layouts) {
    let label = window.label().to_string();
    let Some(now) = frame_of(window) else {
        return;
    };
    let now = crate::control_panel::home_of(&label, now);
    layouts.with_book(app, |book| {
        let layout = book.windows.get(&label).and_then(|w| w.layout.clone());
        if let Some(layout) = layout {
            book.frames.insert(frame_key(&label, &layout), now);
            Layouts::save(app, &book.frames);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_channel_matches_the_frontend() {
        // Same value as the OVERLAY_SETTINGS_CHANNEL test in src/lib/settings/overlays.test.ts.
        assert_eq!(SETTINGS_CHANNEL, "overlay-settings");
        // Same value as the LOOK_BACK_CHANNEL test in src/lib/session/look-back.test.ts.
        assert_eq!(LOOK_BACK_CHANNEL, "look-back");
        assert_eq!(CYCLE_STYLE_EVENT, "cycle-timeline-style");
        // Same as the OVERLAY_OPACITY_EVENT and OPACITY_CHANGES in src/lib/settings/overlays.ts.
        assert_eq!(OPACITY_EVENT, "overlay-opacity");
        assert_eq!(
            OPACITY_CHANGES,
            ["darker", "lighter", "solid", "see-through"]
        );
    }

    fn screen() -> Area {
        Area {
            x: 0.0,
            y: 25.0,
            width: 1440.0,
            height: 800.0,
        }
    }

    fn strip_at(x: f64, y: f64, width: f64) -> Frame {
        Frame {
            x,
            y,
            width,
            height: 76.0,
        }
    }

    #[test]
    fn a_strip_snaps_to_the_bottom_edge_the_full_width() {
        // Dragged to the middle-low of the display, narrower than it, partly off the left.
        let f = snap_to_bottom(strip_at(-300.0, 600.0, 1100.0), &[screen()]).unwrap();
        assert_eq!(
            (f.x, f.y, f.width, f.height),
            (0.0, 25.0 + 800.0 - 76.0, 1440.0, 76.0)
        );
    }

    #[test]
    fn a_strip_dragged_to_the_top_goes_back_to_the_bottom() {
        let f = snap_to_bottom(strip_at(100.0, 0.0, 1440.0), &[screen()]).unwrap();
        assert_eq!((f.x, f.y), (0.0, 25.0 + 800.0 - 76.0));
    }

    #[test]
    fn a_snap_the_system_refused_is_not_asked_for_again_from_the_same_place() {
        let (from, to) = (strip_at(0.0, 100.0, 1440.0), strip_at(0.0, 0.0, 1440.0));
        assert!(!already_tried(None, from, to));
        assert!(already_tried(Some((from, to)), from, to));
        // Somewhere else now (dragged again): worth another try.
        assert!(!already_tried(
            Some((from, to)),
            strip_at(0.0, 300.0, 1440.0),
            to
        ));
    }

    #[test]
    fn a_strip_already_docked_is_left_alone() {
        let docked = strip_at(0.0, 749.0, 1440.0);
        let f = snap_to_bottom(docked, &[screen()]).unwrap();
        assert!(same_frame(f, docked));
    }

    #[test]
    fn a_strip_off_one_display_docks_to_the_nearest() {
        let right = Area {
            x: 1440.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
        };
        let f = snap_to_bottom(strip_at(1500.0, 900.0, 400.0), &[screen(), right]).unwrap();
        assert_eq!((f.x, f.width), (1440.0, 1920.0));
    }

    #[test]
    fn window_size_reads_every_place_and_against_the_frontend_sends() {
        // Same values as `OverlayWindowSize.place` and `.against` in src/lib/windows.ts.
        let places = [
            ("centre", Place::Centre),
            ("bottom-right", Place::BottomRight),
            ("top-right", Place::TopRight),
            ("top-left", Place::TopLeft),
            ("upper-left", Place::UpperLeft),
            ("bottom-centre", Place::BottomCentre),
            ("right-rail", Place::RightRail),
            ("bottom-strip", Place::BottomStrip),
        ];
        for (name, place) in places {
            let json = format!(r#"{{"width":1,"height":1,"place":"{name}"}}"#);
            let size: WindowSize = serde_json::from_str(&json).unwrap();
            assert_eq!(size.place, Some(place), "{name}");
        }
        for (name, against) in [
            ("work-area", Against::WorkArea),
            ("screen", Against::Screen),
        ] {
            let json = format!(r#"{{"width":1,"height":1,"against":"{name}"}}"#);
            let size: WindowSize = serde_json::from_str(&json).unwrap();
            assert_eq!(size.against, Some(against), "{name}");
        }
        // Missing: the edge of the screen, like the setting's default.
        assert_eq!(Against::default(), Against::Screen);
    }

    #[test]
    fn window_size_reads_the_frontend_shape() {
        // Same JSON as the open_overlay test in src/lib/windows.test.ts.
        let size: WindowSize =
            serde_json::from_str(r#"{"width":1100,"height":160,"minWidth":640,"minHeight":160}"#)
                .unwrap();
        assert_eq!(
            (size.width, size.height, size.min_width, size.min_height),
            (1100.0, 160.0, Some(640.0), Some(160.0))
        );
        let plain: WindowSize = serde_json::from_str(r#"{"width":300,"height":200}"#).unwrap();
        assert_eq!(plain.min_width, None);
        assert_eq!((plain.place, plain.layout), (None, None));
        // Same JSON as the open_overlay test for a Timeline style in src/lib/windows.test.ts.
        let styled: WindowSize = serde_json::from_str(
            r#"{"width":250,"height":400,"place":"right-rail","layout":"rail"}"#,
        )
        .unwrap();
        assert_eq!(
            (styled.place, styled.layout.as_deref()),
            (Some(Place::RightRail), Some("rail"))
        );
    }

    fn display() -> Area {
        Area {
            x: 100.0,
            y: 50.0,
            width: 1440.0,
            height: 900.0,
        }
    }

    #[test]
    fn a_fitted_card_grows_to_its_content_but_stops_above_the_bottom() {
        let area = display();
        // 50 + 900 - 24 = 926 is as low as it may reach.
        assert_eq!(fitted_height(300.0, 120.0, 158.0, area), 300.0);
        assert_eq!(fitted_height(2000.0, 120.0, 158.0, area), 926.0 - 158.0);
        assert_eq!(fitted_height(40.0, 120.0, 158.0, area), 120.0);
    }

    #[test]
    fn a_corner_card_sits_in_its_corner_inside_the_display() {
        let f = place_in(display(), Place::BottomRight, 300.0, 290.0);
        assert_eq!((f.x, f.y, f.width, f.height), (1216.0, 636.0, 300.0, 290.0));
        let f = place_in(display(), Place::TopRight, 400.0, 470.0);
        assert_eq!((f.x, f.y), (1116.0, 98.0));
        // Talking Points: the top left, as far down as the top-right card.
        let f = place_in(display(), Place::TopLeft, 360.0, 290.0);
        assert_eq!((f.x, f.y, f.width, f.height), (124.0, 98.0, 360.0, 290.0));
        // The flashcard widget: the upper left, in from the corner.
        let f = place_in(display(), Place::UpperLeft, 400.0, 280.0);
        assert_eq!((f.x, f.y), (100.0 + 115.0, 50.0 + 108.0));
    }

    #[test]
    fn frames_overlap_only_when_they_share_pixels() {
        let f = |x, y, width, height| Frame {
            x,
            y,
            width,
            height,
        };
        // Talking Points over the clock card in the middle of John's display.
        assert!(overlap(
            f(940.0, 353.0, 360.0, 290.0),
            f(965.0, 361.0, 310.0, 275.0)
        ));
        // Talking Points at the top left, the clock at the bottom right: apart.
        assert!(!overlap(
            f(24.0, 48.0, 360.0, 290.0),
            f(1346.0, 751.0, 310.0, 275.0)
        ));
        // Touching edges are not an overlap.
        assert!(!overlap(
            f(0.0, 0.0, 100.0, 100.0),
            f(100.0, 0.0, 100.0, 100.0)
        ));
    }

    #[test]
    fn a_wide_card_sits_at_the_bottom_centre() {
        // The waveform and the blocks (styles A and B), clear of Talking Points at the top left.
        let f = place_in(display(), Place::BottomCentre, 1100.0, 200.0);
        assert_eq!((f.x, f.y, f.width, f.height), (270.0, 726.0, 1100.0, 200.0));
    }

    #[test]
    fn the_rail_runs_down_the_right_edge() {
        let f = place_in(display(), Place::RightRail, 250.0, 400.0);
        assert_eq!((f.x, f.y, f.width, f.height), (1266.0, 80.0, 250.0, 840.0));
        // On a display too short for the rail's own minimum, the minimum wins.
        let short = Area {
            height: 300.0,
            ..display()
        };
        assert_eq!(
            place_in(short, Place::RightRail, 250.0, 400.0).height,
            400.0
        );
    }

    #[test]
    fn a_remembered_frame_must_still_be_on_a_display() {
        let on = Frame {
            x: 1300.0,
            y: 100.0,
            width: 300.0,
            height: 200.0,
        };
        assert!(on_a_display(on, &[display()]));
        // The display it was on is gone.
        let off = Frame {
            x: 3000.0,
            y: 100.0,
            width: 300.0,
            height: 200.0,
        };
        assert!(!on_a_display(off, &[display()]));
        assert!(on_a_display(
            off,
            &[
                display(),
                Area {
                    x: 2900.0,
                    ..display()
                }
            ]
        ));
    }

    #[test]
    fn the_strip_spans_the_display_along_its_bottom() {
        let f = place_in(display(), Place::BottomStrip, 100.0, 72.0);
        assert_eq!((f.x, f.y, f.width, f.height), (100.0, 878.0, 1440.0, 72.0));
    }

    #[test]
    fn centres_window_in_area() {
        let area = Area {
            x: 100.0,
            y: 50.0,
            width: 1000.0,
            height: 800.0,
        };
        assert_eq!(area.centred(300.0, 200.0), (450.0, 350.0));
    }

    #[test]
    fn capture_setting_covers_everything_but_the_manager() {
        assert!(follows_capture_setting("overlay-timeline"));
        assert!(!follows_capture_setting(crate::MANAGER_LABEL));
        assert!(!follows_capture_setting(crate::control_panel::LABEL));
    }

    #[test]
    fn hidden_from_capture_by_default() {
        assert!(hidden_from_capture(&StateHub::default()));
    }

    #[test]
    fn labels_use_prefix() {
        assert_eq!(label("timeline"), "overlay-timeline");
    }

    #[test]
    fn validates_plugin_ids() {
        assert!(is_valid_plugin_id("timeline"));
        assert!(is_valid_plugin_id("talking-points"));
        assert!(is_valid_plugin_id("clock2"));
        assert!(!is_valid_plugin_id(""));
        assert!(!is_valid_plugin_id("Timeline"));
        assert!(!is_valid_plugin_id("-timeline"));
        assert!(!is_valid_plugin_id("time line"));
        assert!(!is_valid_plugin_id("../manager"));
        assert!(!is_valid_plugin_id("timeline-"));
        assert!(!is_valid_plugin_id("talking--points"));
    }
}
