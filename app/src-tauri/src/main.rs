// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // `Oversay --check <file>` checks a quick talk and exits before any window opens (task 205).
    if let Some(code) = oversay_lib::check_from_args() {
        std::process::exit(code);
    }
    oversay_lib::run();
}
