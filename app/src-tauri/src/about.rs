//! What About shows that only the core knows (013/03): the operating system and architecture
//! this build runs on. The version comes from the app itself on the frontend, the build's
//! commit and date from the frontend build.

use serde::Serialize;

#[derive(Serialize)]
pub struct PlatformInfo {
    /// `std::env::consts::OS`: "macos", "windows", "linux".
    pub os: &'static str,
    /// `std::env::consts::ARCH`: "aarch64", "x86_64".
    pub arch: &'static str,
}

#[tauri::command]
pub fn platform_info() -> PlatformInfo {
    PlatformInfo {
        os: std::env::consts::OS,
        arch: std::env::consts::ARCH,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_os_and_architecture_this_build_runs_on() {
        let info = platform_info();
        assert!(!info.os.is_empty());
        assert!(!info.arch.is_empty());
    }
}
