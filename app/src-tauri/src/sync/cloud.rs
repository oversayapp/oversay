//! The real `Cloud`: the API's deck routes (web-api's README), through the signed-in account.

use std::sync::Arc;
use std::time::Instant;

use serde_json::{Value, json};

use super::{Cloud, CloudError, LocalDeck, RemoteDeck, RemoteSummary};
use crate::account::{Account, AccountError};
use crate::ids::{DECK_PREFIX, is_valid_id};

/// A GET or PUT to the API as the signed-in account: the status and body, or why not.
pub trait Transport {
    fn get(&self, path: &str) -> Result<(u16, String), CloudError>;
    fn put(&self, path: &str, body: &str) -> Result<(u16, String), CloudError>;
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
}

pub struct ApiCloud<T>(pub T);

fn deck_path(id: &str) -> Result<String, CloudError> {
    // An id from the cloud's list becomes part of a path: only a real deck id does.
    if is_valid_id(DECK_PREFIX, id) {
        Ok(format!("/decks/{id}"))
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

fn ok((status, body): (u16, String)) -> Result<String, CloudError> {
    if status == 200 {
        Ok(body)
    } else {
        Err(CloudError::Refused(status))
    }
}

impl<T: Transport> Cloud for ApiCloud<T> {
    fn list(&self) -> Result<Vec<RemoteSummary>, CloudError> {
        let body = parse(&ok(self.0.get("/decks")?)?)?;
        body.get("decks")
            .and_then(Value::as_array)
            .ok_or_else(|| CloudError::Unreachable("The API's list wasn't a list".into()))?
            .iter()
            .map(|d| {
                Ok(RemoteSummary {
                    id: text(d, "id")?,
                    revision: revision(d)?,
                })
            })
            .collect()
    }

    fn get(&self, id: &str) -> Result<Option<RemoteDeck>, CloudError> {
        let (status, body) = self.0.get(&deck_path(id)?)?;
        if status == 404 {
            return Ok(None);
        }
        let deck = parse(&ok((status, body))?)?;
        Ok(Some(RemoteDeck {
            id: text(&deck, "id")?,
            deck_md: text(&deck, "deckMd")?,
            sessions_json: text(&deck, "sessionsJson")?,
            revision: revision(&deck)?,
        }))
    }

    fn put(&self, deck: &LocalDeck) -> Result<u64, CloudError> {
        let body = json!({ "deckMd": deck.deck_md, "sessionsJson": deck.sessions_json });
        let saved = parse(&ok(self
            .0
            .put(&deck_path(&deck.id)?, &body.to_string())?)?)?;
        revision(&saved)
    }
}
