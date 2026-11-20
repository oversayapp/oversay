//! The sync module through its public seam (`Sync::push`, `pull`, `first_sync`), with a fake cloud
//! that keeps decks and revisions in memory and a fake library standing in for the Decks folder.

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};

use super::*;
use crate::test_log;

#[derive(Default)]
struct CloudState {
    decks: BTreeMap<String, RemoteDeck>,
    requests: Vec<String>,
    unreachable: bool,
    /// Ids whose PUT is refused.
    refuse_put: Vec<String>,
    /// The account's changes, oldest first: (change number, id, revision). The cursor is the last.
    log: Vec<(u64, String, u64, bool)>,
    /// Deleted decks keep their revision, as the real API does.
    tombstones: BTreeMap<String, u64>,
    /// Ids whose DELETE answers 401 (a deleted account's token).
    refuse_delete: Vec<String>,
}

/// A fake server: what the real API does for one account, without the network.
#[derive(Clone, Default)]
struct FakeCloud(Arc<Mutex<CloudState>>);

impl FakeCloud {
    fn with(decks: &[LocalDeck]) -> Self {
        let cloud = FakeCloud::default();
        for d in decks {
            cloud.0.lock().unwrap().decks.insert(
                d.id.clone(),
                RemoteDeck {
                    id: d.id.clone(),
                    deck_md: d.deck_md.clone(),
                    sessions_json: d.sessions_json.clone(),
                    revision: 1,
                },
            );
            let mut st = cloud.0.lock().unwrap();
            let n = st.log.len() as u64 + 1;
            st.log.push((n, d.id.clone(), 1, false));
        }
        cloud
    }
    fn ids(&self) -> Vec<String> {
        self.0.lock().unwrap().decks.keys().cloned().collect()
    }
    fn requests(&self) -> Vec<String> {
        self.0.lock().unwrap().requests.clone()
    }
}

impl Cloud for FakeCloud {
    fn list(&self) -> Result<Listing, CloudError> {
        let s = &mut *self.0.lock().unwrap();
        s.requests.push("list".into());
        if s.unreachable {
            return Err(CloudError::Unreachable("offline".into()));
        }
        Ok(Listing {
            decks: s
                .decks
                .values()
                .map(|d| RemoteSummary {
                    id: d.id.clone(),
                    revision: d.revision,
                })
                .collect(),
            cursor: s.log.last().map_or(0, |l| l.0),
        })
    }
    fn changes(&self, since: u64) -> Result<Changes, CloudError> {
        let s = &mut *self.0.lock().unwrap();
        s.requests.push(format!("changes {since}"));
        if s.unreachable {
            return Err(CloudError::Unreachable("offline".into()));
        }
        let cursor = s.log.last().map_or(0, |l| l.0);
        if since > cursor {
            return Ok(Changes {
                items: vec![],
                cursor,
            });
        }
        Ok(Changes {
            items: s
                .log
                .iter()
                .filter(|l| l.0 > since)
                .map(|l| Change {
                    id: l.1.clone(),
                    revision: l.2,
                    deleted: l.3,
                })
                .collect(),
            cursor,
        })
    }
    fn get(&self, id: &str) -> Result<Option<RemoteDeck>, CloudError> {
        let s = &mut *self.0.lock().unwrap();
        s.requests.push(format!("get {id}"));
        Ok(s.decks.get(id).cloned())
    }
    fn put(&self, deck: &LocalDeck, base: u64) -> Result<u64, CloudError> {
        let s = &mut *self.0.lock().unwrap();
        s.requests.push(format!("put {}", deck.id));
        if s.unreachable {
            return Err(CloudError::Unreachable("offline".into()));
        }
        let stored = s.decks.get(&deck.id).map_or_else(
            || s.tombstones.get(&deck.id).copied().unwrap_or(0),
            |d| d.revision,
        );
        if stored != base {
            return Err(CloudError::Stale(stored));
        }
        if s.refuse_put.contains(&deck.id) {
            return Err(CloudError::Refused(413));
        }
        let revision = stored + 1;
        s.tombstones.remove(&deck.id);
        s.decks.insert(
            deck.id.clone(),
            RemoteDeck {
                id: deck.id.clone(),
                deck_md: deck.deck_md.clone(),
                sessions_json: deck.sessions_json.clone(),
                revision,
            },
        );
        let n = s.log.last().map_or(0, |l| l.0) + 1;
        s.log.push((n, deck.id.clone(), revision, false));
        Ok(revision)
    }
    fn delete(&self, id: &str) -> Result<(), CloudError> {
        let s = &mut *self.0.lock().unwrap();
        s.requests.push(format!("delete {id}"));
        if s.unreachable {
            return Err(CloudError::Unreachable("offline".into()));
        }
        if s.refuse_delete.contains(&id.to_string()) {
            return Err(CloudError::Refused(401));
        }
        let Some(gone) = s.decks.remove(id) else {
            return Ok(());
        };
        let revision = gone.revision + 1;
        s.tombstones.insert(id.to_string(), revision);
        let n = s.log.last().map_or(0, |l| l.0) + 1;
        s.log.push((n, id.to_string(), revision, true));
        Ok(())
    }
}

#[derive(Clone, Default)]
/// Decks, ids of unsyncable decks, and what was moved to the Trash.
struct FakeLibrary(
    Arc<Mutex<Vec<LocalDeck>>>,
    Arc<Mutex<Vec<String>>>,
    Arc<Mutex<Vec<LocalDeck>>>,
    Arc<Mutex<bool>>,
);

impl FakeLibrary {
    fn with(decks: Vec<LocalDeck>) -> Self {
        FakeLibrary(
            Arc::new(Mutex::new(decks)),
            Arc::default(),
            Arc::default(),
            Arc::default(),
        )
    }
    fn all(&self) -> Vec<LocalDeck> {
        self.0.lock().unwrap().clone()
    }
    /// The user moves a deck's folder to the Trash.
    fn trash_by_hand(&self, id: &str) {
        let mut all = self.0.lock().unwrap();
        let at = all.iter().position(|d| d.id == id).unwrap();
        let gone = all.remove(at);
        self.2.lock().unwrap().push(gone);
    }
    /// The user puts a deck back from the Trash.
    fn restore_by_hand(&self, id: &str) {
        let gone = {
            let mut bin = self.2.lock().unwrap();
            let at = bin.iter().position(|d| d.id == id).unwrap();
            bin.remove(at)
        };
        self.0.lock().unwrap().push(gone);
    }
    fn trashed(&self) -> Vec<String> {
        self.2
            .lock()
            .unwrap()
            .iter()
            .map(|d| d.id.clone())
            .collect()
    }
    /// Someone (the editor, an AI skill) rewrites a deck's files here.
    fn edit(&self, id: &str, deck_md: &str) {
        let mut all = self.0.lock().unwrap();
        all.iter_mut().find(|d| d.id == id).unwrap().deck_md = deck_md.into();
    }
}

