//! The Oversay icon in the menu bar (Mac) or the tray (Windows), for the life of the app, and
//! its menu: Menu 1, the flat menu (ADR 0051), drawn from `tray_menu`. The menu drives the run
//! when every window is hidden and another app has focus; each item shows its key.
//!
//! The menu, icon and tooltip are rebuilt from what is true now (`refresh`) whenever the run,
//! the look, the sharing setting, the Look card or the pinned decks change. On a Mac the card's
//! time left is the text beside the icon; Windows has none, so it goes in the tooltip, and the
//! icon gets a dot while a deck runs. Both get an amber dot while the deck widget is visible in
//! screen shares.

use std::sync::Mutex;
use tauri::menu::{
    CheckMenuItem, IsMenuItem, Menu, MenuItem, MenuItemKind, PredefinedMenuItem, Submenu,
};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};

use crate::tray_menu::{self, Choice, Entry, Look, Marks, MenuState, PinnedDeck};

const TRAY_ID: &str = "session";

/// Sent to the manager when a menu item needs it: `{ kind: "settings" | "library" | "deck", id? }`.
/// Same name as `TRAY_EVENT` in src/lib/session/tray.ts.
pub const TRAY_EVENT: &str = "tray-choice";

/// The pinned decks, newest pin first, as the manager last sent them (`set_tray_decks`).
static PINNED: Mutex<Vec<PinnedDeck>> = Mutex::new(Vec::new());
/// The card's time as the manager last set it (`set_tray_title`).
static TITLE: Mutex<String> = Mutex::new(String::new());
/// What the menu, icon and tooltip were last built from: nothing is rebuilt when nothing changed
/// (the opacity slider changes the look many times a second).
static SHOWN: Mutex<Option<Shown>> = Mutex::new(None);

#[derive(Clone, PartialEq)]
struct Shown {
    menu: Vec<Entry>,
    marks: Marks,
    /// The glyph's colour: the menu bar's appearance on a Mac (only read when a dot needs it), the
    /// taskbar's on Windows, so the icon follows a change of either.
    dark: bool,
    tooltip: String,
}

/// A refresh is waiting (`refresh_soon`).
static SOON: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Refreshes once things have settled: the look changes many times a second while a slider
/// moves, and the menu (whose See-through item carries the opacity) needn't be rebuilt each time.
pub fn refresh_soon(app: &AppHandle) {
    if SOON.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(250));
        SOON.store(false, std::sync::atomic::Ordering::SeqCst);
        refresh(&app);
    });
}

/// Everything the menu shows, read now.
fn state(app: &AppHandle) -> MenuState {
    let hub = app.state::<crate::state::StateHub>();
    let (run, keys) = crate::session::menu_run(app);
    MenuState {
        run,
        look: hub
            .get(crate::overlay::SETTINGS_CHANNEL)
            .map_or_else(Look::default, |v| Look::from_settings(&v.value)),
        hidden: crate::overlay::hidden_from_capture(&hub),
        panel_open: crate::control_panel::is_open(app),
        pinned: PINNED.lock().unwrap().clone(),
        keys,
    }
}

/// Rebuilds the menu, icon and tooltip from what is true now, on the main thread (status items
/// belong to it). Puts the icon up the first time.
pub fn refresh(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let s = state(&handle);
        let marks = tray_menu::marks(s.run.as_ref(), s.hidden, cfg!(windows));
        let shown = Shown {
            menu: tray_menu::menu(&s),
            marks,
            dark: crate::platform::tray_glyph_is_white(marks != Marks::default()),
            tooltip: tray_menu::tooltip(s.run.as_ref(), &TITLE.lock().unwrap(), s.hidden),
        };
        let mut last = SHOWN.lock().unwrap();
        if last.as_ref() == Some(&shown) && handle.tray_by_id(TRAY_ID).is_some() {
            return;
        }
        match show(&handle, last.as_ref(), &shown) {
            Ok(()) => *last = Some(shown),
            Err(e) => log::warn!("menu-bar icon not shown: {e}"),
        }
    });
}

