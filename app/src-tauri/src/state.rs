//! Shared state broadcast to every window (spec §5 "Where state lives").
//!
//! State lives in named channels. Each update bumps the channel's version and
//! is emitted to all windows as `state:<name>`. A window that opens later asks
//! for the current value with `state_get`; versions let it ignore a reply that
//! is older than an event it has already seen.

use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Runtime};

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Versioned {
    pub version: u64,
    pub value: Value,
}

#[derive(Default)]
pub struct StateHub {
    channels: Mutex<HashMap<String, Versioned>>,
}

/// Sent to a window that may have missed broadcasts (an overlay shown again): its channels
/// fetch their current values. Same name as `RESYNC_EVENT` in src/lib/channel.ts.
pub const RESYNC_EVENT: &str = "state-resync";

/// Tells a hidden window that has just been shown again to fetch the current state: it may
/// have missed broadcasts while hidden (src/lib/channel.ts).
pub fn resync(app: &AppHandle, label: &str) {
    if let Err(e) = app.emit_to(label, RESYNC_EVENT, ()) {
        log::warn!("{label}: not resynced: {e}");
    }
}

pub fn event_name(channel: &str) -> String {
    format!("state:{channel}")
}

impl StateHub {
    pub fn get(&self, channel: &str) -> Option<Versioned> {
        self.channels.lock().unwrap().get(channel).cloned()
    }

    /// Computes the next value from the current one and stores it with a new
    /// version. `emit` runs while the lock is held, so events go out in order.
    fn update_with<F, E>(&self, channel: &str, f: F, emit: E) -> Versioned
    where
        F: FnOnce(Option<&Value>) -> Value,
        E: FnOnce(&Versioned),
    {
        let mut channels = self.channels.lock().unwrap();
        let current = channels.get(channel);
        let next = Versioned {
            version: current.map_or(1, |c| c.version + 1),
            value: f(current.map(|c| &c.value)),
        };
        channels.insert(channel.to_string(), next.clone());
        emit(&next);
        next
    }

    /// Updates a channel and broadcasts the new value to every window.
    pub fn update<R: Runtime, F>(&self, app: &AppHandle<R>, channel: &str, f: F) -> Versioned
    where
        F: FnOnce(Option<&Value>) -> Value,
    {
        self.update_with(channel, f, |next| {
            if let Err(e) = app.emit(&event_name(channel), next) {
                log::warn!("failed to emit {channel}: {e}");
            }
        })
    }
}

#[tauri::command]
pub fn state_get(hub: tauri::State<'_, StateHub>, channel: String) -> Option<Versioned> {
    hub.get(&channel)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bump(hub: &StateHub, emitted: &mut Vec<Versioned>) -> Versioned {
        hub.update_with(
            "counter",
            |v| Value::from(v.and_then(Value::as_i64).unwrap_or(0) + 1),
            |next| emitted.push(next.clone()),
        )
    }

    #[test]
    fn empty_channel_has_no_value() {
        assert_eq!(StateHub::default().get("counter"), None);
    }

    #[test]
    fn updates_bump_version_and_emit_in_order() {
        let hub = StateHub::default();
        let mut emitted = Vec::new();
        bump(&hub, &mut emitted);
        let second = bump(&hub, &mut emitted);
        assert_eq!(
            second,
            Versioned {
                version: 2,
                value: Value::from(2)
            }
        );
        assert_eq!(hub.get("counter"), Some(second));
        assert_eq!(
            emitted.iter().map(|v| v.version).collect::<Vec<_>>(),
            vec![1, 2]
        );
    }

    #[test]
    fn channels_are_independent() {
        let hub = StateHub::default();
        hub.update_with("a", |_| Value::from("x"), |_| {});
        assert_eq!(hub.get("b"), None);
    }

    #[test]
    fn resync_event_name_matches_the_frontend() {
        // Same value as the RESYNC_EVENT test in src/lib/channel.test.ts.
        assert_eq!(RESYNC_EVENT, "state-resync");
    }

    #[test]
    fn event_names_are_prefixed() {
        assert_eq!(event_name("session"), "state:session");
    }
}
