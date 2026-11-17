//! Finding and installing updates (epic 015 (#16), ADR 0030).
//!
//! Only a build given a feed and key has the updater plugin registered (lib.rs); in any other
//! build `update_support` says so and nothing here makes a request. Checking and installing are
//! refused while a session is open, so an update never interrupts a talk. The frontend
//! (src/lib/updates) decides when to check; this module decides whether it may.

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

/// What this install can do about an update.
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum InstallKind {
    /// Downloads, verifies and replaces itself: the macOS app, the Windows NSIS and `.msi` installs.
    Installer,
    /// Cannot replace itself (the portable `.exe`, anything unrecognised): points at the release.
    LinkOnly,
}

/// `bundle` is how the build was packaged (`tauri::utils::platform::bundle_type`); a Windows
/// executable that reports none is the portable build.
pub fn install_kind(os: &str, bundle: Option<&str>) -> InstallKind {
    match (os, bundle) {
        ("macos", Some("app")) | ("windows", Some("nsis" | "msi")) => InstallKind::Installer,
        _ => InstallKind::LinkOnly,
    }
}

fn bundle_name() -> Option<&'static str> {
    use tauri::utils::config::BundleType;
    tauri::utils::platform::bundle_type().map(|b| match b {
        BundleType::App => "app",
        BundleType::Msi => "msi",
        BundleType::Nsis => "nsis",
        _ => "other",
    })
}

/// A release the feed announces.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub version: String,
    pub notes: String,
    pub date: Option<String>,
    /// Where the release can be read and downloaded, when the feed says (`release_page`).
    pub page: Option<String>,
}

/// The release in `latest.json` when it is newer than `current`. Used for a build that can't
/// install it, since the feed lists no package for such a build.
pub fn newer_release(feed: &str, current: &str) -> Result<Option<Release>, String> {
    let json: serde_json::Value =
        serde_json::from_str(feed).map_err(|e| format!("the feed isn't JSON: {e}"))?;
    let text = |key: &str| json.get(key).and_then(|v| v.as_str()).map(str::to_string);
    let version = text("version").ok_or("the feed has no version")?;
    let announced = semver::Version::parse(version.trim_start_matches('v'))
        .map_err(|e| format!("the feed's version isn't one: {e}"))?;
    let have =
        semver::Version::parse(current).map_err(|e| format!("this version isn't one: {e}"))?;
    if announced <= have {
        return Ok(None);
    }
    // Only an https address is ever offered as a link.
    let page = text("release_page").filter(|p| p.starts_with("https://"));
    Ok(Some(Release {
        version: announced.to_string(),
        notes: text("notes").unwrap_or_default(),
        date: text("pub_date"),
        page,
    }))
}

/// What a check found.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum Outcome {
    UpToDate,
    Available {
        release: Release,
        kind: InstallKind,
    },
    /// The feed couldn't be read (offline, down, or not understood).
    Unreachable,
    /// A session is open: nothing was asked and nothing changes.
    Busy,
}

/// Why a check or install may not go ahead, or `None` when it may.
pub fn refusal(enabled: bool, session_open: bool) -> Option<&'static str> {
    if !enabled {
        Some("this build doesn't check for updates")
    } else if session_open {
        Some("a session is open")
    } else {
        None
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Support {
    /// False in a build given no feed: Settings has no Updates section and nothing is asked.
    pub enabled: bool,
    pub kind: InstallKind,
}

/// The update found by the last check, kept for Install.
#[derive(Default)]
pub struct Pending {
    update: Mutex<Option<Update>>,
    /// The release page the last check was given, the only address `open_release_page` opens.
    page: Mutex<Option<String>>,
}

/// Longest a check waits for the feed, so a hung server can't leave Check for updates spinning.
const FEED_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);

fn enabled(app: &AppHandle) -> bool {
    app.config().plugins.0.contains_key("updater")
}

fn kind() -> InstallKind {
    install_kind(std::env::consts::OS, bundle_name())
}

#[tauri::command]
pub fn update_support(app: AppHandle) -> Support {
    Support {
        enabled: enabled(&app),
        kind: kind(),
    }
}

fn endpoints(app: &AppHandle) -> Vec<String> {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|u| u.get("endpoints"))
        .and_then(|e| e.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default()
}

