//! The little platform-specific code Tauri doesn't cover: overlay windows, and moving files
//! to the Trash.

use tauri::{AppHandle, WebviewWindow};

#[cfg(target_os = "macos")]
tauri_nspanel::tauri_panel! {
    panel!(OverlayPanel {
        config: {
            can_become_key_window: true,
            is_floating_panel: true
        }
    })
}

/// Debug builds on a Mac: writes every Objective-C exception to the log as it is thrown. One
/// that reaches Rust code aborts the app with only "Rust cannot catch foreign exceptions", and
/// crash reports don't say which exception it was; this does.
pub fn log_native_exceptions() {
    #[cfg(all(target_os = "macos", debug_assertions))]
    {
        use objc2::runtime::AnyObject;
        use objc2::{msg_send, rc::Retained};
        use objc2_foundation::NSString;

        type Preprocessor = extern "C" fn(*mut AnyObject) -> *mut AnyObject;
        unsafe extern "C" {
            fn objc_setExceptionPreprocessor(f: Option<Preprocessor>) -> Option<Preprocessor>;
        }
        extern "C" fn describe(exception: *mut AnyObject) -> *mut AnyObject {
            // SAFETY: the runtime passes a live exception object; `description` is on NSObject.
            if let Some(e) = unsafe { exception.as_ref() } {
                let text: Option<Retained<NSString>> = unsafe { msg_send![e, description] };
                let name: Option<Retained<NSString>> = unsafe { msg_send![e, name] };
                log::error!(
                    "native exception {}: {}",
                    name.map(|n| n.to_string()).unwrap_or_default(),
                    text.map(|t| t.to_string()).unwrap_or_default()
                );
            }
            exception
        }
        // SAFETY: installs a C callback with the signature the runtime expects.
        unsafe {
            objc_setExceptionPreprocessor(Some(describe));
        }
    }
}

/// Registers the platform plugins overlays need.
pub fn init<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());
    builder
}

/// Sets up a newly built, still hidden overlay so it appears over full-screen
/// apps, then shows it.
///
/// macOS only shows another app's windows inside a full-screen Space if they
/// are non-activating panels, so the overlay's NSWindow becomes an NSPanel that
/// joins all Spaces as a full-screen auxiliary at the status level. Clicking it
/// doesn't take focus from the presenting app. The conversion must happen
/// before the window is first shown: AppKit (e.g. the Touch Bar) attaches
/// observers to visible windows, and changing the class afterwards crashes when
/// they are removed. Elsewhere the window is just shown: Windows overlays
/// already stay above full-screen apps.
pub fn float_over_fullscreen(window: &WebviewWindow) -> tauri::Result<()> {
    #[cfg(target_os = "macos")]
    {
        let target = window.clone();
        window.run_on_main_thread(move || {
            let label = target.label().to_string();
            log::debug!("{label}: panel setup");
            // An AppKit exception here can't unwind through Rust and would abort the whole app
            // (006/02: "Rust cannot catch foreign exceptions"). Catch it, log what AppKit said,
            // and show the overlay as a plain window instead.
            let setup = std::panic::AssertUnwindSafe(|| make_panel_and_show(&target));
            if let Err(exception) = objc2::exception::catch(setup) {
                log::error!("{label}: panel setup failed: {exception:?}");
                let _ = target.show();
            }
            log::debug!("{label}: panel setup done");
        })?;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    window.show()
}

/// Brings a shown overlay in front of the other overlays without taking focus from the presenting
/// app (orderFrontRegardless on the panel; `show` would make it key). Elsewhere it is only shown
/// again, which may not bring an overlay that is already showing to the front.
pub fn raise(window: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        use tauri::Manager;
        use tauri_nspanel::ManagerExt;
        let app = window.app_handle().clone();
        let label = window.label().to_string();
        let _ = window.run_on_main_thread(move || match app.get_webview_panel(&label) {
            Ok(panel) => panel.order_front_regardless(),
            Err(e) => log::warn!("{label}: not raised: {e:?}"),
        });
    }
    #[cfg(not(target_os = "macos"))]
    if let Err(e) = window.show() {
        log::warn!("{}: not raised: {e}", window.label());
    }
}