/// Puts `shown` on the icon, changing only what differs from `before`.
fn show(app: &AppHandle, before: Option<&Shown>, shown: &Shown) -> tauri::Result<()> {
    let tray = match app.tray_by_id(TRAY_ID) {
        Some(tray) => tray,
        None => build(app)?,
    };
    if before.is_none_or(|b| b.menu != shown.menu) {
        tray.set_menu(Some(build_menu(app, &shown.menu)?))?;
        log::debug!(
            "tray.menu_built items={} check=control-panel-v2",
            shown.menu.len()
        );
    }
    if before.is_none_or(|b| b.marks != shown.marks || b.dark != shown.dark) {
        set_icon(&tray, shown.marks, shown.dark);
        log::debug!(
            "tray.icon_marks running={} shared={} check=control-panel-v2",
            shown.marks.running,
            shown.marks.shared
        );
    }
    if before.is_none_or(|b| b.tooltip != shown.tooltip) {
        tray.set_tooltip(Some(&shown.tooltip))?;
    }
    Ok(())
}

/// Makes the icon. A Mac menu-bar item opens its menu on any click, as Mac users expect; on
/// Windows a left-click opens or closes the Look card and the menu is a right-click.
fn build(app: &AppHandle) -> tauri::Result<tauri::tray::TrayIcon> {
    let menu = Menu::new(app)?;
    let tray = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip("Oversay")
        .show_menu_on_left_click(!cfg!(windows))
        .on_menu_event(|app, event| chosen(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if cfg!(windows)
                && let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
            {
                log::info!("action: tray left-click, Look card");
                let _ = crate::session::act(tray.app_handle(), crate::session::Action::TogglePanel);
            }
        })
        .build(app)?;
    Ok(tray)
}

/// Turns the model into the native menu: check items for every tick (Tauri has no radio items).
fn build_menu(app: &AppHandle, entries: &[Entry]) -> tauri::Result<Menu<Wry>> {
    let items = build_items(app, entries)?;
    let refs: Vec<&dyn IsMenuItem<Wry>> = items.iter().map(|i| i as &dyn IsMenuItem<Wry>).collect();
    Menu::with_items(app, &refs)
}

fn build_items(app: &AppHandle, entries: &[Entry]) -> tauri::Result<Vec<MenuItemKind<Wry>>> {
    let mut items = vec![];
    for (n, entry) in entries.iter().enumerate() {
        items.push(match entry {
            Entry::Separator => MenuItemKind::Predefined(PredefinedMenuItem::separator(app)?),
            Entry::Status(text) => MenuItemKind::MenuItem(MenuItem::with_id(
                app,
                format!("status{n}"),
                text,
                false,
                None::<&str>,
            )?),
            Entry::Item {
                id,
                label,
                key,
                enabled,
            } => MenuItemKind::MenuItem(
                MenuItem::with_id(app, id, label, *enabled, key.as_deref()).or_else(|e| {
                    // A key the menu can't show (one muda doesn't know) is left off; the hotkey still works.
                    log::warn!("menu {id}: key {key:?} not shown: {e}");
                    MenuItem::with_id(app, id, label, *enabled, None::<&str>)
                })?,
            ),
            Entry::Check {
                id,
                label,
                key,
                checked,
                enabled,
            } => MenuItemKind::Check(
                CheckMenuItem::with_id(app, id, label, *enabled, *checked, key.as_deref())
                    .or_else(|e| {
                        log::warn!("menu {id}: key {key:?} not shown: {e}");
                        CheckMenuItem::with_id(app, id, label, *enabled, *checked, None::<&str>)
                    })?,
            ),
            Entry::Submenu { label, entries } => {
                let inner = build_items(app, entries)?;
                let refs: Vec<&dyn IsMenuItem<Wry>> =
                    inner.iter().map(|i| i as &dyn IsMenuItem<Wry>).collect();
                MenuItemKind::Submenu(Submenu::with_items(app, label, true, &refs)?)
            }
        });
    }
    Ok(items)
}

