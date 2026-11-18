mod about;
mod check;
mod control_panel;
mod example_decks;
mod files;
mod hotkeys;
mod ids;
mod links;
mod note_lint;
mod overlay;
mod platform;
mod quick;
mod recorder;
mod resources;
mod resources_move;
mod session;
mod session_check;
mod session_files;
mod settings;
mod skill;
mod state;
mod transcriber;
mod tray;
mod updates;
mod workspaces;

use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_window_state::StateFlags;

pub(crate) const MANAGER_LABEL: &str = "manager";

/// `--check <file>`: see check.rs.
pub fn check_from_args() -> Option<i32> {
    check::from_args()
}

pub fn run() {
    platform::init(platform::single_instance(tauri::Builder::default()))
        .manage(state::StateHub::default())
        .manage(overlay::Layouts::default())
        .manage(session::Engine::default())
        .manage(recorder::Recorder::default())
        .manage(updates::Pending::default())
        // oversay:// links (ADR 0032); after the single instance, which hands it a second launch's link.
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        // Opens a third-party component's page in the browser from About; capabilities/default.json limits where.
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::POSITION | StateFlags::SIZE | StateFlags::MAXIMIZED)
                // The Timeline remembers a frame per style itself (overlay::Layouts).
                .with_denylist(&["overlay-timeline", control_panel::LABEL])
                .build(),
        )
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .level_for("oversay_lib", log::LevelFilter::Debug)
                        .build(),
                )?;
            }
            // Only a build given a feed and key checks for updates (ADR 0030, scripts/build-config.mjs).
            // Without them the updater isn't registered, so no request is ever made.
            if app.config().plugins.0.contains_key("updater") {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                log::info!("updates: this build checks for updates");
            }
            platform::log_native_exceptions();
            settings::apply_saved_appearance(app.handle());
            // The icon is there from the start, for the control panel (ADR 0028).
            tray::show_idle(app.handle());
            platform::install_dock_menu(app.handle());
            platform::install_jump_list(app.handle());
            // Files written outside Oversay (an AI, another editor) show up as they land (ADR 0034).
            quick::watch(app.handle());
            // Workspaces made or changed outside Oversay, too (ADR 0040).
            workspaces::watch(app.handle());
            // The skill Oversay installed for Claude Code, Codex or Gemini CLI keeps up with it.
            skill::update_installed(app.handle());
            // Links an AI opens to show a note or open Oversay on it (ADR 0032).
            links::init(app.handle());
            // Started from the jump list's Control panel with the app not yet running.
            if std::env::args().any(|a| a == platform::CONTROL_PANEL_ARG) {
                let _ = session::act(app.handle(), session::Action::TogglePanel);
            }
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Closing the manager quits the app, overlays included: decks save as they are typed,
            // so there is nothing unsaved to ask about (projects, which had Save, are gone: ADR 0039).
            WindowEvent::CloseRequested { .. } if window.label() == MANAGER_LABEL => {
                platform::exit_now(window.app_handle());
            }
            // An overlay is hidden, never closed, while the app runs: destroying one crashes on a
            // Mac (platform::exit_now). This covers its own × button and any other close.
            WindowEvent::CloseRequested { api, .. }
                if window.label().starts_with(overlay::LABEL_PREFIX) =>
            {
                api.prevent_close();
                if let Err(e) = window.hide() {
                    log::warn!("{}: not hidden: {e}", window.label());
                }
                // A shown note's only overlay, or a deck's card: closing it closes the note or deck.
                session::overlay_closed(window.app_handle(), window.label());
            }
            // The control panel is hidden, never closed, like an overlay.
            WindowEvent::CloseRequested { api, .. } if window.label() == control_panel::LABEL => {
                api.prevent_close();
                if let Err(e) = control_panel::close(window.app_handle()) {
                    log::warn!("control panel not hidden: {e}");
                }
            }
            // A strip stays against the bottom edge once it stops moving; a layout's place is kept.
            WindowEvent::Moved(_) | WindowEvent::Resized(_)
                if window.label().starts_with(overlay::LABEL_PREFIX) =>
            {
                overlay::overlay_moved(window.app_handle(), window.label());
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            about::platform_info,
            updates::update_support,
            updates::check_for_update,
            updates::install_update,
            updates::open_release_page,
            overlay::open_overlay,
            overlay::close_overlay,
            overlay::set_hidden_from_capture,
            overlay::set_overlay_settings,
            overlay::set_look_back,
            overlay::keep_overlays_apart,
            overlay::set_overlay_layout,
            overlay::fit_overlay,
            overlay::set_window_hidden_from_capture,
            files::read_config_file,
            files::write_config_file,
            example_decks::missing_example_decks,
            example_decks::install_example_decks,
            links::take_links,
            skill::skill_targets,
            skill::install_skill,
            skill::remove_skill,
            skill::reveal_skill,
            skill::save_skill_zip,
            quick::list_quick_files,
            quick::create_quick_file,
            quick::import_note,
            quick::read_quick_file,
            quick::write_quick_file,
            quick::rename_quick_file,
            quick::trash_quick_file,
            quick::read_deck_sessions,
            quick::write_deck_sessions,
            resources::list_resources,
            resources::add_resources,
            resources::add_resource_link,
            resources::open_resource,
            resources::open_resources_folder,
            resources_move::move_deck_resources,
            resources_move::undo_resources_move,
            session_files::list_session_files,
            session_files::read_session_file,
            session_files::write_transcript,
            session_files::trash_session_files,
            session_files::read_transcript_file,
            recorder::start_recording,
            recorder::pause_recording,
            recorder::stop_recording,
            recorder::recording_state,
            recorder::microphone_status,
            transcriber::speech_model,
            transcriber::download_speech_model,
            transcriber::remove_speech_model,
            transcriber::transcribe_recording,
            transcriber::discard_recording,
            workspaces::list_workspaces,
            workspaces::create_workspace,
            workspaces::trash_workspace,
            workspaces::update_workspace,
            state::state_get,
            session::session_open,
            session::session_close,
            hotkeys::check_shortcut,
            tray::set_tray_title,
            session::session_next,
            session::session_advance,
            session::session_preview_deck,
            session::session_previous,
            session::session_toggle_pause,
            session::session_end,
            control_panel::control_panel_toggle,
            hotkeys::set_panel_shortcut,
            hotkeys::panel_shortcut,
            control_panel::control_panel_close,
            control_panel::control_panel_look,
            control_panel::control_panel_show_manager,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Cmd+Q and similar: don't let the event loop destroy the overlays (platform::exit_now).
            if let RunEvent::ExitRequested { .. } = &event {
                platform::exit_now(app);
            }
        });
}