/// Turns the overlay into a non-activating panel on every Space, at the status level, and shows it.
#[cfg(target_os = "macos")]
fn make_panel_and_show(target: &WebviewWindow) {
    use tauri_nspanel::{CollectionBehavior, PanelLevel, StyleMask, WebviewWindowExt};

    let panel = match target.to_panel::<OverlayPanel>() {
        Ok(panel) => panel,
        Err(e) => {
            log::warn!("{}: not converted to a panel: {e}", target.label());
            let _ = target.show();
            return;
        }
    };
    if let Err(e) = panel.add_style_mask(StyleMask::empty().nonactivating_panel().into()) {
        log::warn!("{}: not made non-activating: {e:?}", target.label());
    }
    panel.set_collection_behavior(
        CollectionBehavior::new()
            .can_join_all_spaces()
            .full_screen_auxiliary()
            .into(),
    );
    panel.set_level(PanelLevel::Status.value());
    if let Err(e) = target.show() {
        log::warn!("{}: not shown: {e}", target.label());
    }
}

/// Bounds of the built-in (laptop) display in logical points, if there is one.
/// Only macOS can tell; elsewhere this returns `None` and callers use the
/// primary display.
pub fn builtin_display_area() -> Option<crate::overlay::Area> {
    #[cfg(target_os = "macos")]
    {
        use objc2_core_graphics::{
            CGDisplayBounds, CGDisplayIsBuiltin, CGError, CGGetActiveDisplayList,
        };

        let mut ids = [0u32; 16];
        let mut count = 0u32;
        // SAFETY: both pointers are valid for the lengths passed.
        let status =
            unsafe { CGGetActiveDisplayList(ids.len() as u32, ids.as_mut_ptr(), &mut count) };
        if status != CGError::Success {
            return None;
        }
        // CoreGraphics global bounds use the same top-left-origin points as Tauri.
        ids[..count as usize]
            .iter()
            .find(|&&id| CGDisplayIsBuiltin(id))
            .map(|&id| {
                let bounds = CGDisplayBounds(id);
                crate::overlay::Area {
                    x: bounds.origin.x,
                    y: bounds.origin.y,
                    width: bounds.size.width,
                    height: bounds.size.height,
                }
            })
    }
    #[cfg(not(target_os = "macos"))]
    None
}

/// Quits without tearing the windows down one by one. On a Mac an overlay is a panel made by
/// changing its window's class after the webview, and later AppKit (the Touch Bar), registered
/// key-value observers on it; destroying it then fails to remove one set or the other
/// (NSRangeException "Cannot remove an observer … because it is not registered as an
/// observer") and aborts the app. Overlays are therefore hidden, never closed, while the app
/// runs (`overlay::close_overlay`), and quitting saves the window positions and ends the process.
pub fn exit_now(app: &AppHandle) -> ! {
    use tauri_plugin_window_state::{AppHandleExt, StateFlags};
    if let Err(e) =
        app.save_window_state(StateFlags::POSITION | StateFlags::SIZE | StateFlags::MAXIMIZED)
    {
        log::warn!("window positions not saved: {e}");
    }
    log::info!("quitting");
    std::process::exit(0)
}

/// Starts Oversay again and ends this copy, after an update replaced it. Like `exit_now` it
/// skips the windows' clean-up, which crashes a Mac (see there).
pub fn restart_now(app: &AppHandle) -> ! {
    use tauri::Manager;
    use tauri_plugin_window_state::{AppHandleExt, StateFlags};
    let _ = app.save_window_state(StateFlags::POSITION | StateFlags::SIZE | StateFlags::MAXIMIZED);
    log::info!("restarting after an update");
    tauri::process::restart(&app.env())
}

/// Sets the text beside the icon in the menu bar on a Mac (`set_title` works there only); the
/// Windows tray has no room for text, so the time goes in its tooltip (`tray::refresh`).
pub fn set_tray_title(tray: &tauri::tray::TrayIcon, text: &str) {
    #[cfg(target_os = "macos")]
    if let Err(e) = tray.set_title(Some(text)) {
        log::warn!("icon title not set: {e}");
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (tray, text);
}

/// The session's icon: the one-colour app icon. On a Mac it is a template image, which
/// macOS draws black or white to suit the menu bar (`TrayIconBuilder::icon_as_template`). Windows
/// doesn't recolour tray icons, so it is white on a dark taskbar and black on a light one, by the
/// system theme at the moment the icon is set.
pub fn tray_icon() -> tauri::Result<tauri::image::Image<'static>> {
    #[cfg(windows)]
    if !taskbar_is_light() {
        return tauri::image::Image::from_bytes(include_bytes!("../icons/tray-white.png"));
    }
    tauri::image::Image::from_bytes(include_bytes!("../icons/tray-black.png"))
}