/// The agent that reads the feed for a build the updater can't install into.
///
/// The feed address is compiled in and may be a redirect (updates.oversay.app sends
/// `/latest.json` to the release's file), so a few redirects are followed. A redirect to plain
/// http is refused, so the feed is never read, nor the page it names taken, over an unprotected
/// hop. `https_only` is off only in tests, which serve over local http.
fn feed_agent(https_only: bool) -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(FEED_TIMEOUT))
        .https_only(https_only)
        .max_redirects(5)
        .build()
        .into()
}

fn fetch_feed(agent: &ureq::Agent, url: &str) -> Result<String, ureq::Error> {
    agent
        .get(url)
        .call()
        .and_then(|mut r| r.body_mut().read_to_string())
}

/// The feed read directly, for a build the updater can't install into.
fn newer_from_feed(app: &AppHandle) -> Result<Option<Release>, String> {
    let current = app.package_info().version.to_string();
    let agent = feed_agent(true);
    for url in endpoints(app) {
        match fetch_feed(&agent, &url) {
            Ok(text) => return newer_release(&text, &current),
            Err(e) => log::debug!("updates.feed_unreachable error={e}"),
        }
    }
    Err("no feed answered".to_string())
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<Outcome, String> {
    if let Some(why) = refusal(enabled(&app), crate::session::holds_keys(&app)) {
        log::debug!("updates.check_refused why={why:?}");
        return if enabled(&app) {
            Ok(Outcome::Busy)
        } else {
            Err(why.to_string())
        };
    }
    log::debug!("updates.check_started");
    let kind = kind();
    if kind == InstallKind::LinkOnly {
        let handle = app.clone();
        let found = tauri::async_runtime::spawn_blocking(move || newer_from_feed(&handle))
            .await
            .map_err(|e| e.to_string())?;
        return Ok(match found {
            Ok(Some(release)) => {
                *app.state::<Pending>().page.lock().unwrap() = release.page.clone();
                Outcome::Available { release, kind }
            }
            Ok(None) => Outcome::UpToDate,
            Err(e) => {
                log::debug!("updates.check_failed error={e}");
                Outcome::Unreachable
            }
        });
    }
    let checked = match app.updater_builder().timeout(FEED_TIMEOUT).build() {
        Ok(updater) => updater.check().await,
        Err(e) => Err(e),
    };
    let pending = app.state::<Pending>();
    Ok(match checked {
        Ok(Some(update)) => {
            let release = Release {
                version: update.version.clone(),
                notes: update.body.clone().unwrap_or_default(),
                date: update.date.map(|d| d.to_string()),
                page: None,
            };
            log::debug!("updates.available version={}", release.version);
            *pending.update.lock().unwrap() = Some(update);
            Outcome::Available { release, kind }
        }
        Ok(None) => {
            *pending.update.lock().unwrap() = None;
            log::debug!("updates.up_to_date");
            Outcome::UpToDate
        }
        Err(e) => {
            log::debug!("updates.check_failed error={e}");
            Outcome::Unreachable
        }
    })
}

/// Downloads the update found by the last check, verifies its signature, installs it and
/// restarts. On Windows the installer ends the app itself.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    if let Some(why) = refusal(enabled(&app), crate::session::holds_keys(&app)) {
        log::debug!("updates.install_refused why={why:?}");
        return Err(why.to_string());
    }
    let update = app
        .state::<Pending>()
        .update
        .lock()
        .unwrap()
        .clone()
        .ok_or("there is no update to install: check first")?;
    // Kept, not taken, so a failed install can be tried again without checking first.
    log::debug!("updates.install_started version={}", update.version);
    let fail = |e: tauri_plugin_updater::Error| {
        log::debug!("updates.install_failed error={e}");
        format!("the update wasn't installed: {e}")
    };
    let bytes = update.download(|_, _| {}, || {}).await.map_err(fail)?;
    // A session may have been opened while the download ran: it is never interrupted.
    if let Some(why) = refusal(true, crate::session::holds_keys(&app)) {
        log::debug!("updates.install_deferred why={why:?}");
        return Err(format!(
            "{why}: nothing was installed. Try again once it ends."
        ));
    }
    update.install(bytes).map_err(fail)?;
    crate::platform::restart_now(&app)
}