/// A menu item was chosen.
fn chosen(app: &AppHandle, id: &str) {
    let Some(choice) = tray_menu::choice(id) else {
        return;
    };
    log::info!("action: menu {id}");
    log::debug!("tray.chosen id={id} check=control-panel-v2");
    let done = match choice {
        Choice::Action(name) => match crate::hotkeys::action_for(name) {
            Some(action) => crate::session::act(app, action),
            None => Ok(()),
        },
        Choice::Opacity(p) => {
            crate::control_panel::look_change(app, "opacity", serde_json::json!(p))
        }
        Choice::SeeThrough => crate::overlay::change_opacity(app, "see-through"),
        Choice::Solid => crate::overlay::change_opacity(app, "solid"),
        Choice::Panel { light } => crate::control_panel::look_change(
            app,
            "panel",
            serde_json::json!(if light { "light" } else { "dark" }),
        ),
        Choice::ToggleHidden => {
            let hidden =
                crate::overlay::hidden_from_capture(&app.state::<crate::state::StateHub>());
            crate::overlay::hide_from_capture(app, !hidden)
        }
        Choice::ShowDeck(id) => to_manager(app, serde_json::json!({ "kind": "deck", "id": id })),
        Choice::Library => to_manager(app, serde_json::json!({ "kind": "library" })),
        Choice::Settings => to_manager(app, serde_json::json!({ "kind": "settings" })),
        Choice::Quit => {
            quit(app);
            Ok(())
        }
    };
    if let Err(e) = done {
        log::warn!("menu {id}: {e}");
    }
    // A check item ticks or unticks itself when clicked: the menu is drawn again from what is
    // true, even when nothing changed (Solid chosen while solid).
    SHOWN.lock().unwrap().take();
    refresh(app);
}

/// Something only the main window can do: it comes forward and does it.
fn to_manager(app: &AppHandle, choice: serde_json::Value) -> Result<(), String> {
    show_manager(app);
    app.emit_to(crate::MANAGER_LABEL, TRAY_EVENT, choice)
        .map_err(|e| e.to_string())
}

/// Quits; while a deck runs, asks first (the design's Decide screen).
fn quit(app: &AppHandle) {
    let running = crate::session::menu_run(app).0.is_some();
    if !running {
        crate::platform::exit_now(app);
    }
    use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
    let handle = app.clone();
    app.dialog()
        .message("A deck is running. Quitting stops it.")
        .title("Quit Oversay?")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Quit".into(),
            "Cancel".into(),
        ))
        .show(move |quit| {
            if quit {
                crate::platform::exit_now(&handle);
            }
        });
}

/// The amber of the shared dot and the blue of the running dot (the design's colours).
const AMBER: [u8; 3] = [0xf0, 0xa0, 0x20];
const BLUE: [u8; 3] = [0x2b, 0x6b, 0xe4];

/// Paints the marks onto an icon's RGBA pixels: the shared dot top right, the running dot bottom
/// right, each with a clear ring so it reads on any bar. With `white`, the glyph is made white
/// (a coloured icon on a dark Mac menu bar can't be a template image, which macOS would recolour).
pub fn paint(rgba: &mut [u8], width: u32, height: u32, marks: Marks, white: bool) {
    let (w, h) = (width as f64, height as f64);
    let r = (w.min(h) * 0.15).max(2.0);
    let dots: Vec<((f64, f64), [u8; 3])> = [
        (marks.shared, (w - r - 1.0, r + 1.0), AMBER),
        (marks.running, (w - r - 1.0, h - r - 1.0), BLUE),
    ]
    .into_iter()
    .filter(|(on, _, _)| *on)
    .map(|(_, at, colour)| (at, colour))
    .collect();
    for y in 0..height {
        for x in 0..width {
            let i = ((y * width + x) * 4) as usize;
            let (px, py) = (x as f64 + 0.5, y as f64 + 0.5);
            if white && rgba[i + 3] > 0 {
                rgba[i..i + 3].copy_from_slice(&[255, 255, 255]);
            }
            for ((cx, cy), colour) in &dots {
                let d = ((px - cx).powi(2) + (py - cy).powi(2)).sqrt();
                if d <= r {
                    rgba[i..i + 3].copy_from_slice(colour);
                    rgba[i + 3] = 255;
                } else if d <= r + 1.5 {
                    rgba[i + 3] = 0;
                }
            }
        }
    }
}

/// The icon with its marks. Plain, a Mac's is a template image macOS colours for the menu bar;
/// with a dot it is drawn in colour, its glyph white on a dark menu bar.
fn set_icon(tray: &tauri::tray::TrayIcon, marks: Marks, dark: bool) {
    let base = match crate::platform::tray_icon() {
        Ok(icon) => icon,
        Err(e) => {
            log::warn!("one-colour icon not loaded: {e}");
            if let Some(icon) = tray.app_handle().default_window_icon() {
                let _ = tray.set_icon(Some(icon.clone()));
                let _ = tray.set_icon_as_template(false);
            }
            return;
        }
    };
    let plain = marks == Marks::default();
    let icon = if plain {
        base
    } else {
        let mut rgba = base.rgba().to_vec();
        paint(
            &mut rgba,
            base.width(),
            base.height(),
            marks,
            cfg!(target_os = "macos") && dark,
        );
        tauri::image::Image::new_owned(rgba, base.width(), base.height())
    };
    if let Err(e) = tray.set_icon(Some(icon)) {
        log::warn!("icon not set: {e}");
    }
    let _ = tray.set_icon_as_template(plain);
}

