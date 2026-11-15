//! The control panel (ADR 0028): one window down the right edge of the screen, full
//! height, for what is running, which overlays are up and how they look. It is a non-activating
//! panel like the overlays (ADR 0002), so clicking it never takes focus from the slides, and it
//! is always hidden from screen sharing and recordings, whatever the overlays' setting.
//!
//! Like an overlay it is hidden, never closed, once built (platform::exit_now).

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::overlay::{Frame, frame_of, move_to, overlap, same_frame};

/// An overlay moved out from under the panel: where it was, and where it was put.
struct Moved {
    label: String,
    layout: Option<String>,
    from: Frame,
    to: Frame,
}

/// Overlays moved out from under the panel, to go back when it closes. The lock is never held
/// while a window moves: a move can wait on the main thread, which remembers frames (`home_of`).
static MOVED: Mutex<Vec<Moved>> = Mutex::new(Vec::new());

/// Where an overlay goes so the panel doesn't cover it: just to its left, the same size and
/// height. None when it isn't under the panel, or when it wouldn't fit left of it on the display
/// whose left edge is `left` (a strip as wide as the display).
pub fn clear_of(overlay: Frame, panel: Frame, left: f64) -> Option<Frame> {
    if !overlap(overlay, panel) {
        return None;
    }
    let x = panel.x - overlay.width - GAP;
    (x >= left).then_some(Frame { x, ..overlay })
}

/// Moves any overlay under the open panel (the Timeline's side rail, D, most of all) to just its
/// left, remembering where it was. `panel` is the panel's frame when just set (the window may not
/// report it yet). A strip is left alone: it keeps to its edge.
pub fn keep_clear(app: &AppHandle, panel: Option<Frame>) {
    if panel.is_none() && !is_open(app) {
        return;
    }
    let Some(panel) = panel.or_else(|| app.get_webview_window(LABEL).and_then(|w| frame_of(&w)))
    else {
        return;
    };
    for (label, window) in app.webview_windows() {
        if !label.starts_with(crate::overlay::LABEL_PREFIX) {
            continue;
        }
        let (layout, strip) = crate::overlay::layout_now(app, &label);
        if strip {
            continue;
        }
        let Some(now) = frame_of(&window) else {
            continue;
        };
        let left = crate::overlay::current_area(&window, crate::overlay::Against::WorkArea)
            .map_or(f64::MIN, |a| a.x);
        if let Some(clear) = clear_of(now, panel, left) {
            log::debug!("{label}: moved out from under the control panel");
            {
                let mut moved = MOVED.lock().unwrap();
                moved.retain(|m| m.label != label);
                moved.push(Moved {
                    label: label.clone(),
                    layout,
                    from: now,
                    to: clear,
                });
            }
            move_to(&window, clear);
        }
    }
}

/// Where an overlay at `now` belongs: where it was pushed from, while it sits where the panel
/// pushed it. Remembered frames use this, so a place is never saved as the pushed-aside one.
pub fn home_of(label: &str, now: Frame) -> Frame {
    MOVED
        .lock()
        .unwrap()
        .iter()
        .find(|m| m.label == label && same_frame(m.to, now))
        .map_or(now, |m| m.from)
}

/// Forgets where an overlay was pushed from (its style changed: the new one has its own place).
pub fn forget(label: &str) {
    MOVED.lock().unwrap().retain(|m| m.label != label);
}

/// Puts the overlays the panel pushed aside back where they were: each one still in the style it
/// was pushed in and where it was put (one the presenter has since dragged stays where they left it).
fn put_back(app: &AppHandle) {
    let moved = std::mem::take(&mut *MOVED.lock().unwrap());
    for m in moved {
        let Some(window) = app.get_webview_window(&m.label) else {
            continue;
        };
        let (layout, _) = crate::overlay::layout_now(app, &m.label);
        if layout == m.layout && frame_of(&window).is_some_and(|f| same_frame(f, m.to)) {
            move_to(&window, m.from);
        }
    }
}

/// The window's label. Same as `CONTROL_PANEL_LABEL` in src/lib/windows.ts.
pub const LABEL: &str = "control-panel";

/// Sent to the manager when the panel changes how the overlays look: `{ key, value }`. The
/// manager owns the saved settings. Same name as `CONTROL_PANEL_LOOK_EVENT` in src/lib/settings/overlays.ts.
pub const LOOK_EVENT: &str = "control-panel-look";

/// The panel's width, and its gap from the screen's edges, in logical pixels.
pub const WIDTH: f64 = 330.0;
const GAP: f64 = 8.0;

/// Where the panel goes on a display's work area: against its right edge, full height.
pub fn frame_in(area: crate::overlay::Area) -> crate::overlay::Frame {
    crate::overlay::Frame {
        x: area.x + area.width - WIDTH - GAP,
        y: area.y + GAP,
        width: WIDTH,
        height: (area.height - 2.0 * GAP).max(200.0),
    }
}

/// The work area of the display the pointer is on (where the presenter is), or the primary one.
fn display_here(app: &AppHandle) -> Option<crate::overlay::Area> {
    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())?;
    let scale = monitor.scale_factor();
    let work = monitor.work_area();
    Some(crate::overlay::Area {
        x: work.position.x as f64 / scale,
        y: work.position.y as f64 / scale,
        width: work.size.width as f64 / scale,
        height: work.size.height as f64 / scale,
    })
}

