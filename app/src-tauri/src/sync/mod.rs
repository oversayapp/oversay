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
//! Offline (slice 6): a round that can't reach the cloud is `CloudError::Unreachable`; the saver then
//! says Offline, edits stay on this computer, and the next round that gets through uploads them.
//!
//! A deck changed on both computers keeps both versions (`settle`): this computer's files stay the
//! deck, and the cloud's version is added beside it as a new deck titled "… (conflict copy)". The
//! deck then goes up over the cloud's revision and the copy goes up as a new deck, so every
//! computer ends with the same two decks. The cloud refuses a write over a revision the writer
//! hadn't seen (409), which is how a conflict is found when the pull didn't see it.
//!
//! Deletes (slice 7): a deck agreed with the cloud that is gone from the Decks folder was moved
//! to the Trash, so it is deleted from the cloud (`delete_trashed`; offline it stays in the state
//! and is asked again). A tombstone from the cloud moves the deck to this computer's Trash
//! (`pull_deleted`), never a hard delete. An edit is never lost to a delete: a deck edited here
//! stays and goes back up over the tombstone; a deck the cloud changed since is brought back
//! instead of deleted. A folder that couldn't be fully read (`Scan::incomplete`) deletes nothing.

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
    /// A save was refused because the cloud's deck is at another revision than the one it was
    /// based on; this is the stored one (a deleted deck keeps its revision).
    Stale(u64),
}

impl fmt::Display for CloudError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            CloudError::SignedOut => write!(f, "Not signed in."),
            CloudError::Unreachable(why) => write!(f, "{why}"),
            CloudError::Refused(status) => write!(f, "The cloud refused it ({status})."),
            CloudError::Stale(_) => write!(f, "The deck changed in the cloud."),
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
    /// Saves the deck; gives its new revision. `base` is the revision this computer last agreed
    /// (0: it expects the cloud to have no such deck); the cloud answers `Stale` and changes
    /// nothing when its revision is another.
    fn put(&self, deck: &LocalDeck, base: u64) -> Result<u64, CloudError>;
    /// Deletes the deck; the cloud keeps a tombstone so other computers learn of it. A deck the
    /// cloud no longer has counts as deleted.
    fn delete(&self, id: &str) -> Result<(), CloudError>;
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
    /// Something in the folder couldn't be read, so a deck missing from `decks` may only be
    /// unread: nothing is taken to be deleted from this scan.
    pub incomplete: bool,
}

/// The Decks folder.
pub trait Library {
    fn scan(&self) -> Result<Scan, String>;
    /// Makes a deck of the cloud's, in a new folder named as ADR 0037 says.
    fn add(&self, deck: &RemoteDeck) -> Result<(), String>;
    /// Writes the cloud's files over the deck's own, only if the deck is still exactly `expected`:
    /// an edit made since it was read is never overwritten.
    fn replace(&self, expected: &LocalDeck, deck: &RemoteDeck) -> Result<(), String>;
    /// Moves the deck's folder to the Trash (recoverable), only if the deck is still exactly
    /// `expected`: an edit made since it was read is never trashed.
    fn trash(&self, expected: &LocalDeck) -> Result<(), String>;
}

#[derive(Debug, PartialEq)]
pub enum Pushed {
    Saved {
        revision: u64,
    },
    /// The cloud's deck is at this other revision than the one this save was based on.
    Conflict(u64),
}

/// What turning Save decks to the cloud on did.
#[derive(Debug, Default, PartialEq)]
pub struct FirstSync {
    pub uploaded: usize,
    pub downloaded: usize,
    /// Ids the cloud and this computer both have, with different contents: the first round after
    /// this settles each (keeps both versions).
    pub left_alone: Vec<String>,
    /// Decks that couldn't be saved or brought down; the rest went ahead.
    pub failed: usize,
}

/// What one round of keeping decks saved did.
#[derive(Debug, Default, PartialEq)]
pub struct Round {
    pub uploaded: usize,
    pub downloaded: usize,
    /// Titles of the conflict copies made this round (decks changed on both computers).
    pub copies: Vec<String>,
    /// Decks deleted from the cloud because they were moved to the Trash here, plus decks moved
    /// to the Trash here because they were deleted elsewhere.
    pub deleted: usize,
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