/// Whether the icon's glyph should be white. A Mac's plain icon is a template image macOS colours
/// itself; with a dot it is drawn in colour, white on a dark menu bar, which follows the system's
/// appearance (not Oversay's own, which `set_theme` may override), so it is read only then
/// (`coloured`). On Windows the icon is white on a dark taskbar, read every time so the icon
/// follows a change of taskbar theme.
#[cfg(target_os = "macos")]
pub fn tray_glyph_is_white(coloured: bool) -> bool {
    coloured && system_is_dark()
}

#[cfg(windows)]
pub fn tray_glyph_is_white(_coloured: bool) -> bool {
    !taskbar_is_light()
}

#[cfg(not(any(target_os = "macos", windows)))]
pub fn tray_glyph_is_white(_coloured: bool) -> bool {
    false
}

/// Whether macOS is in Dark Mode: the global `AppleInterfaceStyle` default is "Dark".
#[cfg(target_os = "macos")]
fn system_is_dark() -> bool {
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send};
    use objc2_foundation::NSString;
    let key = NSString::from_str("AppleInterfaceStyle");
    let dark = NSString::from_str("Dark");
    // SAFETY: plain NSUserDefaults reads; `stringForKey:` returns nil when the key is unset (Light).
    unsafe {
        let defaults: *mut AnyObject = msg_send![class!(NSUserDefaults), standardUserDefaults];
        let value: *mut AnyObject = msg_send![defaults, stringForKey: &*key];
        !value.is_null() && msg_send![value, isEqualToString: &*dark]
    }
}

/// Whether the taskbar is light: Settings › Personalisation › Colours › "Choose your default
/// Windows mode", which can differ from the apps' mode. Dark when it can't be read.
#[cfg(windows)]
fn taskbar_is_light() -> bool {
    use windows::Win32::System::Registry::{HKEY_CURRENT_USER, RRF_RT_REG_DWORD, RegGetValueW};
    use windows::core::w;
    let mut value: u32 = 0;
    let mut size = std::mem::size_of::<u32>() as u32;
    // SAFETY: the value is a DWORD (RRF_RT_REG_DWORD refuses any other type) written into
    // `value`, whose size is passed in `size`.
    let result = unsafe {
        RegGetValueW(
            HKEY_CURRENT_USER,
            w!(r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"),
            w!("SystemUsesLightTheme"),
            RRF_RT_REG_DWORD,
            None,
            Some(std::ptr::from_mut(&mut value).cast()),
            Some(&mut size),
        )
    };
    result.is_ok() && value == 1
}

/// Moves a file or folder to the system Trash (ADR 0015). On a Mac, through the system's
/// file manager rather than Finder (the crate's default): Finder refuses
/// items in an iCloud-synced Documents folder that aren't fully downloaded. The trade-off is
/// that Finder's "Put Back" isn't offered; the item can still be dragged out of the Trash.
pub fn move_to_trash(path: &std::path::Path) -> Result<(), trash::Error> {
    #[cfg(target_os = "macos")]
    {
        use trash::macos::{DeleteMethod, TrashContextExtMacos};
        let mut trash = trash::TrashContext::default();
        trash.set_delete_method(DeleteMethod::NsFileManager);
        trash.delete(path)
    }
    #[cfg(not(target_os = "macos"))]
    trash::delete(path)
}

/// The argument the taskbar button's "Control panel" task starts the app with (Windows).
pub const CONTROL_PANEL_ARG: &str = "--control-panel";

/// `Oversay --check` prints to the terminal it was run from. A Windows release build is a GUI app
/// with no console of its own, so it borrows its parent's; elsewhere there is nothing to do.
pub fn attach_console() {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::System::Console::{ATTACH_PARENT_PROCESS, AttachConsole};
        let _ = AttachConsole(ATTACH_PARENT_PROCESS);
    }
}

/// Registers the platform plugins that must come first: on Windows, one running app, which gets
/// a second launch's arguments (the jump list's task) and opens the control panel for it.
pub fn single_instance(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    #[cfg(windows)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
        let action = if args.iter().any(|a| a == CONTROL_PANEL_ARG) {
            crate::session::Action::TogglePanel
        } else {
            crate::session::Action::ShowManager
        };
        let app = app.clone();
        if let Err(e) = crate::session::act(&app, action) {
            log::warn!("second launch: {e}");
        }
    }));
    builder
}

/// Puts "Control panel" in the taskbar button's right-click menu (its jump list, under Tasks) on
/// Windows (ADR 0028): a task that starts the app with `CONTROL_PANEL_ARG`. Elsewhere nothing.
pub fn install_jump_list(app: &AppHandle) {
    #[cfg(windows)]
    {
        let _ = app.run_on_main_thread(|| {
            if let Err(e) = jump_list() {
                log::warn!("jump list not set: {e}");
            }
        });
    }
    #[cfg(not(windows))]
    let _ = app;
}