impl Library for FakeLibrary {
    fn scan(&self) -> Result<Scan, String> {
        Ok(Scan {
            decks: self.all(),
            unsyncable: self.1.lock().unwrap().clone(),
            incomplete: *self.3.lock().unwrap(),
        })
    }
    fn replace(&self, expected: &LocalDeck, deck: &RemoteDeck) -> Result<(), String> {
        let mut all = self.0.lock().unwrap();
        let here = all.iter_mut().find(|d| d.id == deck.id).ok_or("gone")?;
        if here != expected {
            return Err("changed meanwhile".into());
        }
        here.deck_md = deck.deck_md.clone();
        here.sessions_json = deck.sessions_json.clone();
        Ok(())
    }
    fn trash(&self, expected: &LocalDeck) -> Result<(), String> {
        let mut all = self.0.lock().unwrap();
        let at = all.iter().position(|d| d.id == expected.id).ok_or("gone")?;
        if &all[at] != expected {
            return Err("changed meanwhile".into());
        }
        let gone = all.remove(at);
        self.2.lock().unwrap().push(gone);
        Ok(())
    }
    fn add(&self, deck: &RemoteDeck) -> Result<(), String> {
        self.0.lock().unwrap().push(LocalDeck {
            id: deck.id.clone(),
            deck_md: deck.deck_md.clone(),
            sessions_json: deck.sessions_json.clone(),
        });
        Ok(())
    }
}

fn deck(id: &str, title: &str) -> LocalDeck {
    LocalDeck {
        id: id.into(),
        deck_md: format!("---\nid: {id}\ntitle: {title}\n---\n## Secret card text {id}\n"),
        sessions_json: format!("{{\"version\":1,\"sessions\":[],\"mark\":\"{id}\"}}"),
    }
}

fn five() -> Vec<LocalDeck> {
    [
        "d_aaaaaaa1",
        "d_aaaaaaa2",
        "d_aaaaaaa3",
        "d_aaaaaaa4",
        "d_aaaaaaa5",
    ]
    .iter()
    .map(|id| deck(id, &format!("Deck {id}")))
    .collect()
}

fn sync(cloud: &FakeCloud, library: &FakeLibrary) -> Sync<FakeCloud, FakeLibrary> {
    test_log::start();
    Sync::new(cloud.clone(), library.clone())
}

#[test]
fn turning_it_on_uploads_every_local_deck() {
    let library = FakeLibrary::with(five());
    let cloud = FakeCloud::default();
    let report = sync(&cloud, &library)
        .first_sync(&mut State::default())
        .unwrap();
    assert_eq!(report.uploaded, 5);
    assert_eq!(report.downloaded, 0);
    assert_eq!(cloud.ids().len(), 5);
    // The two files, byte for byte.
    let stored = cloud.0.lock().unwrap().decks["d_aaaaaaa3"].clone();
    assert_eq!(stored.deck_md, five()[2].deck_md);
    assert_eq!(stored.sessions_json, five()[2].sessions_json);
    assert!(
        test_log::lines()
            .iter()
            .any(|l| l.contains("sync.initial_upload decks=5") && l.contains("check=epic-036/V8"))
    );
}

#[test]
fn a_second_computer_downloads_every_deck() {
    let cloud = FakeCloud::with(&five());
    let library = FakeLibrary::default();
    let report = sync(&cloud, &library)
        .first_sync(&mut State::default())
        .unwrap();
    assert_eq!(report.downloaded, 5);
    assert_eq!(report.uploaded, 0);
    assert_eq!(library.all().len(), 5);
    assert_eq!(library.all()[0], five()[0]);
    assert!(
        test_log::lines().iter().any(
            |l| l.contains("sync.initial_download decks=5") && l.contains("check=epic-036/V10")
        )
    );
    // Nothing was written back.
    assert!(cloud.requests().iter().all(|r| !r.starts_with("put")));
}

#[test]
fn decks_are_matched_by_id_not_by_title() {
    // Same title, different ids: two decks, neither replaces the other.
    let library = FakeLibrary::with(vec![deck("d_local001", "Standup")]);
    let cloud = FakeCloud::with(&[deck("d_cloud001", "Standup")]);
    let report = sync(&cloud, &library)
        .first_sync(&mut State::default())
        .unwrap();
    assert_eq!((report.uploaded, report.downloaded), (1, 1));
    assert_eq!(cloud.ids(), vec!["d_cloud001", "d_local001"]);
    assert_eq!(library.all().len(), 2);
}

#[test]
fn a_deck_the_cloud_already_has_is_left_alone_on_both_sides() {
    let mine = deck("d_samesame", "Mine");
    let mut theirs = deck("d_samesame", "Theirs");
    theirs.deck_md.push_str("a later edit\n");
    let library = FakeLibrary::with(vec![mine.clone()]);
    let cloud = FakeCloud::with(&[theirs.clone()]);
    let report = sync(&cloud, &library)
        .first_sync(&mut State::default())
        .unwrap();
    assert_eq!(report.left_alone, vec!["d_samesame".to_string()]);
    assert_eq!((report.uploaded, report.downloaded), (0, 0));
    assert_eq!(library.all(), vec![mine]);
    assert_eq!(
        cloud.0.lock().unwrap().decks["d_samesame"].deck_md,
        theirs.deck_md
    );
    assert!(cloud.requests().iter().all(|r| !r.starts_with("put")));
    assert!(
        test_log::lines()
            .iter()
            .any(|l| l.contains("sync.initial_differs id=d_samesame"))
    );
}

#[test]
fn an_identical_deck_is_neither_uploaded_nor_downloaded() {
    let d = deck("d_samesame", "Same");
    let library = FakeLibrary::with(vec![d.clone()]);
    let cloud = FakeCloud::with(&[d]);
    let report = sync(&cloud, &library)
        .first_sync(&mut State::default())
        .unwrap();
    assert_eq!(
        (report.uploaded, report.downloaded, report.left_alone.len()),
        (0, 0, 0)
    );
    assert_eq!(library.all().len(), 1);
}

#[test]
fn turning_it_on_twice_changes_nothing_the_second_time() {
    let library = FakeLibrary::with(five());
    let cloud = FakeCloud::default();
    let mut state = State::default();
    sync(&cloud, &library).first_sync(&mut state).unwrap();
    let again = sync(&cloud, &library).first_sync(&mut state).unwrap();
    assert_eq!((again.uploaded, again.downloaded, again.failed), (0, 0, 0));
    assert_eq!(library.all().len(), 5);
}

#[test]
fn one_deck_refused_does_not_stop_the_others() {
    let library = FakeLibrary::with(five());
    let cloud = FakeCloud::default();
    cloud.0.lock().unwrap().refuse_put.push("d_aaaaaaa2".into());
    let report = sync(&cloud, &library)
        .first_sync(&mut State::default())
        .unwrap();
    assert_eq!((report.uploaded, report.failed), (4, 1));
    assert!(
        test_log::lines()
            .iter()
            .any(|l| l.contains("sync.initial_upload decks=4"))
    );
}

#[test]
fn an_unreachable_cloud_stops_before_anything_changes() {
    let library = FakeLibrary::with(five());
    let cloud = FakeCloud::default();
    cloud.0.lock().unwrap().unreachable = true;
    let err = sync(&cloud, &library)
        .first_sync(&mut State::default())
        .unwrap_err();
    assert_eq!(err, CloudError::Unreachable("offline".into()));
    assert!(cloud.ids().is_empty());
    assert_eq!(library.all().len(), 5);
}

#[test]
fn push_saves_one_deck_and_says_its_revision() {
    let library = FakeLibrary::default();
    let cloud = FakeCloud::default();
    let s = sync(&cloud, &library);
    let d = deck("d_aaaaaaa1", "One");
    let mut state = State::default();
    assert_eq!(s.push(&state, &d).unwrap(), Pushed::Saved { revision: 1 });
    state.decks.insert(
        d.id.clone(),
        Base {
            revision: 1,
            hash: d.hash(),
        },
    );
    assert_eq!(s.push(&state, &d).unwrap(), Pushed::Saved { revision: 2 });
    // Based on a revision the cloud has moved past: refused, nothing changes.
    assert_eq!(s.push(&state, &d).unwrap(), Pushed::Conflict(2));
}

