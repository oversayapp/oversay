//! When a round of `Sync::sync_once` runs: a debounce after an edit, once at launch, on window
//! focus, and on a timer. Time is passed in, so tests step it by hand.

use std::time::{Duration, Instant};

use super::{Cloud, CloudError, Library, Round, State, Sync};

/// How long edits must stop before they are uploaded: a save is several writes, and an AI skill
/// writes a deck in pieces. Well inside the 10 seconds the epic allows.
pub const SAVE_DELAY: Duration = Duration::from_secs(2);

/// How often the cloud is asked for changes made elsewhere when nothing else asked.
pub const PULL_EVERY: Duration = Duration::from_secs(60);

/// What Settings › Account shows about keeping decks saved.
#[derive(Clone, Copy, Debug, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Activity {
    /// Nothing has run yet.
    #[default]
    Idle,
    /// An edit is waiting for its debounce, or being uploaded.
    Saving,
    /// Everything on this computer is saved and the cloud's changes are in.
    Saved,
    /// The cloud can't be reached: edits are kept on this computer and go up when it can.
    Offline,
}

pub struct Saver {
    state: State,
    edited_at: Option<Instant>,
    /// A pull (launch, focus) was asked for.
    pull_now: bool,
    next_pull: Instant,
    activity: Activity,
}

impl Saver {
    /// `now` is when it starts: the first round runs at once (launch).
    pub fn new(state: State, now: Instant) -> Self {
        Saver {
            state,
            edited_at: None,
            pull_now: true,
            next_pull: now + PULL_EVERY,
            activity: Activity::Idle,
        }
    }

    pub fn state(&self) -> &State {
        &self.state
    }

    pub fn activity(&self) -> Activity {
        self.activity
    }

    /// A deck file changed. Each edit restarts the wait.
    pub fn edited(&mut self, now: Instant) {
        self.edited_at = Some(now);
        self.activity = Activity::Saving;
    }

    /// The window came to the front: ask the cloud for changes at the next look.
    pub fn focused(&mut self) {
        self.pull_now = true;
    }

    /// Runs a round if one is due at `now`; None when nothing is. A round that couldn't reach the
    /// cloud is tried again after `PULL_EVERY`, the edit still waiting.
    pub fn run_due<C: Cloud, L: Library>(
        &mut self,
        now: Instant,
        sync: &Sync<C, L>,
    ) -> Option<Result<Round, CloudError>> {
        let edit_due = self.edited_at.is_some_and(|t| now >= t + SAVE_DELAY);
        let pull_due = self.pull_now || now >= self.next_pull;
        if !edit_due && !pull_due {
            return None;
        }
        let result = sync.sync_once(&mut self.state);
        self.pull_now = false;
        self.next_pull = now + PULL_EVERY;
        match &result {
            Ok(_) => {
                // An edit made while the round ran stays waiting.
                if edit_due && self.edited_at.is_some_and(|t| now >= t + SAVE_DELAY) {
                    self.edited_at = None;
                }
                if self.edited_at.is_none() {
                    self.activity = Activity::Saved;
                }
            }
            Err(e) => {
                // Still unsaved: the edit stays waiting for the next try.
                if matches!(e, CloudError::Unreachable(_)) {
                    if self.activity != Activity::Offline {
                        log::info!("sync.offline");
                    }
                    self.activity = Activity::Offline;
                } else if self.edited_at.is_some() {
                    self.activity = Activity::Saving;
                }
                self.edited_at = self.edited_at.map(|_| now + PULL_EVERY - SAVE_DELAY);
            }
        }
        Some(result)
    }
}
