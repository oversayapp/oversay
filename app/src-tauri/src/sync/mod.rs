//! Saving decks to the cloud (ADR 0050, spec §14). A deck's `deck.md` and `sessions.json`, byte for
//! byte, are the only things that travel; the Decks folder stays the source of truth.
//!
//! The module is one small interface, `Sync`: `push(deck)`, `pull()`, and `first_sync()` (what
//! turning Save decks to the cloud on does, built from the two). The cloud and the Decks folder sit
//! behind `Cloud` and `Library`, so tests use a fake server and a fake folder (tests.rs); the real
//! ones are in cloud.rs and library.rs, and the Tauri commands in commands.rs.
//!
//! `sync_once` is one round (pull what changed since the cursor, then push what changed here);
//! saver.rs decides when a round runs (a debounce after an edit, launch, focus, a timer).
//!
//! Not built yet: what to do when both computers changed a deck (slice 6). Such a deck is held:
//! kept as it is locally and not uploaded. `Pushed::Conflict` and `Conflict` are where slice 6
//! will go; nothing returns them now.

mod cloud;
pub mod commands;
mod library;
pub mod saver;
#[cfg(test)]
mod tests;

use std::collections::{BTreeMap, BTreeSet};
use std::fmt;
use std::time::Instant;

use serde::{Deserialize, Serialize};

/// A deck as the Decks folder has it: the two files that are saved, and the id in `deck.md`.
#[derive(Clone, Debug, PartialEq)]
pub struct LocalDeck {
    pub id: String,
    pub deck_md: String,
    pub sessions_json: String,
}

/// A deck as the cloud has it.
#[derive(Clone, Debug, PartialEq)]
pub struct RemoteDeck {
    pub id: String,
    pub deck_md: String,
    pub sessions_json: String,
    pub revision: u64,
}

/// One live deck in the cloud's list.
#[derive(Clone, Debug, PartialEq)]
pub struct RemoteSummary {
    pub id: String,
    pub revision: u64,
}

/// Every live deck in the cloud, and the account's cursor when it was read.
#[derive(Clone, Debug, PartialEq)]
pub struct Listing {
    pub decks: Vec<RemoteSummary>,
    pub cursor: u64,
}

/// One deck the cloud saved or deleted since a cursor.
#[derive(Clone, Debug, PartialEq)]
pub struct Change {
    pub id: String,
    pub revision: u64,
    pub deleted: bool,
}

/// What changed in the cloud since a cursor, oldest first, and the cursor to ask from next time.
#[derive(Clone, Debug, PartialEq)]
pub struct Changes {
    pub items: Vec<Change>,
    pub cursor: u64,
}

#[derive(Debug, PartialEq)]
pub enum CloudError {
    /// Not signed in (or signed out meanwhile): no request was made.
    SignedOut,
    /// The network or the API couldn't be reached, or answered oddly.
    Unreachable(String),
    /// The API said no to this request, with this status.
    Refused(u16),
}

impl fmt::Display for CloudError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            CloudError::SignedOut => write!(f, "Not signed in."),
            CloudError::Unreachable(why) => write!(f, "{why}"),
            CloudError::Refused(status) => write!(f, "The cloud refused it ({status})."),
        }
    }
}

/// The cloud's decks for one account.
pub trait Cloud {
    /// Every live deck, and the cursor to pull from afterwards.
    fn list(&self) -> Result<Listing, CloudError>;
    /// What was saved or deleted after `since` (a cursor this trait gave).
    fn changes(&self, since: u64) -> Result<Changes, CloudError>;
    /// One deck, or None when the account has none with this id.
    fn get(&self, id: &str) -> Result<Option<RemoteDeck>, CloudError>;
    /// Creates or replaces the deck; gives its new revision.
    fn put(&self, deck: &LocalDeck) -> Result<u64, CloudError>;
}

/// What the Decks folder held.
#[derive(Debug, Default, PartialEq)]
pub struct Scan {
    /// Every deck that has an id and is in a folder of its own, with its two files.
    pub decks: Vec<LocalDeck>,
    /// Ids of decks that are here but can't be saved (a link, a sessions file that isn't JSON, too
    /// large): they are not uploaded, and the cloud's deck with the same id is not brought down
    /// beside them.
    pub unsyncable: Vec<String>,
}