#[test]
fn logs_never_hold_deck_content() {
    let library = FakeLibrary::with(five());
    let cloud = FakeCloud::default();
    sync(&cloud, &library)
        .first_sync(&mut State::default())
        .unwrap();
    let other = FakeLibrary::default();
    sync(&cloud, &other)
        .first_sync(&mut State::default())
        .unwrap();
    for line in test_log::lines() {
        assert!(!line.contains("Secret card text"), "{line}");
        assert!(!line.contains("Deck d_"), "{line}");
    }
}

// ---- the real cloud over a fake transport: what the API's README says goes on the wire

mod api {
    use super::*;
    use crate::sync::cloud::{ApiCloud, Transport};

    #[derive(Default)]
    struct FakeWire {
        sent: Mutex<Vec<(String, String, String)>>,
        reply: Mutex<(u16, String)>,
    }
    impl Transport for Arc<FakeWire> {
        fn get(&self, path: &str) -> Result<(u16, String), CloudError> {
            self.sent
                .lock()
                .unwrap()
                .push(("GET".into(), path.into(), String::new()));
            Ok(self.reply.lock().unwrap().clone())
        }
        fn put(&self, path: &str, body: &str) -> Result<(u16, String), CloudError> {
            self.sent
                .lock()
                .unwrap()
                .push(("PUT".into(), path.into(), body.into()));
            Ok(self.reply.lock().unwrap().clone())
        }
        fn delete(&self, path: &str) -> Result<(u16, String), CloudError> {
            self.sent
                .lock()
                .unwrap()
                .push(("DELETE".into(), path.into(), String::new()));
            Ok(self.reply.lock().unwrap().clone())
        }
    }
    fn wire(status: u16, body: &str) -> (ApiCloud<Arc<FakeWire>>, Arc<FakeWire>) {
        let w = Arc::new(FakeWire::default());
        *w.reply.lock().unwrap() = (status, body.into());
        (ApiCloud(w.clone()), w)
    }

    #[test]
    fn list_reads_the_ids_and_revisions() {
        let (cloud, wire) = wire(
            200,
            r#"{"decks":[{"id":"d_k3x9a2bq","title":"A","revision":3,"change":9,"updatedAt":"x"}],"cursor":9}"#,
        );
        assert_eq!(
            cloud.list().unwrap(),
            Listing {
                decks: vec![RemoteSummary {
                    id: "d_k3x9a2bq".into(),
                    revision: 3
                }],
                cursor: 9
            }
        );
        assert_eq!(wire.sent.lock().unwrap()[0].1, "/decks");
    }

    #[test]
    fn changes_asks_since_the_cursor_and_reads_tombstones() {
        let (cloud, wire) = wire(
            200,
            r#"{"decks":[{"id":"d_k3x9a2bq","title":"A","revision":3,"change":10},{"id":"d_aaaaaaa1","deleted":true,"revision":2,"change":11}],"cursor":12}"#,
        );
        let got = cloud.changes(9).unwrap();
        assert_eq!(wire.sent.lock().unwrap()[0].1, "/decks?since=9");
        assert_eq!(got.cursor, 12);
        assert_eq!(
            got.items,
            vec![
                Change {
                    id: "d_k3x9a2bq".into(),
                    revision: 3,
                    deleted: false
                },
                Change {
                    id: "d_aaaaaaa1".into(),
                    revision: 2,
                    deleted: true
                },
            ]
        );
    }

