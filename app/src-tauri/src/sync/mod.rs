//! Saving decks to the cloud (ADR 0050, spec §14). A deck's `deck.md` and `sessions.json`, byte for
//! byte, are the only things that travel; the Decks folder stays the source of truth.
//!
//! The module is one small interface, `Sync`: `push(deck)`, `pull()`, and `first_sync()` (what
//! turning Save decks to the cloud on does, built from the two). The cloud and the Decks folder sit
//! behind `Cloud` and `Library`, so tests use a fake server and a fake folder (tests.rs); the real
//! ones are in cloud.rs and library.rs, and the Tauri commands in commands.rs.
//!
//! Not built yet: edits uploading after a debounce and pulling on focus (slice 5), and what to do
//! when both computers changed a deck (slice 6). `Pushed::Conflict` and `Conflict` are where that
//! will go; nothing returns them now.

mod cloud;
pub mod commands;
mod library;
#[cfg(test)]
mod tests;

use std::collections::BTreeSet;
use std::fmt;

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
    /// Every live deck.
    fn list(&self) -> Result<Vec<RemoteSummary>, CloudError>;
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
}

/// Both computers changed a deck (slice 6 fills this in).
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

/// What `pull` did.
#[derive(Debug, Default, PartialEq)]
pub struct Pulled {
    pub downloaded: usize,
    pub failed: usize,
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

    /// Brings down every cloud deck this computer doesn't have (by id). Slice 5 calls it on focus;
    /// for now only tests do.
    #[allow(dead_code)]
    pub fn pull(&self) -> Result<Pulled, CloudError> {
        let remote = self.cloud.list()?;
        let local = self.local_ids()?;
        Ok(self.download_missing(&remote, &local))
    }

    /// Turning it on: uploads the local decks the cloud lacks, brings down the cloud's decks this
    /// computer lacks, and leaves a deck both have (same id) as it is on each side, saying so.
    pub fn first_sync(&self) -> Result<FirstSync, CloudError> {
        let remote = self.cloud.list()?;
        let Scan {
            decks: local_decks,
            unsyncable,
        } = self.library.scan().map_err(CloudError::Unreachable)?;
        let in_cloud: BTreeSet<&str> = remote.iter().map(|r| r.id.as_str()).collect();
        let mut report = FirstSync {
            failed: unsyncable.len(),
            ..FirstSync::default()
        };
        for deck in &local_decks {
            if !in_cloud.contains(deck.id.as_str()) {
                match self.push(deck) {
                    Ok(_) => report.uploaded += 1,
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
                    report.left_alone.push(deck.id.clone());
                }
                Ok(_) => {}
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
        let pulled = self.download_missing(&remote, &local);
        report.downloaded = pulled.downloaded;
        report.failed += pulled.failed;
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

    #[allow(dead_code)]
    fn local_ids(&self) -> Result<BTreeSet<String>, CloudError> {
        let scan = self.library.scan().map_err(CloudError::Unreachable)?;
        Ok(scan
            .decks
            .into_iter()
            .map(|d| d.id)
            .chain(scan.unsyncable)
            .collect())
    }

    fn download_missing(&self, remote: &[RemoteSummary], local: &BTreeSet<String>) -> Pulled {
        let mut pulled = Pulled::default();
        for summary in remote.iter().filter(|r| !local.contains(&r.id)) {
            match self.cloud.get(&summary.id) {
                // Deleted since the list was read.
                Ok(None) => {}
                Ok(Some(deck)) => match self.library.add(&deck) {
                    Ok(()) => pulled.downloaded += 1,
                    // The library's message names the deck's folder (its title) and a path: not logged.
                    Err(_) => {
                        log::warn!(
                            "sync.deck_failed step=download id={} reason=not_saved",
                            summary.id
                        );
                        pulled.failed += 1;
                    }
                },
                Err(e) => {
                    log::warn!("sync.deck_failed step=download id={} error={e}", summary.id);
                    pulled.failed += 1;
                }
            }
        }
        pulled
    }
}

fn same_files(local: &LocalDeck, remote: &RemoteDeck) -> bool {
    local.deck_md == remote.deck_md && local.sessions_json == remote.sessions_json
}