/// Whether the panel is on screen now.
pub fn is_open(app: &AppHandle) -> bool {
    app.get_webview_window(LABEL)
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

/// Shows the panel at the right edge of the display the pointer is on, building it the first time.
pub fn open(app: &AppHandle) -> Result<(), String> {
    let frame = display_here(app).map(frame_in);
    if let Some(window) = app.get_webview_window(LABEL) {
        if let Some(f) = frame {
            let _ = window.set_size(tauri::LogicalSize::new(f.width, f.height));
            let _ = window.set_position(tauri::LogicalPosition::new(f.x, f.y));
        }
        // Showing a panel doesn't make it key, so the slides keep focus (ADR 0002).
        window.show().map_err(|e| e.to_string())?;
        crate::platform::raise(&window);
        keep_clear(app, frame);
        crate::state::resync(app, LABEL);
        let _ = app.emit(OPEN_EVENT, true);
        return Ok(());
    }
    let mut builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Oversay control panel")
        .inner_size(WIDTH, 700.0)
        .decorations(false)
        .shadow(true)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .skip_taskbar(true)
        .resizable(false)
        .visible(false)
        // Never in a screen share or recording (NSWindow.sharingType = .none, WDA_EXCLUDEFROMCAPTURE).
        .content_protected(true);
    if let Some(f) = frame {
        builder = builder.inner_size(f.width, f.height).position(f.x, f.y);
    }
    let window = builder.build().map_err(|e| e.to_string())?;
    crate::platform::float_over_fullscreen(&window).map_err(|e| e.to_string())?;
    keep_clear(app, frame);
    let _ = app.emit(OPEN_EVENT, true);
    Ok(())
}

/// Hides the panel.
pub fn close(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LABEL) {
        window.hide().map_err(|e| e.to_string())?;
    }
    // Here, not by the panel's page: a hidden page can miss the event (channel.ts).
    crate::session::end_preview(app);
    put_back(app);
    let _ = app.emit(OPEN_EVENT, false);
    Ok(())
}

/// Broadcast to every window when the panel opens (`true`) or closes (`false`): the Timeline's
/// side rail moves out of its way. Same name as `CONTROL_PANEL_OPEN_EVENT` in src/lib/windows.ts.
pub const OPEN_EVENT: &str = "control-panel-open";

/// Opens the panel, or closes it when it is open (the hotkey and the menus).
pub fn toggle(app: &AppHandle) -> Result<(), String> {
    if is_open(app) { close(app) } else { open(app) }
}

#[tauri::command]
pub async fn control_panel_toggle(app: AppHandle) -> Result<(), String> {
    toggle(&app)
}

#[tauri::command]
pub async fn control_panel_close(app: AppHandle) -> Result<(), String> {
    close(&app)
}

/// The panel changed one setting of the overlays' look; the manager saves it and every overlay follows.
#[tauri::command]
pub async fn control_panel_look(
    app: AppHandle,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    app.emit_to(
        crate::MANAGER_LABEL,
        LOOK_EVENT,
        serde_json::json!({ "key": key, "value": value }),
    )
    .map_err(|e| format!("Look not changed: {e}"))
}

/// Opens the main window from the panel.
#[tauri::command]
pub async fn control_panel_show_manager(app: AppHandle) -> Result<(), String> {
    crate::tray::show_manager(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::overlay::Area;

    #[test]
    fn docks_to_the_right_edge_full_height() {
        let f = frame_in(Area {
            x: 0.0,
            y: 25.0,
            width: 1440.0,
            height: 875.0,
        });
        assert_eq!((f.x, f.y, f.width, f.height), (1102.0, 33.0, 330.0, 859.0));
        // A second display to the right.
        let g = frame_in(Area {
            x: 1440.0,
            y: 0.0,
            width: 1920.0,
            height: 1080.0,
        });
        assert_eq!(g.x + g.width + 8.0, 3360.0);
    }

    #[test]
    fn an_overlay_under_the_panel_moves_just_left_of_it() {
        let panel = Frame {
            x: 1102.0,
            y: 33.0,
            width: 330.0,
            height: 859.0,
        };
        // The side rail (D) at the right edge.
        let rail = Frame {
            x: 1340.0,
            y: 100.0,
            width: 76.0,
            height: 600.0,
        };
        let moved = clear_of(rail, panel, 0.0).unwrap();
        assert_eq!(
            (moved.x, moved.y, moved.width, moved.height),
            (1018.0, 100.0, 76.0, 600.0)
        );
        // Talking Points top left is left alone.
        let tp = Frame {
            x: 24.0,
            y: 48.0,
            width: 360.0,
            height: 290.0,
        };
        assert!(clear_of(tp, panel, 0.0).is_none());
        // A card too wide to fit left of the panel stays where it is.
        let wide = Frame {
            x: 200.0,
            y: 700.0,
            width: 1200.0,
            height: 120.0,
        };
        assert!(clear_of(wide, panel, 0.0).is_none());
    }

    #[test]
    fn names_match_the_frontend() {
        // Same names as src/lib/windows.ts and src/lib/settings/overlays.ts (tested there too).
        assert_eq!(LABEL, "control-panel");
        assert_eq!(LOOK_EVENT, "control-panel-look");
        assert_eq!(OPEN_EVENT, "control-panel-open");
    }
}
