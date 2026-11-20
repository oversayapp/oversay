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
    fn list(&self) -> Result<Vec<RemoteSummary>, CloudError> {
        let s = &mut *self.0.lock().unwrap();
        s.requests.push("list".into());
        if s.unreachable {
            return Err(CloudError::Unreachable("offline".into()));
        }
        Ok(s.decks
            .values()
            .map(|d| RemoteSummary {
                id: d.id.clone(),
                revision: d.revision,
            })
            .collect())
    }
    fn get(&self, id: &str) -> Result<Option<RemoteDeck>, CloudError> {
        let s = &mut *self.0.lock().unwrap();
        s.requests.push(format!("get {id}"));
        Ok(s.decks.get(id).cloned())
    }
    fn put(&self, deck: &LocalDeck) -> Result<u64, CloudError> {
        let s = &mut *self.0.lock().unwrap();
        s.requests.push(format!("put {}", deck.id));
        if s.refuse_put.contains(&deck.id) {
            return Err(CloudError::Refused(413));
        }
        let revision = s.decks.get(&deck.id).map_or(0, |d| d.revision) + 1;
        s.decks.insert(
            deck.id.clone(),
            RemoteDeck {
                id: deck.id.clone(),
                deck_md: deck.deck_md.clone(),
                sessions_json: deck.sessions_json.clone(),
                revision,
            },
        );
        Ok(revision)
    }
}

#[derive(Clone, Default)]
struct FakeLibrary(Arc<Mutex<Vec<LocalDeck>>>);

impl FakeLibrary {
    fn with(decks: Vec<LocalDeck>) -> Self {
        FakeLibrary(Arc::new(Mutex::new(decks)))
    }
    fn all(&self) -> Vec<LocalDeck> {
        self.0.lock().unwrap().clone()
    }
}

impl Library for FakeLibrary {
    fn decks(&self) -> Result<Vec<LocalDeck>, String> {
        Ok(self.all())
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
    let report = sync(&cloud, &library).first_sync().unwrap();
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
    let report = sync(&cloud, &library).first_sync().unwrap();
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
    let report = sync(&cloud, &library).first_sync().unwrap();
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
    let report = sync(&cloud, &library).first_sync().unwrap();
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
    let report = sync(&cloud, &library).first_sync().unwrap();
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
    sync(&cloud, &library).first_sync().unwrap();
    let again = sync(&cloud, &library).first_sync().unwrap();
    assert_eq!((again.uploaded, again.downloaded, again.failed), (0, 0, 0));
    assert_eq!(library.all().len(), 5);
}

#[test]
fn one_deck_refused_does_not_stop_the_others() {
    let library = FakeLibrary::with(five());
    let cloud = FakeCloud::default();
    cloud.0.lock().unwrap().refuse_put.push("d_aaaaaaa2".into());
    let report = sync(&cloud, &library).first_sync().unwrap();
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
    let err = sync(&cloud, &library).first_sync().unwrap_err();
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
    assert_eq!(s.push(&d).unwrap(), Pushed::Saved { revision: 1 });
    assert_eq!(s.push(&d).unwrap(), Pushed::Saved { revision: 2 });
}

#[test]
fn pull_brings_down_only_decks_this_computer_lacks() {
    let library = FakeLibrary::with(vec![deck("d_aaaaaaa1", "Mine")]);
    let cloud = FakeCloud::with(&five());
    let pulled = sync(&cloud, &library).pull().unwrap();
    assert_eq!(pulled.downloaded, 4);
    assert_eq!(library.all().len(), 5);
}

#[test]
fn logs_never_hold_deck_content() {
    let library = FakeLibrary::with(five());
    let cloud = FakeCloud::default();
    sync(&cloud, &library).first_sync().unwrap();
    let other = FakeLibrary::default();
    sync(&cloud, &other).first_sync().unwrap();
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
            vec![RemoteSummary {
                id: "d_k3x9a2bq".into(),
                revision: 3
            }]
        );
        assert_eq!(wire.sent.lock().unwrap()[0].1, "/decks");
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
        let revision = cloud.put(&deck("d_k3x9a2bq", "T")).unwrap();
        assert_eq!(revision, 4);
        let (method, path, body) = wire.sent.lock().unwrap()[0].clone();
        assert_eq!(
            (method.as_str(), path.as_str()),
            ("PUT", "/decks/d_k3x9a2bq")
        );
        let sent: serde_json::Value = serde_json::from_str(&body).unwrap();
        let mut keys: Vec<_> = sent.as_object().unwrap().keys().cloned().collect();
        keys.sort();
        assert_eq!(keys, vec!["deckMd", "sessionsJson"]);
    }

    #[test]
    fn an_error_status_is_a_refusal_and_a_bad_id_never_reaches_the_wire() {
        let (cloud, wire) = wire(401, r#"{"error":"x"}"#);
        assert_eq!(cloud.list().unwrap_err(), CloudError::Refused(401));
        assert_eq!(cloud.get("../../x").unwrap_err(), CloudError::Refused(400));
        assert_eq!(wire.sent.lock().unwrap().len(), 1);
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
        let mut found = FolderLibrary(dir.clone()).decks().unwrap();
        found.sort_by(|a, b| a.id.cmp(&b.id));
        assert_eq!(found.len(), 2);
        assert_eq!(found[0], d);
        assert_eq!(found[1].sessions_json, NO_SESSIONS);
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
        assert_eq!(lib.decks().unwrap()[0].id, "d_aaaaaaa1");
        let _ = fs::remove_dir_all(dir);
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