    /// Saves one deck to the cloud, based on the revision `state` last agreed (a new deck: 0).
    pub fn push(&self, state: &State, deck: &LocalDeck) -> Result<Pushed, CloudError> {
        let base = state.decks.get(&deck.id).map_or(0, |b| b.revision);
        match self.cloud.put(deck, base) {
            Ok(revision) => Ok(Pushed::Saved { revision }),
            Err(CloudError::Stale(stored)) => Ok(Pushed::Conflict(stored)),
            Err(e) => Err(e),
        }
    }

    /// Turning it on: uploads the local decks the cloud lacks, brings down the cloud's decks this
    /// computer lacks, and leaves a deck both have (same id, different files) as it is on each
    /// side, held, saying so. `state` then remembers what was agreed.
    pub fn first_sync(&self, state: &mut State) -> Result<FirstSync, CloudError> {
        let listing = self.cloud.list()?;
        let Scan {
            decks: local_decks,
            unsyncable,
            ..
        } = self.library.scan().map_err(CloudError::Unreachable)?;
        let in_cloud: BTreeSet<&str> = listing.decks.iter().map(|r| r.id.as_str()).collect();
        let mut report = FirstSync {
            failed: unsyncable.len(),
            ..FirstSync::default()
        };
        for deck in &local_decks {
            if !in_cloud.contains(deck.id.as_str()) {
                match self.push(state, deck) {
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
                    // Made in the cloud meanwhile: the first round after this settles it.
                    Ok(Pushed::Conflict(_)) => report.left_alone.push(deck.id.clone()),
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
    /// A deck changed on both sides keeps both versions (`settle`). A file this round wrote
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
                Ok(Pulled::Settled(title)) => round.copies.push(title),
                Ok(Pulled::Trashed) => round.deleted += 1,
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
        self.delete_trashed(state, &scan, &mut round)?;
        for deck in &scan.decks {
            match self.push_if_changed(state, deck, &mut round) {
                Ok(true) => round.uploaded += 1,
                Ok(false) => {}
                Err(CloudError::SignedOut) => return Err(CloudError::SignedOut),
                Err(_) => round.failed += 1,
            }
        }
        Ok(round)
    }

    /// A deck this computer agreed with the cloud that is no longer in the Decks folder was moved
    /// to the Trash: it is deleted from the cloud, so the other computers trash it too. A deck
    /// that couldn't be deleted (offline) stays in `state`, so the next round asks again. A scan
    /// that couldn't read everything deletes nothing, and a deck the cloud has since changed is
    /// brought back rather than deleted: the edit is kept.
    fn delete_trashed(
        &self,
        state: &mut State,
        scan: &Scan,
        round: &mut Round,
    ) -> Result<(), CloudError> {
        if scan.incomplete {
            return Ok(());
        }
        let gone: Vec<String> = state
            .decks
            .keys()
            .filter(|id| !scan.decks.iter().any(|d| &d.id == *id) && !scan.unsyncable.contains(id))
            .cloned()
            .collect();
        for id in gone {
            match self.delete_one(state, &id) {
                Ok(true) => round.deleted += 1,
                Ok(false) => {}
                Err(CloudError::SignedOut) => return Err(CloudError::SignedOut),
                Err(e) => {
                    log::warn!("sync.deck_failed step=delete id={id} error={e}");
                    round.failed += 1;
                }
            }
        }
        Ok(())
    }

    /// True when the cloud's deck was deleted.
    fn delete_one(&self, state: &mut State, id: &str) -> Result<bool, CloudError> {
        let agreed = state.decks.get(id).map_or(0, |b| b.revision);
        match self.cloud.get(id)? {
            Some(theirs) if theirs.revision > agreed => {
                // Edited on another computer since: it comes back here, nothing is lost.
                if self.library.add(&theirs).is_ok() {
                    state.decks.insert(id.to_string(), theirs.base());
                    log::debug!("sync.deck_delete_kept id={id} reason=edited_elsewhere");
                }
                Ok(false)
            }
            Some(_) => {
                self.cloud.delete(id)?;
                state.decks.remove(id);
                log::debug!("sync.deck_deleted id={id} side=cloud check=epic-036/V13");
                Ok(true)
            }
            // Already gone from the cloud (another computer deleted it first).
            None => {
                state.decks.remove(id);
                Ok(false)
            }
        }
    }

    fn start_over(&self, state: &mut State) -> Result<Round, CloudError> {
        *state = State::default();
        let first = self.first_sync(state)?;
        Ok(Round {
            uploaded: first.uploaded,
            downloaded: first.downloaded,
            copies: vec![],
            deleted: 0,
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
            return self.pull_deleted(state, scan, change);
        }
        let base = state.decks.get(id);
        // Our own upload, seen again.
        if base.is_some_and(|b| b.revision >= change.revision) {
            return Ok(Pulled::Nothing);
        }
        if scan.unsyncable.contains(id) {
            return Ok(Pulled::Nothing);
        }
        let Some(local) = scan.decks.iter().find(|d| &d.id == id) else {
            return self.download(state, id).map(
                |down| {
                    if down { Pulled::Down } else { Pulled::Nothing }
                },
            );
        };
        let Some(theirs) = self.cloud.get(id)? else {
            return Ok(Pulled::Nothing);
        };
        if base.is_none_or(|b| b.hash != local.hash()) {
            // Changed here and in the cloud: both versions are kept.
            return self.settle(state, local, &theirs).map(Pulled::Settled);
        }
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

    /// The cloud deleted a deck: this computer moves it to the Trash, unless it was edited here
    /// since it was last agreed. That edit is kept: the deck stays, based on the tombstone, and the
    /// next upload brings it back to the cloud.
    fn pull_deleted(
        &self,
        state: &mut State,
        scan: &Scan,
        change: &Change,
    ) -> Result<Pulled, CloudError> {
        let id = &change.id;
        let Some(base) = state.decks.get(id) else {
            return Ok(Pulled::Nothing);
        };
        // A delete this computer already knows of.
        if base.revision >= change.revision || scan.unsyncable.contains(id) {
            return Ok(Pulled::Nothing);
        }
        let Some(local) = scan.decks.iter().find(|d| &d.id == id) else {
            // Trashed here too.
            state.decks.remove(id);
            return Ok(Pulled::Nothing);
        };
        if base.hash != local.hash() {
            let hash = base.hash.clone();
            state.decks.insert(
                id.clone(),
                Base {
                    revision: change.revision,
                    hash,
                },
            );
            log::debug!("sync.deck_delete_kept id={id} reason=edited_here");
            return Ok(Pulled::Nothing);
        }
        match self.library.trash(local) {
            Ok(()) => {
                state.decks.remove(id);
                log::debug!("sync.deck_deleted id={id} side=local check=epic-036/V13");
                Ok(Pulled::Trashed)
            }
            // Edited while the round ran, or not movable: asked for again next round.
            Err(_) => {
                log::warn!("sync.deck_failed step=trash id={id} reason=not_moved");
                Err(CloudError::Unreachable("not moved".into()))
            }
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

    fn push_if_changed(
        &self,
        state: &mut State,
        deck: &LocalDeck,
        round: &mut Round,
    ) -> Result<bool, CloudError> {
        let hash = deck.hash();
        match state.decks.get(&deck.id) {
            Some(base) if base.hash == hash => return Ok(false),
            Some(_) => {}
            None => {
                // Never agreed with the cloud: a new deck, unless the cloud already has one with
                // this id.
                if let Some(theirs) = self.cloud.get(&deck.id)? {
                    if same_files(deck, &theirs) {
                        state.decks.insert(deck.id.clone(), theirs.base());
                        return Ok(false);
                    }
                    round.copies.push(self.settle(state, deck, &theirs)?);
                }
            }
        }
        let started = Instant::now();
        let mut pushed = self.push(state, deck);
        if let Ok(Pushed::Conflict(stored)) = pushed {
            // The cloud moved on since this computer last looked.
            pushed = match self.cloud.get(&deck.id)? {
                // Deleted elsewhere, but edited here (or brought back from the Trash): saved again
                // over the tombstone, so no edit is lost.
                None => {
                    log::debug!("sync.deck_delete_kept id={} reason=edited_here", deck.id);
                    match self.cloud.put(deck, stored) {
                        Ok(revision) => Ok(Pushed::Saved { revision }),
                        Err(CloudError::Stale(other)) => Ok(Pushed::Conflict(other)),
                        Err(e) => Err(e),
                    }
                }
                // Both changed: keep both, then try again.
                Some(theirs) => {
                    round.copies.push(self.settle(state, deck, &theirs)?);
                    self.push(state, deck)
                }
            };
        }
        match pushed {
            Ok(Pushed::Saved { revision }) => {
                state.decks.insert(deck.id.clone(), Base { revision, hash });
                log::debug!(
                    "sync.deck_saved id={} ms={} check=epic-036/V9",
                    deck.id,
                    started.elapsed().as_millis()
                );
                Ok(true)
            }
            // Changed again in the cloud since: the next round settles that too.
            Ok(Pushed::Conflict(_)) => Ok(false),
            Err(e) => {
                log::warn!("sync.deck_failed step=upload id={} error={e}", deck.id);
                Err(e)
            }
        }
    }

    /// Both computers changed the deck: this computer's files stay the deck, and the cloud's
    /// version is added beside it as a new deck, "… (conflict copy)" (a new id, its own folder).
    /// The deck is then agreed with the cloud's revision, so its next save goes over it, and the
    /// copy goes up as a new deck. Gives the copy's title. Nothing is deleted or overwritten.
    fn settle(
        &self,
        state: &mut State,
        local: &LocalDeck,
        theirs: &RemoteDeck,
    ) -> Result<String, CloudError> {
        let title = format!(
            "{} (conflict copy)",
            crate::quick::front_value(&theirs.deck_md, "title")
                .unwrap_or_else(|| "Untitled deck".into())
        );
        let id = crate::ids::new_id(crate::ids::DECK_PREFIX);
        let copy = RemoteDeck {
            id: id.clone(),
            deck_md: with_title(&crate::quick::with_id(&theirs.deck_md, &id), &title),
            sessions_json: theirs.sessions_json.clone(),
            revision: 0,
        };
        if self.library.add(&copy).is_err() {
            log::warn!(
                "sync.deck_failed step=conflict_copy id={} reason=not_saved",
                local.id
            );
            return Err(CloudError::Unreachable("not saved".into()));
        }
        state.decks.insert(local.id.clone(), theirs.base());
        log::warn!(
            "sync.conflict id={} kept=both copy={id} check=epic-036/V12",
            local.id
        );
        Ok(title)
    }
}

/// `text` with its front matter `title:` saying `title`, added when there is none.
fn with_title(text: &str, title: &str) -> String {
    let mut in_front = false;
    let mut done = false;
    let mut out = String::new();
    for (n, line) in text.split_inclusive('\n').enumerate() {
        let bare = line.trim_end_matches(['\r', '\n']);
        if bare == "---" {
            if in_front && !done {
                out.push_str(&format!("title: {title}\n"));
                done = true;
            }
            in_front = n == 0;
        } else if in_front
            && !done
            && bare
                .split_once(':')
                .is_some_and(|(k, _)| k.trim().eq_ignore_ascii_case("title"))
        {
            out.push_str(&format!("title: {title}{}", &line[bare.len()..]));
            done = true;
            continue;
        }
        out.push_str(line);
    }
    out
}

enum Pulled {
    Down,
    /// Moved to the Trash because the cloud deleted it.
    Trashed,
    /// Both versions kept; the conflict copy's title.
    Settled(String),
    Nothing,
}

fn same_files(local: &LocalDeck, remote: &RemoteDeck) -> bool {
    local.deck_md == remote.deck_md && local.sessions_json == remote.sessions_json
}