/// The Decks folder.
pub trait Library {
    fn scan(&self) -> Result<Scan, String>;
    /// Makes a deck of the cloud's, in a new folder named as ADR 0037 says.
    fn add(&self, deck: &RemoteDeck) -> Result<(), String>;
    /// Writes the cloud's files over the deck's own, only if the deck is still exactly `expected`:
    /// an edit made since it was read is never overwritten.
    fn replace(&self, expected: &LocalDeck, deck: &RemoteDeck) -> Result<(), String>;
}

/// Both computers changed a deck (slice 6 settles it). Until then the deck is *held*: its local
/// files are left as they are and it is not uploaded over the cloud's newer revision.
#[derive(Debug, PartialEq)]
pub struct Conflict {
    pub id: String,
}

#[derive(Debug, PartialEq)]
pub enum Pushed {
    Saved {
        revision: u64,
    },
    /// Never returned yet (slice 6).
    #[allow(dead_code)]
    Conflict(Conflict),
}

/// What turning Save decks to the cloud on did.
#[derive(Debug, Default, PartialEq)]
pub struct FirstSync {
    pub uploaded: usize,
    pub downloaded: usize,
    /// Ids the cloud and this computer both have, with different contents. Neither side was
    /// changed: which one wins is for the conflict slice (6) to settle, so nothing is overwritten
    /// silently now.
    pub left_alone: Vec<String>,
    /// Decks that couldn't be saved or brought down; the rest went ahead.
    pub failed: usize,
}

/// What one round of keeping decks saved did.
#[derive(Debug, Default, PartialEq)]
pub struct Round {
    pub uploaded: usize,
    pub downloaded: usize,
    /// Decks changed on both sides, newly held back this round.
    pub held: usize,
    pub failed: usize,
}

/// What the last sync of a deck agreed with the cloud: the revision, and a hash of its two files.
/// A deck whose files hash differently has a local change that hasn't been uploaded.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Base {
    pub revision: u64,
    pub hash: String,
}

/// What this computer remembers between rounds (`sync-state.json`, never in the Decks folder).
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct State {
    /// Where the cloud's changes were read up to. None: nothing synced yet.
    pub cursor: Option<u64>,
    pub decks: BTreeMap<String, Base>,
    /// Decks changed on both sides, left alone until slice 6 settles them.
    pub held: BTreeSet<String>,
}

