//! The real `Cloud`: the API's deck and workspace routes (web-api's README), through the signed-in
//! account. A workspace is told by its `w_` id: its `workspace.json` text travels as the deck's
//! `deck_md` with no `sessions_json` (slice 8), and the two lists are read as one on the lower of
//! their cursors, since workspaces and decks share the account's change counter.

use std::sync::Arc;
use std::time::Instant;

use serde_json::{Value, json};

use super::{
    Change, Changes, Cloud, CloudError, Listing, LocalDeck, RemoteDeck, RemoteSummary, is_workspace,
};
use crate::account::{Account, AccountError};
use crate::ids::{DECK_PREFIX, WORKSPACE_PREFIX, is_valid_id};

/// A GET, PUT or DELETE to the API as the signed-in account: the status and body, or why not.
pub trait Transport {
    fn get(&self, path: &str) -> Result<(u16, String), CloudError>;
    fn put(&self, path: &str, body: &str) -> Result<(u16, String), CloudError>;
    fn delete(&self, path: &str) -> Result<(u16, String), CloudError>;
}

/// The account's own token and API. Signed out, `SignedOut` with no request made (V5).
pub struct AccountTransport(pub Arc<Account>);

fn account_error(e: AccountError) -> CloudError {
    match e {
        AccountError::SignedOut => CloudError::SignedOut,
        other => CloudError::Unreachable(other.to_string()),
    }
}

impl Transport for AccountTransport {
    fn get(&self, path: &str) -> Result<(u16, String), CloudError> {
        self.0.api_get(Instant::now(), path).map_err(account_error)
    }
    fn put(&self, path: &str, body: &str) -> Result<(u16, String), CloudError> {
        self.0
            .api_put(Instant::now(), path, body)
            .map_err(account_error)
    }
    fn delete(&self, path: &str) -> Result<(u16, String), CloudError> {
        self.0
            .api_delete(Instant::now(), path)
            .map_err(account_error)
    }
}

pub struct ApiCloud<T>(pub T);

/// The API path of a deck or a workspace.
fn item_path(id: &str) -> Result<String, CloudError> {
    // An id from the cloud's list becomes part of a path: only a real deck or workspace id does.
    if is_valid_id(DECK_PREFIX, id) {
        Ok(format!("/decks/{id}"))
    } else if is_valid_id(WORKSPACE_PREFIX, id) {
        Ok(format!("/workspaces/{id}"))
    } else {
        Err(CloudError::Refused(400))
    }
}

fn parse(body: &str) -> Result<Value, CloudError> {
    serde_json::from_str(body)
        .map_err(|_| CloudError::Unreachable("The API's answer wasn't JSON".into()))
}

fn text(v: &Value, key: &str) -> Result<String, CloudError> {
    v.get(key)
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| CloudError::Unreachable("The API's answer was missing a field".into()))
}

fn revision(v: &Value) -> Result<u64, CloudError> {
    v.get("revision")
        .and_then(Value::as_u64)
        .ok_or_else(|| CloudError::Unreachable("The API's answer was missing a revision".into()))
}

fn array<'a>(body: &'a Value, key: &str) -> Result<&'a Vec<Value>, CloudError> {
    body.get(key)
        .and_then(Value::as_array)
        .ok_or_else(|| CloudError::Unreachable("The API's list wasn't a list".into()))
}

fn cursor(body: &Value) -> Result<u64, CloudError> {
    body.get("cursor")
        .and_then(Value::as_u64)
        .ok_or_else(|| CloudError::Unreachable("The API's answer was missing a cursor".into()))
}

fn ok((status, body): (u16, String)) -> Result<String, CloudError> {
    if status == 200 {
        Ok(body)
    } else {
        Err(CloudError::Refused(status))
    }
}

impl<T: Transport> ApiCloud<T> {
    /// The decks' and the workspaces' lists at `query` (`""` or `?since=n`): every entry, and the
    /// lower of the two cursors.
    fn lists(&self, query: &str) -> Result<(Vec<Value>, u64), CloudError> {
        let decks = parse(&ok(self.0.get(&format!("/decks{query}"))?)?)?;
        let workspaces = parse(&ok(self.0.get(&format!("/workspaces{query}"))?)?)?;
        let items = array(&decks, "decks")?
            .iter()
            .chain(array(&workspaces, "workspaces")?)
            .cloned()
            .collect();
        Ok((items, cursor(&decks)?.min(cursor(&workspaces)?)))
    }
}

impl<T: Transport> Cloud for ApiCloud<T> {
    fn list(&self) -> Result<Listing, CloudError> {
        let (items, cursor) = self.lists("")?;
        let decks = items
            .iter()
            .map(|d| {
                Ok(RemoteSummary {
                    id: text(d, "id")?,
                    revision: revision(d)?,
                })
            })
            .collect::<Result<_, CloudError>>()?;
        Ok(Listing { decks, cursor })
    }

    fn changes(&self, since: u64) -> Result<Changes, CloudError> {
        let (items, cursor) = self.lists(&format!("?since={since}"))?;
        let items = items
            .iter()
            .map(|d| {
                Ok(Change {
                    id: text(d, "id")?,
                    revision: revision(d)?,
                    deleted: d.get("deleted").and_then(Value::as_bool).unwrap_or(false),
                })
            })
            .collect::<Result<_, CloudError>>()?;
        Ok(Changes { items, cursor })
    }

    fn get(&self, id: &str) -> Result<Option<RemoteDeck>, CloudError> {
        let (status, body) = self.0.get(&item_path(id)?)?;
        if status == 404 {
            return Ok(None);
        }
        let deck = parse(&ok((status, body))?)?;
        let (deck_md, sessions_json) = if is_workspace(id) {
            (text(&deck, "workspaceJson")?, String::new())
        } else {
            (text(&deck, "deckMd")?, text(&deck, "sessionsJson")?)
        };
        Ok(Some(RemoteDeck {
            id: text(&deck, "id")?,
            deck_md,
            sessions_json,
            revision: revision(&deck)?,
        }))
    }

    fn put(&self, deck: &LocalDeck, base: u64) -> Result<u64, CloudError> {
        let body = if is_workspace(&deck.id) {
            json!({ "workspaceJson": deck.deck_md, "baseRevision": base })
        } else {
            json!({
                "deckMd": deck.deck_md,
                "sessionsJson": deck.sessions_json,
                "baseRevision": base,
            })
        };
        let (status, text) = self.0.put(&item_path(&deck.id)?, &body.to_string())?;
        // The cloud's deck is at another revision than the one this save was based on.
        if status == 409 {
            // The body says which revision the cloud has (a deleted deck keeps its own).
            let stored = parse(&text).and_then(|v| revision(&v))?;
            return Err(CloudError::Stale(stored));
        }
        revision(&parse(&ok((status, text))?)?)
    }

    fn delete(&self, id: &str) -> Result<(), CloudError> {
        match self.0.delete(&item_path(id)?)? {
            // 404: no live deck with that id, so it is as deleted as it can be.
            (204 | 404, _) => Ok(()),
            (status, _) => Err(CloudError::Refused(status)),
        }
    }
}