#[cfg(windows)]
fn jump_list() -> windows::core::Result<()> {
    use windows::Win32::Storage::EnhancedStorage::PKEY_Title;
    use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
    use windows::Win32::System::Com::{CLSCTX_INPROC_SERVER, CoCreateInstance};
    use windows::Win32::UI::Shell::Common::{IObjectArray, IObjectCollection};
    use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
    use windows::Win32::UI::Shell::{
        DestinationList, EnumerableObjectCollection, ICustomDestinationList, IShellLinkW, ShellLink,
    };
    use windows::core::{HSTRING, Interface};

    let exe = std::env::current_exe()
        .map_err(|_| windows::core::Error::from_hresult(windows::Win32::Foundation::E_FAIL))?;
    let title = "Control panel";
    // SAFETY: COM calls on the main thread, where the webview has already initialised COM.
    unsafe {
        let list: ICustomDestinationList =
            CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER)?;
        let mut slots = 0u32;
        let _removed: IObjectArray = list.BeginList(&mut slots)?;
        let tasks: IObjectCollection =
            CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        link.SetPath(&HSTRING::from(exe.as_os_str()))?;
        link.SetArguments(&HSTRING::from(CONTROL_PANEL_ARG))?;
        link.SetDescription(&HSTRING::from(title))?;
        let store: IPropertyStore = link.cast()?;
        store.SetValue(&PKEY_Title, &PROPVARIANT::from(title))?;
        store.Commit()?;
        tasks.AddObject(&link)?;
        list.AddUserTasks(&tasks.cast::<IObjectArray>()?)?;
        list.CommitList()?;
    }
    Ok(())
}

