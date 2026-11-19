//! The Look card (ADR 0051, superseding ADR 0028's full-height Control Panel): a small card at
//! the top of the right edge with what is judged by eye against a slide: Opacity with See-through
//! / Solid, Dark / Light, and Hide from screen sharing. The run, the keys and the app are in the
//! menu-bar / tray menu (`tray_menu.rs`). It is a non-activating panel like the overlays (ADR 0002),
//! so clicking it never takes focus from the slides, and it is always hidden from screen sharing
//! and recordings, whatever the overlays' setting.
//!
//! Like an overlay it is hidden, never closed, once built (platform::exit_now).

use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// The window's label. Same as `CONTROL_PANEL_LABEL` in src/lib/windows.ts.
pub const LABEL: &str = "control-panel";

/// Sent to the manager when the panel changes how the overlays look: `{ key, value }`. The
/// manager owns the saved settings. Same name as `CONTROL_PANEL_LOOK_EVENT` in src/lib/settings/overlays.ts.
pub const LOOK_EVENT: &str = "control-panel-look";

/// The card's width, its height until the page says how tall it is, and its gap from the
/// screen's edges, in logical pixels.
pub const WIDTH: f64 = 286.0;
const FIRST_HEIGHT: f64 = 320.0;
const GAP: f64 = 8.0;

/// Where the card goes on a display's work area: at the top of its right edge.
pub fn frame_in(area: crate::overlay::Area, height: f64) -> crate::overlay::Frame {
    crate::overlay::Frame {
        x: area.x + area.width - WIDTH - GAP,
        y: area.y + GAP,
        width: WIDTH,
        height: height.clamp(120.0, (area.height - 2.0 * GAP).max(120.0)),
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

/// The height the card was last fitted to, so it opens at it.
static HEIGHT: std::sync::Mutex<f64> = std::sync::Mutex::new(FIRST_HEIGHT);

/// Shows the card at the top right of the display the pointer is on, building it the first time.
pub fn open(app: &AppHandle) -> Result<(), String> {
    let frame = display_here(app).map(|a| frame_in(a, *HEIGHT.lock().unwrap()));
    if let Some(window) = app.get_webview_window(LABEL) {
        if let Some(f) = frame {
            let _ = window.set_size(tauri::LogicalSize::new(f.width, f.height));
            let _ = window.set_position(tauri::LogicalPosition::new(f.x, f.y));
        }
        // Showing a panel doesn't make it key, so the slides keep focus (ADR 0002).
        window.show().map_err(|e| e.to_string())?;
        crate::platform::raise(&window);
        crate::state::resync(app, LABEL);
        opened(app, true);
        return Ok(());
    }
    let mut builder = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .title("Oversay Look")
        .inner_size(WIDTH, FIRST_HEIGHT)
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
    opened(app, true);
    Ok(())
}

/// Says the card opened or closed: to its page (which starts the preview) and to the menu,
/// whose Look panel item is ticked while it is open.
fn opened(app: &AppHandle, open: bool) {
    log::debug!(
        "look_card.{} check=control-panel-v2",
        if open { "opened" } else { "closed" }
    );
    let _ = app.emit(OPEN_EVENT, open);
    crate::tray::refresh(app);
}

/// Hides the card.
pub fn close(app: &AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LABEL) {
        window.hide().map_err(|e| e.to_string())?;
    }
    // Here, not by the card's page: a hidden page can miss the event (channel.ts).
    crate::session::end_preview(app);
    opened(app, false);
    Ok(())
}

/// Broadcast to every window when the card opens (`true`) or closes (`false`): its page starts or
/// stops the preview. Same name as `CONTROL_PANEL_OPEN_EVENT` in src/lib/windows.ts.
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

/// The card is as tall as what it shows: it keeps its top right corner and takes `height`.
#[tauri::command]
pub async fn control_panel_fit(app: AppHandle, height: f64) -> Result<(), String> {
    if !height.is_finite() {
        return Err("Not a height.".into());
    }
    if std::mem::replace(&mut *HEIGHT.lock().unwrap(), height) == height {
        return Ok(());
    }
    let Some(window) = app.get_webview_window(LABEL) else {
        return Ok(());
    };
    let Some(area) = crate::overlay::current_area(&window) else {
        return Ok(());
    };
    let f = frame_in(area, height);
    window
        .set_size(tauri::LogicalSize::new(f.width, f.height))
        .and_then(|()| window.set_position(tauri::LogicalPosition::new(f.x, f.y)))
        .map_err(|e| e.to_string())
}

/// The card changed one setting of the overlays' look; the manager saves it and every overlay follows.
#[tauri::command]
pub async fn control_panel_look(
    app: AppHandle,
    key: String,
    value: serde_json::Value,
) -> Result<(), String> {
    look_change(&app, &key, value)
}

/// One change to the look, from the card or the menu: the manager owns the saved settings.
pub fn look_change(app: &AppHandle, key: &str, value: serde_json::Value) -> Result<(), String> {
    app.emit_to(
        crate::MANAGER_LABEL,
        LOOK_EVENT,
        serde_json::json!({ "key": key, "value": value }),
    )
    .map_err(|e| format!("Look not changed: {e}"))
}

/// Opens the main window from the card.
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
    fn the_card_sits_at_the_top_of_the_right_edge() {
        let f = frame_in(
            Area {
                x: 0.0,
                y: 25.0,
                width: 1440.0,
                height: 875.0,
            },
            300.0,
        );
        assert_eq!((f.x, f.y, f.width, f.height), (1146.0, 33.0, 286.0, 300.0));
        // A second display to the right.
        let g = frame_in(
            Area {
                x: 1440.0,
                y: 0.0,
                width: 1920.0,
                height: 1080.0,
            },
            300.0,
        );
        assert_eq!(g.x + g.width + 8.0, 3360.0);
        // Never taller than the display, never a sliver.
        let short = Area {
            x: 0.0,
            y: 0.0,
            width: 800.0,
            height: 200.0,
        };
        assert_eq!(frame_in(short, 900.0).height, 184.0);
        assert_eq!(frame_in(short, 10.0).height, 120.0);
    }

    #[test]
    fn names_match_the_frontend() {
        // Same names as src/lib/windows.ts and src/lib/settings/overlays.ts (tested there too).
        assert_eq!(LABEL, "control-panel");
        assert_eq!(LOOK_EVENT, "control-panel-look");
        assert_eq!(OPEN_EVENT, "control-panel-open");
    }
}