/// Brings the main window back, large, from minimised or hidden; the user can minimise it again.
pub fn show_manager(app: &AppHandle) {
    let Some(window) = app.get_webview_window(crate::MANAGER_LABEL) else {
        return;
    };
    let result = window
        .unminimize()
        .and_then(|()| window.show())
        .and_then(|()| window.maximize())
        .and_then(|()| window.set_focus());
    if let Err(e) = result {
        log::warn!("main window not shown: {e}");
    }
}

/// The text beside the icon on a Mac, and the time in its tooltip on Windows: the card's time
/// left, Ready or Paused. The manager sets it every second from the run's clock.
#[tauri::command]
pub async fn set_tray_title(app: AppHandle, title: String) -> Result<(), String> {
    *TITLE.lock().unwrap() = title.clone();
    let handle = app.clone();
    // Only the title and the tooltip change with the clock: the menu and icon follow the run's
    // own changes (`refresh`), not every second.
    app.run_on_main_thread(move || {
        let Some(tray) = handle.tray_by_id(TRAY_ID) else {
            return;
        };
        crate::platform::set_tray_title(&tray, &title);
        let (run, _) = crate::session::menu_run(&handle);
        let hidden = crate::overlay::hidden_from_capture(&handle.state::<crate::state::StateHub>());
        let tooltip = tray_menu::tooltip(run.as_ref(), &title, hidden);
        let mut shown = SHOWN.lock().unwrap();
        if let Some(s) = shown.as_mut().filter(|s| s.tooltip != tooltip) {
            let _ = tray.set_tooltip(Some(&tooltip));
            s.tooltip = tooltip;
        }
    })
    .map_err(|e| e.to_string())
}

/// The pinned decks for Show a deck ▸, newest pin first; the manager sends them when they change.
#[tauri::command]
pub async fn set_tray_decks(app: AppHandle, decks: Vec<PinnedDeck>) -> Result<(), String> {
    *PINNED.lock().unwrap() = decks;
    refresh(&app);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn icon() -> Vec<u8> {
        // A 20 × 20 black glyph filling the icon.
        [0u8, 0, 0, 255].repeat(400)
    }

    fn pixel(rgba: &[u8], x: u32, y: u32) -> [u8; 4] {
        let i = ((y * 20 + x) * 4) as usize;
        rgba[i..i + 4].try_into().unwrap()
    }

    #[test]
    fn a_plain_icon_is_left_alone() {
        let mut rgba = icon();
        paint(&mut rgba, 20, 20, Marks::default(), false);
        assert_eq!(rgba, icon());
    }

    #[test]
    fn the_shared_dot_is_amber_top_right_and_the_running_dot_blue_bottom_right() {
        let mut rgba = icon();
        paint(
            &mut rgba,
            20,
            20,
            Marks {
                running: true,
                shared: true,
            },
            false,
        );
        assert_eq!(pixel(&rgba, 16, 3), [0xf0, 0xa0, 0x20, 255]);
        assert_eq!(pixel(&rgba, 16, 16), [0x2b, 0x6b, 0xe4, 255]);
        // The glyph elsewhere is untouched, and each dot has a clear ring.
        assert_eq!(pixel(&rgba, 3, 10), [0, 0, 0, 255]);
        assert_eq!(pixel(&rgba, 12, 3)[3], 0);
    }

    #[test]
    fn on_a_dark_menu_bar_the_glyph_is_white() {
        let mut rgba = icon();
        paint(
            &mut rgba,
            20,
            20,
            Marks {
                running: false,
                shared: true,
            },
            true,
        );
        assert_eq!(pixel(&rgba, 3, 10), [255, 255, 255, 255]);
        assert_eq!(pixel(&rgba, 16, 3), [0xf0, 0xa0, 0x20, 255]);
    }

    #[test]
    fn names_match_the_frontend() {
        // Same name as TRAY_EVENT in src/lib/session/tray.ts (tested there too).
        assert_eq!(TRAY_EVENT, "tray-choice");
    }
}