/// Puts Oversay's own Undo and Redo in the Mac's Edit menu, in place of the standard two of
/// Tauri's default menu (ADR 0052, edit_menu.rs): the standard ones can only undo what a field
/// holds, and send the page nothing when that is nothing. Elsewhere there is no menu bar.
pub fn install_edit_menu(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    match edit_menu::install(app) {
        Ok(true) => log::debug!("menu.edit_installed check=epic-043/V5"),
        Ok(false) => log::warn!("Edit menu not found: undo and redo stay the standard ones"),
        Err(e) => log::warn!("Edit menu not changed: {e}"),
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

/// Enables or greys Edit > Undo and Redo.
pub fn enable_edit_menu(undo: bool, redo: bool) {
    #[cfg(target_os = "macos")]
    if let Err(e) = edit_menu::enable(undo, redo) {
        log::warn!("Edit menu not updated: {e}");
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (undo, redo);
}

/// What the standard Edit > Undo or Redo does: sends `undo:` or `redo:` to whatever has focus.
pub fn send_native_undo(app: &AppHandle, redo: bool) {
    #[cfg(target_os = "macos")]
    {
        let _ = app.run_on_main_thread(move || {
            let send = std::panic::AssertUnwindSafe(|| edit_menu::send(redo));
            if let Err(exception) = objc2::exception::catch(send) {
                log::error!("undo not sent: {exception:?}");
            }
        });
    }
    #[cfg(not(target_os = "macos"))]
    let _ = (app, redo);
}

#[cfg(target_os = "macos")]
mod edit_menu {
    use crate::edit_menu::{REDO_ID, UNDO_ID};
    use objc2::runtime::AnyObject;
    use objc2::{class, msg_send, sel};
    use std::sync::OnceLock;
    use tauri::menu::{MenuItem, Submenu};
    use tauri::{AppHandle, Wry};

    /// Undo and Redo, once they are in the menu.
    static ITEMS: OnceLock<[MenuItem<Wry>; 2]> = OnceLock::new();

    fn submenu(app: &AppHandle) -> tauri::Result<Option<Submenu<Wry>>> {
        let Some(menu) = app.menu() else {
            return Ok(None);
        };
        for item in menu.items()? {
            if let Some(submenu) = item.as_submenu()
                && submenu.text()? == "Edit"
            {
                return Ok(Some(submenu.clone()));
            }
        }
        Ok(None)
    }

    /// False when the default menu has no Edit submenu to change.
    pub fn install(app: &AppHandle) -> tauri::Result<bool> {
        let Some(edit) = submenu(app)? else {
            return Ok(false);
        };
        let undo = MenuItem::with_id(app, UNDO_ID, "Undo", true, Some("CmdOrCtrl+Z"))?;
        let redo = MenuItem::with_id(app, REDO_ID, "Redo", true, Some("CmdOrCtrl+Shift+Z"))?;
        // The default menu's Edit starts with its own Undo and Redo.
        edit.remove_at(0)?;
        edit.remove_at(0)?;
        edit.insert(&undo, 0)?;
        edit.insert(&redo, 1)?;
        let _ = ITEMS.set([undo, redo]);
        Ok(true)
    }

    pub fn enable(undo: bool, redo: bool) -> tauri::Result<()> {
        if let Some(items) = ITEMS.get() {
            for (item, on) in items.iter().zip([undo, redo]) {
                item.set_enabled(on)?;
            }
        }
        Ok(())
    }

    pub fn send(redo: bool) {
        let action = if redo { sel!(redo:) } else { sel!(undo:) };
        let nil: *mut AnyObject = std::ptr::null_mut();
        // SAFETY: a plain AppKit message on the main thread; with no target the action goes
        // to the first responder that takes it.
        unsafe {
            let ns_app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
            let _: bool = msg_send![ns_app, sendAction: action, to: nil, from: nil];
        }
    }
}

/// Puts "Control panel" in the Dock icon's right-click menu (ADR 0028, ADR 0051), so the card opens with
/// nothing running and without the menu bar. Tauri has no Dock menu, so the app delegate (tao's)
/// gets `applicationDockMenu:` and the item's action added at run time. Elsewhere nothing: the
/// taskbar button's menu is `windows_jump_list`.
pub fn install_dock_menu(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        let handle = app.clone();
        let _ = app.run_on_main_thread(move || {
            let _ = dock::APP.set(handle);
            let setup = std::panic::AssertUnwindSafe(dock::install);
            if let Err(exception) = objc2::exception::catch(setup) {
                log::error!("Dock menu not added: {exception:?}");
            }
        });
    }
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

#[cfg(target_os = "macos")]
mod dock {
    use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
    use objc2::{class, msg_send, sel};
    use objc2_foundation::NSString;
    use std::sync::OnceLock;

    pub static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
    /// The menu, made once and kept for the life of the app (AppKit asks for it on each right-click).
    static MENU: OnceLock<usize> = OnceLock::new();

    extern "C-unwind" fn dock_menu(
        _this: *mut AnyObject,
        _cmd: Sel,
        _app: *mut AnyObject,
    ) -> *mut AnyObject {
        MENU.get()
            .map_or(std::ptr::null_mut(), |p| *p as *mut AnyObject)
    }

    extern "C-unwind" fn toggle_panel(_this: *mut AnyObject, _cmd: Sel, _sender: *mut AnyObject) {
        if let Some(app) = APP.get() {
            log::info!("Dock menu: Control panel");
            if let Err(e) = crate::session::act(app, crate::session::Action::TogglePanel) {
                log::warn!("Dock menu: {e}");
            }
        }
    }

    pub fn install() {
        // SAFETY: plain AppKit messages on the main thread; the two functions match the
        // signatures given with them (`@@:@` returns an object, `v@:@` returns nothing).
        unsafe {
            let ns_app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
            let delegate: *mut AnyObject = msg_send![ns_app, delegate];
            if delegate.is_null() {
                log::warn!("Dock menu not added: no app delegate");
                return;
            }
            let cls = objc2::ffi::object_getClass(delegate) as *mut AnyClass;
            let menu_imp: Imp =
                std::mem::transmute(dock_menu as extern "C-unwind" fn(_, _, _) -> _);
            let action_imp: Imp =
                std::mem::transmute(toggle_panel as extern "C-unwind" fn(_, _, _));
            objc2::ffi::class_replaceMethod(
                cls,
                sel!(applicationDockMenu:),
                menu_imp,
                c"@@:@".as_ptr(),
            );
            objc2::ffi::class_addMethod(
                cls,
                sel!(oversayToggleControlPanel:),
                action_imp,
                c"v@:@".as_ptr(),
            );

            let menu: *mut AnyObject = msg_send![class!(NSMenu), new];
            let title = NSString::from_str("Control panel");
            let key = NSString::from_str("");
            let item: *mut AnyObject = msg_send![class!(NSMenuItem), alloc];
            let item: *mut AnyObject = msg_send![item, initWithTitle: &*title, action: sel!(oversayToggleControlPanel:), keyEquivalent: &*key];
            let _: () = msg_send![item, setTarget: delegate];
            let _: () = msg_send![menu, addItem: item];
            let _ = MENU.set(menu as usize);
        }
        log::debug!("Dock menu added");
    }
}