pub fn hash_of(deck_md: &str, sessions_json: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(deck_md.as_bytes());
    h.update([0]);
    h.update(sessions_json.as_bytes());
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

impl LocalDeck {
    fn hash(&self) -> String {
        hash_of(&self.deck_md, &self.sessions_json)
    }
}

impl RemoteDeck {
    fn base(&self) -> Base {
        Base {
            revision: self.revision,
            hash: hash_of(&self.deck_md, &self.sessions_json),
        }
    }
}

pub struct Sync<C, L> {
    cloud: C,
    library: L,
}

impl<C: Cloud, L: Library> Sync<C, L> {
    pub fn new(cloud: C, library: L) -> Self {
        Sync { cloud, library }
    }

    /// Saves one deck to the cloud.
    pub fn push(&self, deck: &LocalDeck) -> Result<Pushed, CloudError> {
        self.cloud
            .put(deck)
            .map(|revision| Pushed::Saved { revision })
    }

    /// Turning it on: uploads the local decks the cloud lacks, brings down the cloud's decks this
    /// computer lacks, and leaves a deck both have (same id, different files) as it is on each
    /// side, held, saying so. `state` then remembers what was agreed.
    pub fn first_sync(&self, state: &mut State) -> Result<FirstSync, CloudError> {
        let listing = self.cloud.list()?;
        let Scan {
            decks: local_decks,
            unsyncable,
        } = self.library.scan().map_err(CloudError::Unreachable)?;
        let in_cloud: BTreeSet<&str> = listing.decks.iter().map(|r| r.id.as_str()).collect();
        let mut report = FirstSync {
            failed: unsyncable.len(),
            ..FirstSync::default()
        };
        for deck in &local_decks {
            if !in_cloud.contains(deck.id.as_str()) {
                match self.push(deck) {
                    Ok(Pushed::Saved { revision }) => {
                        state.decks.insert(
                            deck.id.clone(),
                            Base {
                                revision,
                                hash: deck.hash(),
                            },
                        );
                        report.uploaded += 1;
                    }
                    Ok(Pushed::Conflict(_)) => {}
                    Err(CloudError::SignedOut) => return Err(CloudError::SignedOut),
                    Err(e) => {
                        log::warn!("sync.deck_failed step=upload id={} error={e}", deck.id);
                        report.failed += 1;
                    }
                }
                continue;
            }
            match self.cloud.get(&deck.id) {
                Ok(Some(theirs)) if !same_files(deck, &theirs) => {
                    log::debug!("sync.initial_differs id={}", deck.id);
                    state.held.insert(deck.id.clone());
                    report.left_alone.push(deck.id.clone());
                }
                Ok(Some(theirs)) => {
                    state.decks.insert(deck.id.clone(), theirs.base());
                }
                Ok(None) => {}
                Err(CloudError::SignedOut) => return Err(CloudError::SignedOut),
                Err(e) => {
                    log::warn!("sync.deck_failed step=compare id={} error={e}", deck.id);
                    report.failed += 1;
                }
            }
        }
        let local: BTreeSet<String> = local_decks
            .into_iter()
            .map(|d| d.id)
            .chain(unsyncable)
            .collect();
        for summary in listing.decks.iter().filter(|r| !local.contains(&r.id)) {
            match self.download(state, &summary.id) {
                Ok(true) => report.downloaded += 1,
                Ok(false) => {}
                Err(CloudError::SignedOut) => return Err(CloudError::SignedOut),
                Err(_) => report.failed += 1,
            }
        }
        state.cursor = Some(listing.cursor);
        log::debug!(
            "sync.initial_upload decks={} check=epic-036/V8",
            report.uploaded
        );
        log::debug!(
            "sync.initial_download decks={} check=epic-036/V10",
            report.downloaded
        );
        Ok(report)
    }

    /// One round of keeping decks saved: first what changed in the cloud since the cursor comes
    /// down, then every local deck whose files differ from what was last agreed goes up. Run after
    /// an edit (a debounce later), on launch, on window focus and on a timer.
    ///
    /// A deck changed on both sides is held: its local files are not touched and it is not
    /// uploaded, so neither side's change is lost (slice 6 settles it). A file this round wrote
    /// becomes the deck's agreed state, so it is never uploaded back.
    pub fn sync_once(&self, state: &mut State) -> Result<Round, CloudError> {
        let Some(since) = state.cursor else {
            return self.start_over(state);
        };
        let changes = self.cloud.changes(since)?;
        if changes.cursor < since {
            // A cursor from somewhere else: begin again from a full list.
            return self.start_over(state);
        }
        let mut round = Round::default();
        let scan = self.library.scan().map_err(CloudError::Unreachable)?;
        let mut all_read = true;
        for change in &changes.items {
            match self.pull_one(state, &scan, change) {
                Ok(Pulled::Down) => round.downloaded += 1,
                Ok(Pulled::Held) => round.held += 1,
                Ok(Pulled::Nothing) => {}
                Err(CloudError::SignedOut) => return Err(CloudError::SignedOut),
                Err(_) => {
                    all_read = false;
                    round.failed += 1;
                }
            }
        }
        // Where this round read up to, only when every change was dealt with: the rest is asked
        // for again next time.
        if all_read {
            state.cursor = Some(changes.cursor);
        }
        let scan = self.library.scan().map_err(CloudError::Unreachable)?;
        for deck in &scan.decks {
            match self.push_if_changed(state, deck) {
                Ok(true) => round.uploaded += 1,
                Ok(false) => {}
                Err(CloudError::SignedOut) => return Err(CloudError::SignedOut),
                Err(_) => round.failed += 1,
            }
        }
        Ok(round)
    }

    fn start_over(&self, state: &mut State) -> Result<Round, CloudError> {
        *state = State::default();
        let first = self.first_sync(state)?;
        Ok(Round {
            uploaded: first.uploaded,
            downloaded: first.downloaded,
            held: first.left_alone.len(),
            failed: first.failed,
        })
    }

    fn pull_one(
        &self,
        state: &mut State,
        scan: &Scan,
        change: &Change,
    ) -> Result<Pulled, CloudError> {
        let id = &change.id;
        if change.deleted {
            // Deletes and the Trash are slice 7: nothing local is removed yet.
            log::debug!("sync.deck_delete_ignored id={id}");
            return Ok(Pulled::Nothing);
        }
        let base = state.decks.get(id);
        // Our own upload, seen again.
        if base.is_some_and(|b| b.revision >= change.revision) {
            return Ok(Pulled::Nothing);
        }
        if state.held.contains(id) || scan.unsyncable.contains(id) {
            return Ok(Pulled::Nothing);
        }
        let Some(local) = scan.decks.iter().find(|d| &d.id == id) else {
            return self.download(state, id).map(
                |down| {
                    if down { Pulled::Down } else { Pulled::Nothing }
                },
            );
        };
        if base.is_none_or(|b| b.hash != local.hash()) {
            // Changed here and in the cloud: keep the local files, upload nothing.
            state.held.insert(id.clone());
            log::warn!("sync.pull_held id={id} reason=changed_on_both check=epic-036/V12");
            return Ok(Pulled::Held);
        }
        let Some(theirs) = self.cloud.get(id)? else {
            return Ok(Pulled::Nothing);
        };
        match self.library.replace(local, &theirs) {
            Ok(()) => {
                state.decks.insert(id.clone(), theirs.base());
                log::debug!("sync.deck_pulled id={id} check=epic-036/V11");
                Ok(Pulled::Down)
            }
            // Edited while the cloud's copy was being read: asked for again next round.
            Err(_) => Err(CloudError::Unreachable("changed meanwhile".into())),
        }
    }

    /// Downloads a deck this computer lacks. False when the cloud no longer has it.
    fn download(&self, state: &mut State, id: &str) -> Result<bool, CloudError> {
        match self.cloud.get(id) {
            // Deleted since the list was read.
            Ok(None) => Ok(false),
            Ok(Some(deck)) => match self.library.add(&deck) {
                Ok(()) => {
                    state.decks.insert(id.to_string(), deck.base());
                    log::debug!("sync.deck_pulled id={id} check=epic-036/V11");
                    Ok(true)
                }
                // The library's message names the deck's folder (its title) and a path: not logged.
                Err(_) => {
                    log::warn!("sync.deck_failed step=download id={id} reason=not_saved");
                    Err(CloudError::Unreachable("not saved".into()))
                }
            },
            Err(e) => {
                log::warn!("sync.deck_failed step=download id={id} error={e}");
                Err(e)
            }
        }
    }

    fn push_if_changed(&self, state: &mut State, deck: &LocalDeck) -> Result<bool, CloudError> {
        if state.held.contains(&deck.id) {
            return Ok(false);
        }
        let hash = deck.hash();
        match state.decks.get(&deck.id) {
            Some(base) if base.hash == hash => return Ok(false),
            Some(_) => {}
            None => {
                // Never agreed with the cloud: a new deck, unless the cloud already has one with
                // this id, which is not overwritten.
                if let Some(theirs) = self.cloud.get(&deck.id)? {
                    if same_files(deck, &theirs) {
                        state.decks.insert(deck.id.clone(), theirs.base());
                    } else {
                        state.held.insert(deck.id.clone());
                        log::warn!(
                            "sync.pull_held id={} reason=changed_on_both check=epic-036/V12",
                            deck.id
                        );
                    }
                    return Ok(false);
                }
            }
        }
        let started = Instant::now();
        match self.push(deck) {
            Ok(Pushed::Saved { revision }) => {
                state.decks.insert(deck.id.clone(), Base { revision, hash });
                log::debug!(
                    "sync.deck_saved id={} ms={} check=epic-036/V9",
                    deck.id,
                    started.elapsed().as_millis()
                );
                Ok(true)
            }
            Ok(Pushed::Conflict(_)) => Ok(false),
            Err(e) => {
                log::warn!("sync.deck_failed step=upload id={} error={e}", deck.id);
                Err(e)
            }
        }
    }
}

enum Pulled {
    Down,
    Held,
    Nothing,
}

fn same_files(local: &LocalDeck, remote: &RemoteDeck) -> bool {
    local.deck_md == remote.deck_md && local.sessions_json == remote.sessions_json
}