    #[test]
    fn get_reads_the_two_files_and_a_404_is_no_deck() {
        let (cloud, _) = wire(
            200,
            r#"{"id":"d_k3x9a2bq","deckMd":"---\nid: d_k3x9a2bq\n---\n","sessionsJson":"{}","revision":2,"change":1}"#,
        );
        let deck = cloud.get("d_k3x9a2bq").unwrap().unwrap();
        assert_eq!(
            (
                deck.deck_md.as_str(),
                deck.sessions_json.as_str(),
                deck.revision
            ),
            ("---\nid: d_k3x9a2bq\n---\n", "{}", 2)
        );
        let (cloud, _) = wire(404, r#"{"error":"not found"}"#);
        assert_eq!(cloud.get("d_k3x9a2bq").unwrap(), None);
    }

    #[test]
    fn put_sends_only_the_two_files_to_the_decks_own_path() {
        let (cloud, wire) = wire(
            200,
            r#"{"id":"d_k3x9a2bq","deckMd":"","sessionsJson":"{}","revision":4}"#,
        );
        let revision = cloud.put(&deck("d_k3x9a2bq", "T"), 3).unwrap();
        assert_eq!(revision, 4);
        let (method, path, body) = wire.sent.lock().unwrap()[0].clone();
        assert_eq!(
            (method.as_str(), path.as_str()),
            ("PUT", "/decks/d_k3x9a2bq")
        );
        let sent: serde_json::Value = serde_json::from_str(&body).unwrap();
        let mut keys: Vec<_> = sent.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        assert_eq!(keys, vec!["baseRevision", "deckMd", "sessionsJson"]);
        assert_eq!(sent["baseRevision"], 3);
    }

    #[test]
    fn delete_sends_a_delete_to_the_decks_own_path_and_a_404_counts_as_gone() {
        let (cloud, wire) = wire(204, "");
        assert_eq!(cloud.delete("d_k3x9a2bq"), Ok(()));
        assert_eq!(
            wire.sent.lock().unwrap()[0],
            ("DELETE".into(), "/decks/d_k3x9a2bq".into(), String::new())
        );
        let (cloud, _) = wire_with(404);
        assert_eq!(cloud.delete("d_k3x9a2bq"), Ok(()));
        let (cloud, w) = wire_with(401);
        assert_eq!(cloud.delete("d_k3x9a2bq"), Err(CloudError::Refused(401)));
        assert_eq!(cloud.delete("../x"), Err(CloudError::Refused(400)));
        assert_eq!(w.sent.lock().unwrap().len(), 1);
    }
    fn wire_with(status: u16) -> (ApiCloud<Arc<FakeWire>>, Arc<FakeWire>) {
        wire(status, r#"{"error":"x"}"#)
    }

    #[test]
    fn a_409_is_stale_so_the_save_is_not_a_failure() {
        let (cloud, _) = wire(409, r#"{"error":"x","revision":5}"#);
        assert_eq!(
            cloud.put(&deck("d_k3x9a2bq", "T"), 3),
            Err(CloudError::Stale(5))
        );
    }

    #[test]
    fn an_error_status_is_a_refusal_and_a_bad_id_never_reaches_the_wire() {
        let (cloud, wire) = wire(401, r#"{"error":"x"}"#);
        assert_eq!(cloud.list().unwrap_err(), CloudError::Refused(401));
        assert_eq!(cloud.changes(3).unwrap_err(), CloudError::Refused(401));
        assert_eq!(cloud.get("../../x").unwrap_err(), CloudError::Refused(400));
        assert_eq!(wire.sent.lock().unwrap().len(), 2);
    }
}

// ---- the real library over a temporary Decks folder

mod folder {
    use super::*;
    use crate::sync::library::{FolderLibrary, NO_SESSIONS};
    use std::fs;
    use std::path::Path;

    fn temp(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("oversay-sync-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }
    fn write(dir: &Path, rel: &str, text: &str) {
        let file = dir.join(rel);
        fs::create_dir_all(file.parent().unwrap()).unwrap();
        fs::write(file, text).unwrap();
    }

    #[test]
    fn only_deck_md_and_sessions_json_are_read_and_matched_by_id() {
        let dir = temp("read");
        let d = deck("d_aaaaaaa1", "One");
        write(&dir, "Folder A 2026-11-20/deck.md", &d.deck_md);
        write(&dir, "Folder A 2026-11-20/sessions.json", &d.sessions_json);
        write(&dir, "Folder A 2026-11-20/resources/secret.pdf", "RESOURCE");
        write(&dir, "Folder A 2026-11-20/transcripts/t.md", "TRANSCRIPT");
        write(
            &dir,
            "No sessions 2026-11-20/deck.md",
            &deck("d_aaaaaaa2", "Two").deck_md,
        );
        write(
            &dir,
            "No id 2026-11-20/deck.md",
            "---\ntitle: x\n---\n## c\n",
        );
        write(&dir, "Lone.md", &deck("d_aaaaaaa3", "Lone").deck_md);
        let mut found = FolderLibrary(dir.clone()).scan().unwrap().decks;
        found.sort_by(|a, b| a.id.cmp(&b.id));
        assert_eq!(found.len(), 2);
        assert_eq!(found[0], d);
        assert_eq!(found[1].sessions_json, NO_SESSIONS);
        let _ = fs::remove_dir_all(dir);
    }

    #[cfg(unix)]
    #[test]
    fn a_symlinked_file_is_never_followed_and_so_never_uploaded() {
        let dir = temp("links");
        let outside = temp("outside");
        write(&outside, "other.json", "{\"secret\":true}");
        write(&outside, "other.md", &deck("d_aaaaaaa9", "Else").deck_md);
        // A deck whose sessions.json points at another file.
        write(
            &dir,
            "A 2026-11-20/deck.md",
            &deck("d_aaaaaaa1", "A").deck_md,
        );
        std::os::unix::fs::symlink(
            outside.join("other.json"),
            dir.join("A 2026-11-20/sessions.json"),
        )
        .unwrap();
        // A deck whose deck.md points at another file.
        fs::create_dir_all(dir.join("B 2026-11-20")).unwrap();
        std::os::unix::fs::symlink(outside.join("other.md"), dir.join("B 2026-11-20/deck.md"))
            .unwrap();
        let found = FolderLibrary(dir.clone()).scan().unwrap().decks;
        assert!(found.iter().all(|d| !d.sessions_json.contains("secret")));
        assert!(found.iter().all(|d| d.id != "d_aaaaaaa9"));
        let _ = fs::remove_dir_all(dir);
        let _ = fs::remove_dir_all(outside);
    }

    #[test]
    fn a_failed_download_logs_no_deck_title_or_path() {
        test_log::start();
        // A folder that can't be made: Decks is a file.
        let dir = temp("nofolder");
        let blocker = dir.join("Decks");
        fs::write(&blocker, "x").unwrap();
        let cloud = FakeCloud::with(&[deck("d_aaaaaaa1", "Private title")]);
        let report = Sync::new(cloud, FolderLibrary(blocker))
            .first_sync(&mut State::default())
            .unwrap();
        assert_eq!(report.failed, 1);
        assert!(
            test_log::lines()
                .iter()
                .any(|l| l.contains("sync.deck_failed"))
        );
        assert!(test_log::lines().iter().all(
            |l| !l.contains("Private title") && !l.contains(&dir.to_string_lossy().to_string())
        ));
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn a_downloaded_deck_gets_a_folder_named_by_its_title_and_both_files() {
        let dir = temp("add");
        let remote = RemoteDeck {
            id: "d_aaaaaaa1".into(),
            deck_md: deck("d_aaaaaaa1", "Weekly standup").deck_md,
            sessions_json: "{\"version\":1,\"sessions\":[]}\n".into(),
            revision: 1,
        };
        let lib = FolderLibrary(dir.clone());
        lib.add(&remote).unwrap();
        let folder = fs::read_dir(&dir).unwrap().next().unwrap().unwrap().path();
        assert!(
            folder
                .file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("Weekly standup 20")
        );
        assert_eq!(
            fs::read_to_string(folder.join("deck.md")).unwrap(),
            remote.deck_md
        );
        assert_eq!(
            fs::read_to_string(folder.join("sessions.json")).unwrap(),
            remote.sessions_json
        );
        // It reads back as the same deck.
        assert_eq!(lib.scan().unwrap().decks[0].id, "d_aaaaaaa1");
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn replace_writes_the_cloud_files_over_the_deck_unless_it_was_edited_since() {
        let dir = temp("replace");
        let d = deck("d_aaaaaaa1", "One");
        write(&dir, "One 2026-11-20/deck.md", &d.deck_md);
        write(&dir, "One 2026-11-20/sessions.json", &d.sessions_json);
        write(&dir, "One 2026-11-20/resources/keep.pdf", "RESOURCE");
        let lib = FolderLibrary(dir.clone());
        let theirs = RemoteDeck {
            id: d.id.clone(),
            deck_md: format!("{}more\n", d.deck_md),
            sessions_json: "{\"version\":1,\"sessions\":[]}\n".into(),
            revision: 2,
        };
        // Edited after the scan: refused, nothing written.
        write(
            &dir,
            "One 2026-11-20/deck.md",
            "---\nid: d_aaaaaaa1\n---\n## typed\n",
        );
        assert!(lib.replace(&d, &theirs).is_err());
        assert!(
            fs::read_to_string(dir.join("One 2026-11-20/deck.md"))
                .unwrap()
                .contains("## typed")
        );
        // As scanned: both files replaced, the rest left alone.
        write(&dir, "One 2026-11-20/deck.md", &d.deck_md);
        lib.replace(&d, &theirs).unwrap();
        let now = lib.scan().unwrap().decks;
        assert_eq!(
            (now[0].deck_md.as_str(), now[0].sessions_json.as_str()),
            (theirs.deck_md.as_str(), theirs.sessions_json.as_str())
        );
        assert!(dir.join("One 2026-11-20/resources/keep.pdf").exists());
        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn trash_refuses_a_deck_edited_since_it_was_read_and_a_folder_that_cannot_be_listed_hides_nothing()
     {
        let dir = temp("trash");
        write(&dir, "One/deck.md", "---\nid: d_aaaaaaa1\n---\n## one\n");
        let lib = crate::sync::library::FolderLibrary(dir.clone());
        let scan = lib.scan().unwrap();
        assert!(!scan.incomplete);
        write(
            &dir,
            "One/deck.md",
            "---\nid: d_aaaaaaa1\n---\n## typed since\n",
        );
        assert_eq!(
            lib.trash(&scan.decks[0]),
            Err("changed meanwhile".to_string())
        );
        assert!(dir.join("One/deck.md").exists());
        let missing = crate::sync::library::FolderLibrary(dir.join("nope"));
        assert!(missing.scan().unwrap().incomplete);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_deck_whose_text_carries_another_id_is_not_made() {
        let dir = temp("wrongid");
        let remote = RemoteDeck {
            id: "d_aaaaaaa1".into(),
            deck_md: deck("d_bbbbbbb2", "X").deck_md,
            sessions_json: "{}".into(),
            revision: 1,
        };
        assert!(FolderLibrary(dir.clone()).add(&remote).is_err());
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 0);
        let _ = fs::remove_dir_all(dir);
    }
}

#[test]
fn a_local_deck_that_cannot_be_saved_is_not_downloaded_beside_itself() {
    let library = FakeLibrary::default();
    library.1.lock().unwrap().push("d_aaaaaaa1".into());
    let cloud = FakeCloud::with(&[deck("d_aaaaaaa1", "Here already")]);
    let report = sync(&cloud, &library)
        .first_sync(&mut State::default())
        .unwrap();
    assert_eq!((report.downloaded, report.failed), (0, 1));
    assert!(library.all().is_empty());
}

#[test]
fn an_untitled_deck_comes_down_byte_for_byte() {
    let dir = std::env::temp_dir().join(format!("oversay-sync-untitled-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let remote = RemoteDeck {
        id: "d_aaaaaaa1".into(),
        deck_md: "---\nid: d_aaaaaaa1\n---\n## Card\n".into(),
        sessions_json: "{}".into(),
        revision: 1,
    };
    let lib = crate::sync::library::FolderLibrary(dir.clone());
    lib.add(&remote).unwrap();
    assert_eq!(lib.scan().unwrap().decks[0].deck_md, remote.deck_md);
    let _ = std::fs::remove_dir_all(dir);
}

// ---- keeping decks saved (slice 5): rounds, the debounce, pulling

mod keeping {
    use super::*;
    use crate::sync::saver::{Activity, SAVE_DELAY, Saver};
    use std::time::{Duration, Instant};

    /// Two computers share one fake cloud; each has its own folder, state and sync.
    struct Computer {
        library: FakeLibrary,
        state: State,
    }

    fn started(cloud: &FakeCloud, decks: Vec<LocalDeck>) -> Computer {
        let library = FakeLibrary::with(decks);
        let mut state = State::default();
        sync(cloud, &library).first_sync(&mut state).unwrap();
        Computer { library, state }
    }

    fn puts(cloud: &FakeCloud) -> usize {
        cloud
            .requests()
            .iter()
            .filter(|r| r.starts_with("put"))
            .count()
    }

    #[test]
    fn edit_uploads_after_debounce() {
        let cloud = FakeCloud::default();
        let a = started(&cloud, vec![deck("d_aaaaaaa1", "One")]);
        let s = sync(&cloud, &a.library);
        let t0 = Instant::now();
        let mut saver = Saver::new(a.state.clone(), t0);
        // Launch's first round finds nothing to do.
        assert!(saver.run_due(t0, &s).unwrap().is_ok());
        let before = puts(&cloud);

        a.library
            .edit("d_aaaaaaa1", "---\nid: d_aaaaaaa1\n---\n## edited\n");
        saver.edited(t0);
        assert_eq!(saver.activity(), Activity::Saving);
        // Still inside the debounce: nothing is sent.
        assert!(saver.run_due(t0 + Duration::from_secs(1), &s).is_none());
        assert_eq!(puts(&cloud), before);
        assert_eq!(saver.activity(), Activity::Saving);
        // A second edit restarts the wait.
        saver.edited(t0 + Duration::from_secs(1));
        assert!(saver.run_due(t0 + SAVE_DELAY, &s).is_none());

        let round = saver
            .run_due(t0 + Duration::from_secs(1) + SAVE_DELAY, &s)
            .unwrap()
            .unwrap();
        assert_eq!(round.uploaded, 1);
        assert_eq!(saver.activity(), Activity::Saved);
        assert!(SAVE_DELAY < Duration::from_secs(10));
        assert!(
            cloud.0.lock().unwrap().decks["d_aaaaaaa1"]
                .deck_md
                .contains("## edited")
        );
        assert!(
            test_log::lines()
                .iter()
                .any(|l| l.contains("sync.deck_saved id=d_aaaaaaa1 ms=")
                    && l.contains("check=epic-036/V9"))
        );
    }

    #[test]
    fn an_edit_on_b_appears_on_a_at_its_next_sync() {
        let cloud = FakeCloud::default();
        let mut a = started(&cloud, vec![deck("d_aaaaaaa1", "One")]);
        let mut b = Computer {
            library: FakeLibrary::default(),
            state: State::default(),
        };
        sync(&cloud, &b.library).first_sync(&mut b.state).unwrap();
        assert_eq!(b.library.all().len(), 1);

        let edited = "---\nid: d_aaaaaaa1\ntitle: One\n---\n## from B\n";
        b.library.edit("d_aaaaaaa1", edited);
        let round = sync(&cloud, &b.library).sync_once(&mut b.state).unwrap();
        assert_eq!(round.uploaded, 1);

        let round = sync(&cloud, &a.library).sync_once(&mut a.state).unwrap();
        assert_eq!((round.downloaded, round.uploaded), (1, 0));
        assert_eq!(a.library.all()[0].deck_md, edited);
        assert!(
            test_log::lines()
                .iter()
                .any(|l| l.contains("sync.deck_pulled id=d_aaaaaaa1") && l.contains("epic-036/V11"))
        );
    }

    #[test]
    fn a_new_deck_made_on_b_comes_down_on_a() {
        let cloud = FakeCloud::default();
        let mut a = started(&cloud, vec![]);
        let b = started(&cloud, vec![]);
        b.library.0.lock().unwrap().push(deck("d_bbbbbbb1", "New"));
        let mut b_state = b.state.clone();
        sync(&cloud, &b.library).sync_once(&mut b_state).unwrap();
        let round = sync(&cloud, &a.library).sync_once(&mut a.state).unwrap();
        assert_eq!(round.downloaded, 1);
        assert_eq!(a.library.all()[0].id, "d_bbbbbbb1");
    }

    #[test]
    fn what_a_pull_wrote_is_never_uploaded_back() {
        let cloud = FakeCloud::default();
        let mut a = started(&cloud, vec![deck("d_aaaaaaa1", "One")]);
        let mut b = started(&cloud, vec![]);
        a.library
            .edit("d_aaaaaaa1", "---\nid: d_aaaaaaa1\n---\n## new\n");
        sync(&cloud, &a.library).sync_once(&mut a.state).unwrap();
        sync(&cloud, &b.library).sync_once(&mut b.state).unwrap();
        let puts_before = puts(&cloud);
        // B's watcher fires for the file the pull wrote, and its next rounds find nothing to send.
        for _ in 0..3 {
            let round = sync(&cloud, &b.library).sync_once(&mut b.state).unwrap();
            assert_eq!((round.uploaded, round.downloaded), (0, 0));
        }
        // And A doesn't pull its own upload back.
        let round = sync(&cloud, &a.library).sync_once(&mut a.state).unwrap();
        assert_eq!((round.uploaded, round.downloaded), (0, 0));
        assert_eq!(puts(&cloud), puts_before);
    }

    /// A and B share a deck; B uploads an edit; A edits the same deck before it has pulled.
    fn both_edit() -> (FakeCloud, Computer, Computer) {
        let cloud = FakeCloud::default();
        let a = started(&cloud, vec![deck("d_aaaaaaa1", "One")]);
        let mut b = started(&cloud, vec![]);
        sync(&cloud, &b.library).sync_once(&mut b.state).unwrap();
        b.library
            .edit("d_aaaaaaa1", "---\nid: d_aaaaaaa1\ntitle: One\n---\n## B\n");
        sync(&cloud, &b.library).sync_once(&mut b.state).unwrap();
        a.library
            .edit("d_aaaaaaa1", "---\nid: d_aaaaaaa1\ntitle: One\n---\n## A\n");
        (cloud, a, b)
    }

    fn texts(c: &Computer) -> Vec<String> {
        let mut all: Vec<_> = c.library.all().into_iter().map(|d| d.deck_md).collect();
        all.sort();
        all
    }

    #[test]
    fn conflict_keeps_both() {
        let (cloud, mut a, mut b) = both_edit();
        let round = sync(&cloud, &a.library).sync_once(&mut a.state).unwrap();
        assert_eq!(round.copies, vec!["One (conflict copy)".to_string()]);
        // This computer's edit stays the deck; the other computer's version is the named copy.
        let all = a.library.all();
        assert_eq!(all.len(), 2);
        let mine = all.iter().find(|d| d.id == "d_aaaaaaa1").unwrap();
        assert!(mine.deck_md.contains("## A"));
        let copy = all.iter().find(|d| d.id != "d_aaaaaaa1").unwrap();
        assert!(
            copy.deck_md.contains("## B") && copy.deck_md.contains("title: One (conflict copy)")
        );
        assert!(copy.deck_md.contains(&format!("id: {}", copy.id)));
        // Both went up: nothing is lost in the cloud either.
        assert_eq!(cloud.ids().len(), 2);
        assert!(
            cloud.0.lock().unwrap().decks["d_aaaaaaa1"]
                .deck_md
                .contains("## A")
        );
        assert!(
            test_log::lines()
                .iter()
                .any(|l| l.contains("sync.conflict id=d_aaaaaaa1 kept=both"))
        );
        // The other computer ends with the same two decks, and nothing more goes up.
        sync(&cloud, &b.library).sync_once(&mut b.state).unwrap();
        assert_eq!(texts(&a), texts(&b));
        let puts_before = puts(&cloud);
        for _ in 0..2 {
            let again = sync(&cloud, &a.library).sync_once(&mut a.state).unwrap();
            assert_eq!((again.uploaded, again.downloaded), (0, 0));
            let again = sync(&cloud, &b.library).sync_once(&mut b.state).unwrap();
            assert_eq!((again.uploaded, again.downloaded), (0, 0));
        }
        assert_eq!(puts(&cloud), puts_before);
    }

    #[test]
    fn a_conflict_found_only_by_the_upload_keeps_both_too() {
        // A's pull didn't see B's save (the change feed lagged), but the cloud refuses A's upload.
        let (cloud, mut a, _b) = both_edit();
        a.state.cursor = cloud.0.lock().unwrap().log.last().map(|l| l.0);
        let round = sync(&cloud, &a.library).sync_once(&mut a.state).unwrap();
        assert_eq!(round.copies.len(), 1);
        assert_eq!(a.library.all().len(), 2);
        assert!(
            cloud.0.lock().unwrap().decks["d_aaaaaaa1"]
                .deck_md
                .contains("## A")
        );
    }

    #[test]
    fn the_conflict_log_has_ids_only() {
        let (cloud, mut a, _b) = both_edit();
        sync(&cloud, &a.library).sync_once(&mut a.state).unwrap();
        for line in test_log::lines() {
            assert!(
                !line.contains("conflict copy") && !line.contains("One") && !line.contains("## "),
                "{line}"
            );
        }
    }

    #[test]
    fn a_deck_left_alone_by_the_first_sync_is_settled_by_the_next_round() {
        let mine = deck("d_samesame", "Mine");
        let mut theirs = deck("d_samesame", "Theirs");
        theirs.deck_md.push_str("later\n");
        let cloud = FakeCloud::with(&[theirs.clone()]);
        let library = FakeLibrary::with(vec![mine.clone()]);
        let mut state = State::default();
        sync(&cloud, &library).first_sync(&mut state).unwrap();
        assert_eq!(puts(&cloud), 0);
        let round = sync(&cloud, &library).sync_once(&mut state).unwrap();
        assert_eq!(round.copies, vec!["Theirs (conflict copy)".to_string()]);
        assert_eq!(library.all().len(), 2);
        assert_eq!(library.all()[0], mine);
    }

    #[test]
    fn a_deck_edited_while_the_pull_ran_is_not_overwritten() {
        let cloud = FakeCloud::default();
        let mut a = started(&cloud, vec![deck("d_aaaaaaa1", "One")]);
        let mut b = started(&cloud, vec![]);
        sync(&cloud, &b.library).sync_once(&mut b.state).unwrap();
        b.library
            .edit("d_aaaaaaa1", "---\nid: d_aaaaaaa1\n---\n## B\n");
        sync(&cloud, &b.library).sync_once(&mut b.state).unwrap();
        // A library whose scan is stale: the deck changes between scan and write.
        struct Racy(FakeLibrary);
        impl Library for Racy {
            fn scan(&self) -> Result<Scan, String> {
                let scan = self.0.scan();
                self.0.edit(
                    "d_aaaaaaa1",
                    "---\nid: d_aaaaaaa1\n---\n## typed meanwhile\n",
                );
                scan
            }
            fn add(&self, d: &RemoteDeck) -> Result<(), String> {
                self.0.add(d)
            }
            fn replace(&self, e: &LocalDeck, d: &RemoteDeck) -> Result<(), String> {
                self.0.replace(e, d)
            }
            fn trash(&self, e: &LocalDeck) -> Result<(), String> {
                self.0.trash(e)
            }
        }
        let racy = Sync::new(cloud.clone(), Racy(a.library.clone()));
        let round = racy.sync_once(&mut a.state).unwrap();
        assert_eq!(round.downloaded, 0);
        assert!(a.library.all()[0].deck_md.contains("typed meanwhile"));
    }

    #[test]
    fn a_failed_pull_asks_again_next_time() {
        let cloud = FakeCloud::default();
        let mut a = started(&cloud, vec![]);
        let b = started(&cloud, vec![]);
        b.library.0.lock().unwrap().push(deck("d_bbbbbbb1", "New"));
        let mut b_state = b.state.clone();
        sync(&cloud, &b.library).sync_once(&mut b_state).unwrap();
        // A's folder refuses the deck once.
        struct Refusing(FakeLibrary, Mutex<bool>);
        impl Library for Refusing {
            fn scan(&self) -> Result<Scan, String> {
                self.0.scan()
            }
            fn add(&self, d: &RemoteDeck) -> Result<(), String> {
                let mut first = self.1.lock().unwrap();
                if std::mem::replace(&mut *first, false) {
                    return Err("disk full".into());
                }
                self.0.add(d)
            }
            fn replace(&self, e: &LocalDeck, d: &RemoteDeck) -> Result<(), String> {
                self.0.replace(e, d)
            }
            fn trash(&self, e: &LocalDeck) -> Result<(), String> {
                self.0.trash(e)
            }
        }
        let s = Sync::new(cloud.clone(), Refusing(a.library.clone(), Mutex::new(true)));
        assert_eq!(s.sync_once(&mut a.state).unwrap().failed, 1);
        assert_eq!(s.sync_once(&mut a.state).unwrap().downloaded, 1);
    }

    #[test]
    fn offline_edit_queues_then_uploads() {
        let cloud = FakeCloud::default();
        let a = started(&cloud, vec![deck("d_aaaaaaa1", "One")]);
        let s = sync(&cloud, &a.library);
        let t0 = Instant::now();
        let mut saver = Saver::new(a.state.clone(), t0);
        saver.run_due(t0, &s);
        // The network goes off; the deck is edited (twice) and the folder keeps both.
        cloud.0.lock().unwrap().unreachable = true;
        a.library
            .edit("d_aaaaaaa1", "---\nid: d_aaaaaaa1\n---\n## off\n");
        saver.edited(t0);
        let t1 = t0 + SAVE_DELAY;
        assert!(saver.run_due(t1, &s).unwrap().is_err());
        assert_eq!(saver.activity(), Activity::Offline);
        assert_eq!(
            test_log::lines()
                .iter()
                .filter(|l| *l == "sync.offline")
                .count(),
            1
        );
        assert!(a.library.all()[0].deck_md.contains("## off"));
        // Not retried straight away, and a second failed try doesn't log Offline again.
        assert!(saver.run_due(t1 + Duration::from_secs(5), &s).is_none());
        let t2 = t1 + Duration::from_secs(61);
        assert!(saver.run_due(t2, &s).unwrap().is_err());
        assert_eq!(
            test_log::lines()
                .iter()
                .filter(|l| *l == "sync.offline")
                .count(),
            1
        );
        // The network returns: the queued edit uploads.
        cloud.0.lock().unwrap().unreachable = false;
        let t3 = t2 + Duration::from_secs(61);
        assert_eq!(saver.run_due(t3, &s).unwrap().unwrap().uploaded, 1);
        assert_eq!(saver.activity(), Activity::Saved);
        assert!(
            cloud.0.lock().unwrap().decks["d_aaaaaaa1"]
                .deck_md
                .contains("## off")
        );
        let lines = test_log::lines();
        let off = lines.iter().position(|l| l == "sync.offline").unwrap();
        let saved = lines
            .iter()
            .position(|l| l.contains("sync.deck_saved id=d_aaaaaaa1"))
            .unwrap();
        assert!(off < saved);
    }

    #[test]
    fn a_focus_and_the_timer_pull_and_idle_time_does_not() {
        let cloud = FakeCloud::default();
        let a = started(&cloud, vec![]);
        let s = sync(&cloud, &a.library);
        let t0 = Instant::now();
        let mut saver = Saver::new(a.state.clone(), t0);
        assert!(saver.run_due(t0, &s).is_some()); // launch
        assert!(saver.run_due(t0 + Duration::from_secs(10), &s).is_none());
        saver.focused();
        assert!(saver.run_due(t0 + Duration::from_secs(11), &s).is_some());
        assert!(saver.run_due(t0 + Duration::from_secs(40), &s).is_none());
        assert!(saver.run_due(t0 + Duration::from_secs(72), &s).is_some()); // timer
    }

    #[test]
    fn a_cursor_from_elsewhere_starts_over_from_a_full_list() {
        let cloud = FakeCloud::with(&five());
        let library = FakeLibrary::default();
        let mut state = State {
            cursor: Some(999),
            ..State::default()
        };
        let round = sync(&cloud, &library).sync_once(&mut state).unwrap();
        assert_eq!(round.downloaded, 5);
        assert_eq!(state.cursor, Some(5));
    }

    #[test]
    fn a_state_with_no_cursor_reconciles_like_turning_it_on() {
        // A computer that turned sync on before rounds existed has no state file.
        let cloud = FakeCloud::default();
        let library = FakeLibrary::with(five());
        let mut state = State::default();
        let round = sync(&cloud, &library).sync_once(&mut state).unwrap();
        assert_eq!(round.uploaded, 5);
        assert!(state.cursor.is_some());
    }

    #[test]
    fn rounds_log_no_deck_content() {
        let cloud = FakeCloud::default();
        let mut a = started(&cloud, vec![deck("d_aaaaaaa1", "Private title")]);
        a.library.edit(
            "d_aaaaaaa1",
            "---\nid: d_aaaaaaa1\n---\n## Secret card text\n",
        );
        sync(&cloud, &a.library).sync_once(&mut a.state).unwrap();
        for line in test_log::lines() {
            assert!(
                !line.contains("Secret card text") && !line.contains("Private title"),
                "{line}"
            );
        }
    }

    #[test]
    fn the_state_round_trips_as_json_without_deck_content() {
        let cloud = FakeCloud::default();
        let a = started(&cloud, vec![deck("d_aaaaaaa1", "Private title")]);
        let text = serde_json::to_string(&a.state).unwrap();
        assert_eq!(serde_json::from_str::<State>(&text).unwrap(), a.state);
        assert!(!text.contains("Private title") && !text.contains("Secret card"));
    }

    #[test]
    fn signed_out_makes_no_requests() {
        struct SignedOut;
        impl Cloud for SignedOut {
            fn list(&self) -> Result<Listing, CloudError> {
                Err(CloudError::SignedOut)
            }
            fn changes(&self, _: u64) -> Result<Changes, CloudError> {
                Err(CloudError::SignedOut)
            }
            fn get(&self, _: &str) -> Result<Option<RemoteDeck>, CloudError> {
                Err(CloudError::SignedOut)
            }
            fn put(&self, _: &LocalDeck, _: u64) -> Result<u64, CloudError> {
                Err(CloudError::SignedOut)
            }
            fn delete(&self, _: &str) -> Result<(), CloudError> {
                Err(CloudError::SignedOut)
            }
        }
        let s = Sync::new(SignedOut, FakeLibrary::with(five()));
        assert_eq!(
            s.sync_once(&mut State::default()).unwrap_err(),
            CloudError::SignedOut
        );
    }
}

// ---- deletes and the Trash (slice 7)

mod trashing {
    use super::*;

    struct Computer {
        library: FakeLibrary,
        state: State,
    }

    /// A has a deck and has saved it; B has pulled it.
    fn shared() -> (FakeCloud, Computer, Computer) {
        let cloud = FakeCloud::default();
        let library = FakeLibrary::with(vec![deck("d_aaaaaaa1", "One"), deck("d_aaaaaaa2", "Two")]);
        let mut state = State::default();
        sync(&cloud, &library).first_sync(&mut state).unwrap();
        let a = Computer { library, state };
        let library = FakeLibrary::with(vec![]);
        let mut state = State::default();
        sync(&cloud, &library).first_sync(&mut state).unwrap();
        let b = Computer { library, state };
        assert_eq!(b.library.all().len(), 2);
        (cloud, a, b)
    }

    fn round(cloud: &FakeCloud, c: &mut Computer) -> Round {
        sync(cloud, &c.library).sync_once(&mut c.state).unwrap()
    }

    fn deleted_lines(id: &str) -> usize {
        test_log::lines()
            .iter()
            .filter(|l| l.contains(&format!("sync.deck_deleted id={id}")))
            .count()
    }

    #[test]
    fn a_deck_trashed_on_a_is_deleted_from_the_cloud_and_trashed_on_b() {
        let (cloud, mut a, mut b) = shared();
        a.library.trash_by_hand("d_aaaaaaa1");
        let r = round(&cloud, &mut a);
        assert_eq!(r.deleted, 1);
        assert_eq!(cloud.ids(), vec!["d_aaaaaaa2".to_string()]);
        assert!(!a.state.decks.contains_key("d_aaaaaaa1"));
        assert_eq!(deleted_lines("d_aaaaaaa1"), 1);
        assert!(
            test_log::lines()
                .iter()
                .any(|l| l.contains("sync.deck_deleted id=d_aaaaaaa1")
                    && l.contains("check=epic-036/V13"))
        );

        let r = round(&cloud, &mut b);
        assert_eq!(r.deleted, 1);
        // Moved to the Trash (recoverable), never removed outright; the other deck is untouched.
        assert_eq!(b.library.trashed(), vec!["d_aaaaaaa1".to_string()]);
        assert_eq!(b.library.all().len(), 1);
        assert!(!b.state.decks.contains_key("d_aaaaaaa1"));
        assert!(
            test_log::lines()
                .iter()
                .any(|l| l.contains("sync.deck_deleted id=d_aaaaaaa1 side=local")
                    && l.contains("check=epic-036/V13"))
        );
        // Nothing bounces back: both computers and the cloud now agree.
        assert_eq!(round(&cloud, &mut a), Round::default());
        assert_eq!(round(&cloud, &mut b), Round::default());
        assert_eq!(cloud.ids(), vec!["d_aaaaaaa2".to_string()]);
    }

    #[test]
    fn a_deck_trashed_while_offline_is_deleted_when_the_cloud_is_back() {
        let (cloud, mut a, _b) = shared();
        cloud.0.lock().unwrap().unreachable = true;
        a.library.trash_by_hand("d_aaaaaaa1");
        assert!(sync(&cloud, &a.library).sync_once(&mut a.state).is_err());
        assert!(a.state.decks.contains_key("d_aaaaaaa1"));
        cloud.0.lock().unwrap().unreachable = false;
        assert_eq!(round(&cloud, &mut a).deleted, 1);
        assert_eq!(cloud.ids(), vec!["d_aaaaaaa2".to_string()]);
    }

    #[test]
    fn a_deck_edited_on_b_and_trashed_on_a_is_kept_and_comes_back_on_a() {
        let (cloud, mut a, mut b) = shared();
        b.library.edit(
            "d_aaaaaaa1",
            "---\nid: d_aaaaaaa1\ntitle: One\n---\n## B edit\n",
        );
        round(&cloud, &mut b);
        // A hasn't pulled B's edit when the deck goes to the Trash there.
        a.library.trash_by_hand("d_aaaaaaa1");
        let r = round(&cloud, &mut a);
        assert_eq!(r.deleted, 0);
        assert!(cloud.ids().contains(&"d_aaaaaaa1".to_string()));
        assert!(
            a.library
                .all()
                .iter()
                .any(|d| d.deck_md.contains("## B edit"))
        );
    }

    #[test]
    fn a_delete_that_races_an_edit_asks_the_cloud_first_and_loses_nothing() {
        // B's edit reached the cloud after A's last pull but A's cursor is already past it (a
        // pull that missed it): the check before the delete sees the newer revision.
        let (cloud, mut a, mut b) = shared();
        a.library.trash_by_hand("d_aaaaaaa1");
        b.library.edit(
            "d_aaaaaaa1",
            "---\nid: d_aaaaaaa1\ntitle: One\n---\n## B edit\n",
        );
        round(&cloud, &mut b);
        // Skip A's pull: its cursor is already past nothing, so the pull would see the edit; the
        // delete step's own check is what is under test here.
        let s = sync(&cloud, &a.library);
        let scan = a.library.scan().unwrap();
        assert!(scan.decks.iter().all(|d| d.id != "d_aaaaaaa1"));
        let r = s.sync_once(&mut a.state).unwrap();
        assert_eq!(r.deleted, 0);
        assert!(cloud.ids().contains(&"d_aaaaaaa1".to_string()));
    }

    #[test]
    fn a_deck_edited_on_b_and_trashed_on_a_first_is_kept_on_b() {
        let (cloud, mut a, mut b) = shared();
        a.library.trash_by_hand("d_aaaaaaa1");
        round(&cloud, &mut a);
        b.library.edit(
            "d_aaaaaaa1",
            "---\nid: d_aaaaaaa1\ntitle: One\n---\n## B edit\n",
        );
        let r = round(&cloud, &mut b);
        // The edit wins: the deck stays on B, goes back up, and is not trashed.
        assert_eq!(r.deleted, 0);
        assert!(b.library.trashed().is_empty());
        assert!(
            cloud.0.lock().unwrap().decks["d_aaaaaaa1"]
                .deck_md
                .contains("## B edit")
        );
        assert!(
            test_log::lines()
                .iter()
                .any(|l| l.contains("sync.deck_delete_kept id=d_aaaaaaa1"))
        );
        // And A gets it back at its next sync.
        round(&cloud, &mut a);
        assert!(
            a.library
                .all()
                .iter()
                .any(|d| d.deck_md.contains("## B edit"))
        );
    }

    #[test]
    fn a_deck_restored_from_the_trash_goes_back_up_and_down() {
        let (cloud, mut a, mut b) = shared();
        a.library.trash_by_hand("d_aaaaaaa1");
        round(&cloud, &mut a);
        round(&cloud, &mut b);
        assert_eq!(b.library.all().len(), 1);
        a.library.restore_by_hand("d_aaaaaaa1");
        let r = round(&cloud, &mut a);
        assert_eq!(r.uploaded, 1);
        assert!(cloud.ids().contains(&"d_aaaaaaa1".to_string()));
        let r = round(&cloud, &mut b);
        assert_eq!(r.downloaded, 1);
        assert_eq!(b.library.all().len(), 2);
    }

    #[test]
    fn the_other_computer_trashes_only_a_deck_it_has_not_edited() {
        let (cloud, mut a, mut b) = shared();
        a.library.trash_by_hand("d_aaaaaaa1");
        round(&cloud, &mut a);
        // B edited the deck but hasn't synced: the tombstone doesn't take it away.
        b.library.edit(
            "d_aaaaaaa1",
            "---\nid: d_aaaaaaa1\ntitle: One\n---\n## local\n",
        );
        let before = b.library.all();
        let r = sync(&cloud, &b.library);
        // Pull only (the push is what brings it back, which the test above covers).
        let _ = r.sync_once(&mut b.state);
        assert!(b.library.trashed().is_empty());
        assert!(before.iter().all(|d| b.library.all().contains(d)));
    }

    #[test]
    fn an_unreadable_folder_never_looks_like_every_deck_was_trashed() {
        let (cloud, mut a, _b) = shared();
        a.library.0.lock().unwrap().clear();
        *a.library.3.lock().unwrap() = true;
        let r = round(&cloud, &mut a);
        assert_eq!(r.deleted, 0);
        assert_eq!(cloud.ids().len(), 2);
    }

    #[test]
    fn an_unsyncable_deck_is_not_a_deleted_one() {
        let (cloud, mut a, _b) = shared();
        a.library.trash_by_hand("d_aaaaaaa1");
        a.library.1.lock().unwrap().push("d_aaaaaaa1".into());
        assert_eq!(round(&cloud, &mut a).deleted, 0);
        assert_eq!(cloud.ids().len(), 2);
    }

    #[test]
    fn a_refused_delete_keeps_the_deck_in_the_state_to_try_again() {
        // A deleted account's token (slice 9): the DELETE is refused, nothing is forgotten.
        let (cloud, mut a, _b) = shared();
        cloud
            .0
            .lock()
            .unwrap()
            .refuse_delete
            .push("d_aaaaaaa1".into());
        a.library.trash_by_hand("d_aaaaaaa1");
        let r = round(&cloud, &mut a);
        assert_eq!(r.deleted, 0);
        assert_eq!(r.failed, 1);
        assert!(a.state.decks.contains_key("d_aaaaaaa1"));
        assert_eq!(cloud.ids().len(), 2);
    }

    #[test]
    fn the_delete_logs_have_ids_only() {
        let (cloud, mut a, mut b) = shared();
        a.library.trash_by_hand("d_aaaaaaa1");
        round(&cloud, &mut a);
        round(&cloud, &mut b);
        for l in test_log::lines() {
            assert!(
                !l.contains("Secret card text") && !l.contains("title"),
                "{l}"
            );
        }
    }
}