/// Opens the release page the last check was given (a link-only build, whose feed names one).
/// The address is never taken from the window: only what the check stored is opened.
#[tauri::command]
pub async fn open_release_page(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let url = app
        .state::<Pending>()
        .page
        .lock()
        .unwrap()
        .clone()
        .ok_or("the update feed names no release page")?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installers_update_themselves_and_the_portable_exe_does_not() {
        assert_eq!(install_kind("macos", Some("app")), InstallKind::Installer);
        assert_eq!(
            install_kind("windows", Some("nsis")),
            InstallKind::Installer
        );
        assert_eq!(install_kind("windows", Some("msi")), InstallKind::Installer);
        assert_eq!(install_kind("windows", None), InstallKind::LinkOnly);
        assert_eq!(install_kind("linux", Some("other")), InstallKind::LinkOnly);
    }

    const FEED: &str = r#"{"version":"0.3.0","notes":"Faster start","pub_date":"2026-12-01T10:00:00Z","release_page":"https://example.test/r/v0.3.0","platforms":{}}"#;

    #[test]
    fn a_newer_feed_version_is_offered_with_its_notes() {
        let r = newer_release(FEED, "0.2.0").unwrap().unwrap();
        assert_eq!(r.version, "0.3.0");
        assert_eq!(r.notes, "Faster start");
        assert_eq!(r.page.as_deref(), Some("https://example.test/r/v0.3.0"));
    }

    #[test]
    fn the_same_or_an_older_version_is_not_offered() {
        assert_eq!(newer_release(FEED, "0.3.0").unwrap(), None);
        assert_eq!(newer_release(FEED, "1.0.0").unwrap(), None);
    }

    #[test]
    fn a_page_that_is_not_https_is_dropped_and_a_bad_feed_is_an_error() {
        let feed = r#"{"version":"0.3.0","release_page":"http://example.test/"}"#;
        assert_eq!(newer_release(feed, "0.2.0").unwrap().unwrap().page, None);
        assert!(newer_release("nope", "0.2.0").is_err());
        assert!(newer_release("{}", "0.2.0").is_err());
    }

    // The same literal is typed as `Outcome` in src/lib/updates/policy.test.ts.
    #[test]
    fn an_outcome_is_sent_in_the_shape_the_frontend_reads() {
        let o = Outcome::Available {
            release: Release {
                version: "0.3.0".into(),
                notes: "Faster".into(),
                date: None,
                page: None,
            },
            kind: InstallKind::LinkOnly,
        };
        assert_eq!(
            serde_json::to_string(&o).unwrap(),
            r#"{"state":"available","release":{"version":"0.3.0","notes":"Faster","date":null,"page":null},"kind":"linkOnly"}"#
        );
        assert_eq!(
            serde_json::to_string(&Outcome::UpToDate).unwrap(),
            r#"{"state":"upToDate"}"#
        );
    }

    #[test]
    fn nothing_is_asked_without_a_feed_or_during_a_session() {
        assert!(refusal(false, false).is_some());
        assert!(refusal(true, true).is_some());
        assert_eq!(refusal(true, false), None);
    }

    /// A tiny local HTTP server: answers every connection with `respond(own_url)`, up to `max`.
    fn serve(max: usize, respond: impl Fn(&str) -> String + Send + 'static) -> String {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/latest.json", listener.local_addr().unwrap());
        let own = url.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming().take(max).flatten() {
                let mut stream = stream;
                let mut buf = [0u8; 1024];
                let _ = stream.read(&mut buf);
                let _ = stream.write_all(respond(&own).as_bytes());
            }
        });
        url
    }

    fn redirect_to(url: &str) -> String {
        format!(
            "HTTP/1.1 302 Found\r\nLocation: {url}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
        )
    }

    #[test]
    fn a_feed_served_by_a_redirect_is_followed() {
        let real = serve(1, |_| {
            format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{FEED}",
                FEED.len()
            )
        });
        let front = serve(1, move |_| redirect_to(&real));
        assert_eq!(fetch_feed(&feed_agent(false), &front).unwrap(), FEED);
    }

    #[test]
    fn a_feed_that_redirects_in_circles_is_given_up_on() {
        let looping = serve(20, redirect_to);
        assert!(fetch_feed(&feed_agent(false), &looping).is_err());
    }

    #[test]
    fn a_feed_over_plain_http_is_refused() {
        let plain = serve(1, |_| {
            "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}".to_string()
        });
        assert!(fetch_feed(&feed_agent(true), &plain).is_err());
    }
}
