//! The account through its own interface, with a fake Cognito, keychain and API: the hosted page
//! and the real keychain are Demo and Inspect only (epic oversayapp/web-api#1, Testing decisions).

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use sha2::Digest;

use super::*;
use crate::test_log;

/// What the fakes were asked to do, shared with the test.
#[derive(Default)]
struct Calls {
    exchanged: Vec<(String, String)>,
    refreshed: Vec<String>,
    revoked: Vec<String>,
    api: Vec<(String, String)>,
    stored: Option<String>,
    deletes: usize,
    refresh_fails: bool,
}

type Shared = Arc<Mutex<Calls>>;

fn id_token(email: &str) -> String {
    let payload = URL_SAFE_NO_PAD.encode(format!(
        r#"{{"sub":"u-1","email":"{email}","email_verified":true}}"#
    ));
    format!("eyJhbGciOiJSUzI1NiJ9.{payload}.c2ln")
}

struct FakeCognito(Shared);

impl TokenEndpoint for FakeCognito {
    fn exchange_code(&self, code: &str, verifier: &str) -> Result<Tokens, AuthError> {
        self.0
            .lock()
            .unwrap()
            .exchanged
            .push((code.into(), verifier.into()));
        Ok(Tokens {
            access_token: "access-1".into(),
            id_token: Some(id_token("john@example.com")),
            refresh_token: Some("refresh-1".into()),
            expires_in: 3600,
        })
    }
    fn refresh(&self, refresh_token: &str) -> Result<Tokens, AuthError> {
        let mut calls = self.0.lock().unwrap();
        calls.refreshed.push(refresh_token.into());
        if calls.refresh_fails {
            return Err(AuthError::Rejected);
        }
        Ok(Tokens {
            access_token: "access-2".into(),
            id_token: None,
            refresh_token: None,
            expires_in: 3600,
        })
    }
    fn revoke(&self, refresh_token: &str) -> Result<(), AuthError> {
        self.0.lock().unwrap().revoked.push(refresh_token.into());
        Ok(())
    }
}

struct FakeKeychain(Shared);

impl SecretStore for FakeKeychain {
    fn load(&self) -> Result<Option<String>, String> {
        Ok(self.0.lock().unwrap().stored.clone())
    }
    fn save(&self, value: &str) -> Result<(), String> {
        self.0.lock().unwrap().stored = Some(value.into());
        Ok(())
    }
    fn delete(&self) -> Result<(), String> {
        let mut calls = self.0.lock().unwrap();
        calls.stored = None;
        calls.deletes += 1;
        Ok(())
    }
    fn kind(&self) -> &'static str {
        "keychain"
    }
}

struct FakeApi(Shared);

impl Api for FakeApi {
    fn get(&self, path: &str, access_token: &str) -> Result<(u16, String), String> {
        self.0
            .lock()
            .unwrap()
            .api
            .push((path.into(), access_token.into()));
        Ok((
            200,
            r#"{"decks":[{"id":"d_a"},{"id":"d_b"}],"cursor":4}"#.into(),
        ))
    }
}

fn account() -> (Account, Shared) {
    test_log::start();
    let calls = Shared::default();
    let account = Account::new(
        DEV.clone(),
        Box::new(FakeCognito(calls.clone())),
        Box::new(FakeKeychain(calls.clone())),
        Box::new(FakeApi(calls.clone())),
    );
    (account, calls)
}

fn query(url: &str, key: &str) -> Option<String> {
    url::Url::parse(url)
        .unwrap()
        .query_pairs()
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.into_owned())
}

fn auth_link(code: &str, state: &str) -> String {
    format!("oversay://auth?code={code}&state={state}")
}

/// Starts a sign-in and returns the state the hosted page would send back.
fn started(account: &Account, now: Instant) -> String {
    query(&account.start_sign_in(Screen::SignIn, now), "state").unwrap()
}

fn signed_in(account: &Account, now: Instant) {
    let state = started(account, now);
    assert_eq!(
        account.handle_link(&auth_link("code-1", &state), now),
        LinkOutcome::SignedIn
    );
}

#[test]
fn signed_out_makes_no_api_calls() {
    let (account, calls) = account();
    let now = Instant::now();
    account.restore();
    assert_eq!(account.status(), Status::SignedOut { problem: None });
    assert_eq!(account.access_token(now), Err(AccountError::SignedOut));
    assert_eq!(account.call_api(now), Err(AccountError::SignedOut));
    // A sign-in link nobody asked for doesn't reach Cognito either.
    account.handle_link(&auth_link("code-1", "made-up"), now);
    let calls = calls.lock().unwrap();
    assert!(
        calls.api.is_empty()
            && calls.exchanged.is_empty()
            && calls.refreshed.is_empty()
            && calls.revoked.is_empty()
    );
    assert!(
        !test_log::lines()
            .iter()
            .any(|l| l.starts_with("api.") || l.starts_with("sync."))
    );
}

#[test]
fn the_hosted_page_is_asked_for_a_code_with_pkce_and_state() {
    let (account, _) = account();
    let url = account.start_sign_in(Screen::SignIn, Instant::now());
    assert!(
        url.starts_with("https://oversay-dev.auth.eu-west-1.amazoncognito.com/oauth2/authorize?"),
        "{url}"
    );
    assert_eq!(query(&url, "response_type").as_deref(), Some("code"));
    assert_eq!(query(&url, "client_id").as_deref(), Some(DEV.client_id));
    assert_eq!(
        query(&url, "redirect_uri").as_deref(),
        Some("oversay://auth")
    );
    assert_eq!(query(&url, "scope").as_deref(), Some("openid email"));
    assert_eq!(
        query(&url, "code_challenge_method").as_deref(),
        Some("S256")
    );
    assert!(query(&url, "state").unwrap().len() >= 43);
    assert_eq!(account.status(), Status::SigningIn);
    // Create account opens the same page on its sign-up form.
    let signup = account.start_sign_in(Screen::SignUp, Instant::now());
    assert!(
        signup.starts_with("https://oversay-dev.auth.eu-west-1.amazoncognito.com/signup?"),
        "{signup}"
    );
    assert_ne!(query(&url, "state"), query(&signup, "state"));
}

#[test]
fn a_link_matching_the_sign_in_stores_the_refresh_token_in_the_keychain_and_signs_in() {
    let (account, calls) = account();
    let now = Instant::now();
    let url = account.start_sign_in(Screen::SignIn, now);
    let state = query(&url, "state").unwrap();
    assert_eq!(
        account.handle_link(&auth_link("code-1", &state), now),
        LinkOutcome::SignedIn
    );
    assert_eq!(
        account.status(),
        Status::SignedIn {
            email: "john@example.com".into()
        }
    );
    let calls = calls.lock().unwrap();
    // The code is traded with the verifier whose S256 hash went to the hosted page.
    let (code, verifier) = &calls.exchanged[0];
    assert_eq!(code, "code-1");
    let challenge = URL_SAFE_NO_PAD.encode(sha2::Sha256::digest(verifier.as_bytes()));
    assert_eq!(query(&url, "code_challenge").unwrap(), challenge);
    let stored = calls.stored.as_deref().unwrap();
    assert!(stored.contains("refresh-1") && !stored.contains("access-1"));
    assert!(test_log::logged("account.token_stored"));
    assert!(
        test_log::lines()
            .iter()
            .any(|l| l.starts_with("account.token_stored store=keychain check=epic-036/V7"))
    );
    assert!(
        test_log::lines()
            .iter()
            .any(|l| l.starts_with("account.signed_in check=epic-036/V4"))
    );
}

#[test]
fn the_log_never_holds_a_token_code_state_or_email() {
    let (account, _) = account();
    let now = Instant::now();
    let state = started(&account, now);
    account.handle_link(&auth_link("code-1", &state), now);
    account.handle_link(&auth_link("code-2", "other"), now);
    account.call_api(now).unwrap();
    account.sign_out();
    for line in test_log::lines() {
        for secret in [
            "code-1",
            "code-2",
            &state,
            "refresh-1",
            "access-1",
            "access-2",
            "john@example.com",
            "eyJ",
        ] {
            assert!(!line.contains(secret), "{line} holds {secret}");
        }
    }
}

#[test]
fn a_link_with_no_sign_in_started_is_refused_and_stores_nothing() {
    let (account, calls) = account();
    let outcome = account.handle_link(&auth_link("code-1", "anything"), Instant::now());
    assert_eq!(outcome, LinkOutcome::Refused(Refusal::NoSignIn));
    assert!(calls.lock().unwrap().stored.is_none());
    // Spec §14: the manager says sign-in did not finish.
    assert_eq!(
        account.status(),
        Status::SignedOut {
            problem: Some(SIGN_IN_DID_NOT_FINISH.into())
        }
    );
    assert!(
        test_log::lines()
            .iter()
            .any(|l| l.starts_with("account.link_refused reason=no_sign_in"))
    );
}

#[test]
fn a_link_with_another_state_is_refused_and_the_sign_in_can_still_finish() {
    let (account, calls) = account();
    let now = Instant::now();
    let state = started(&account, now);
    assert_eq!(
        account.handle_link(&auth_link("evil", "other"), now),
        LinkOutcome::Refused(Refusal::WrongState)
    );
    assert!(calls.lock().unwrap().exchanged.is_empty());
    assert!(calls.lock().unwrap().stored.is_none());
    assert_eq!(
        account.handle_link(&auth_link("code-1", &state), now),
        LinkOutcome::SignedIn
    );
}

#[test]
fn a_used_state_is_refused_the_second_time() {
    let (account, calls) = account();
    let now = Instant::now();
    let state = started(&account, now);
    account.handle_link(&auth_link("code-1", &state), now);
    assert_eq!(
        account.handle_link(&auth_link("code-2", &state), now),
        LinkOutcome::Refused(Refusal::NoSignIn)
    );
    assert_eq!(calls.lock().unwrap().exchanged.len(), 1);
}

#[test]
fn a_sign_in_older_than_ten_minutes_is_refused() {
    let (account, calls) = account();
    let then = Instant::now();
    let state = started(&account, then);
    let later = then + Duration::from_secs(11 * 60);
    assert_eq!(
        account.handle_link(&auth_link("code-1", &state), later),
        LinkOutcome::Refused(Refusal::Expired)
    );
    assert!(calls.lock().unwrap().exchanged.is_empty());
    assert_eq!(
        account.status(),
        Status::SignedOut {
            problem: Some(SIGN_IN_DID_NOT_FINISH.into())
        }
    );
}

#[test]
fn an_error_from_the_hosted_page_ends_the_sign_in() {
    let (account, calls) = account();
    let now = Instant::now();
    let state = started(&account, now);
    let link = format!("oversay://auth?error=access_denied&state={state}");
    assert_eq!(
        account.handle_link(&link, now),
        LinkOutcome::Refused(Refusal::HostedPageError)
    );
    assert!(calls.lock().unwrap().exchanged.is_empty());
    assert_eq!(
        account.status(),
        Status::SignedOut {
            problem: Some(SIGN_IN_DID_NOT_FINISH.into())
        }
    );
}

#[test]
fn a_cancelled_sign_in_refuses_its_link() {
    let (account, _) = account();
    let now = Instant::now();
    let state = started(&account, now);
    account.cancel_sign_in();
    assert_eq!(account.status(), Status::SignedOut { problem: None });
    assert_eq!(
        account.handle_link(&auth_link("code-1", &state), now),
        LinkOutcome::Refused(Refusal::NoSignIn)
    );
}

#[test]
fn the_hosted_pages_sign_out_return_changes_nothing() {
    let (account, calls) = account();
    let now = Instant::now();
    signed_in(&account, now);
    assert_eq!(
        account.handle_link("oversay://auth/signed-out", now),
        LinkOutcome::SignedOutReturn
    );
    assert_eq!(
        account.status(),
        Status::SignedIn {
            email: "john@example.com".into()
        }
    );
    assert_eq!(calls.lock().unwrap().deletes, 0);
}

#[test]
fn only_auth_links_are_the_accounts() {
    assert!(is_auth_link("oversay://auth?code=1&state=2"));
    assert!(is_auth_link("OVERSAY://auth/signed-out"));
    assert!(!is_auth_link("oversay://authors"));
    assert!(!is_auth_link("oversay://decks/auth"));
    assert!(!is_auth_link("https://auth"));
}

#[test]
fn relaunch_restores_the_account_from_the_keychain_without_the_network() {
    let (first, calls) = account();
    let now = Instant::now();
    signed_in(&first, now);
    let second = Account::new(
        DEV.clone(),
        Box::new(FakeCognito(calls.clone())),
        Box::new(FakeKeychain(calls.clone())),
        Box::new(FakeApi(calls.clone())),
    );
    test_log::start();
    second.restore();
    assert_eq!(
        second.status(),
        Status::SignedIn {
            email: "john@example.com".into()
        }
    );
    assert!(
        test_log::lines()
            .iter()
            .any(|l| l.starts_with("account.restored check=epic-036/V4"))
    );
    assert!(calls.lock().unwrap().refreshed.is_empty());
    // The first call after a relaunch gets an access token from the stored refresh token.
    assert_eq!(second.access_token(now), Ok("access-2".into()));
    assert_eq!(
        calls.lock().unwrap().refreshed,
        vec!["refresh-1".to_string()]
    );
}

#[test]
fn something_unreadable_in_the_keychain_is_removed_and_the_app_is_signed_out() {
    let (account, calls) = account();
    calls.lock().unwrap().stored = Some("not json".into());
    account.restore();
    assert_eq!(account.status(), Status::SignedOut { problem: None });
    assert!(calls.lock().unwrap().stored.is_none());
}

#[test]
fn sign_out_deletes_the_stored_tokens_and_revokes_them() {
    let (account, calls) = account();
    let now = Instant::now();
    signed_in(&account, now);
    let logout = account.sign_out().unwrap();
    assert!(
        logout.starts_with("https://oversay-dev.auth.eu-west-1.amazoncognito.com/logout?"),
        "{logout}"
    );
    assert_eq!(
        query(&logout, "logout_uri").as_deref(),
        Some("oversay://auth/signed-out")
    );
    assert_eq!(query(&logout, "client_id").as_deref(), Some(DEV.client_id));
    assert_eq!(account.status(), Status::SignedOut { problem: None });
    let c = calls.lock().unwrap();
    assert!(c.stored.is_none());
    assert_eq!(c.revoked, vec!["refresh-1".to_string()]);
    assert!(
        test_log::lines()
            .iter()
            .any(|l| l.starts_with("account.signed_out check=epic-036/V6"))
    );
    drop(c);
    assert_eq!(account.access_token(now), Err(AccountError::SignedOut));
}

#[test]
fn signing_out_when_signed_out_does_nothing() {
    let (account, calls) = account();
    assert_eq!(account.sign_out(), None);
    assert!(calls.lock().unwrap().revoked.is_empty());
}

#[test]
fn the_access_token_is_reused_until_it_is_nearly_out_of_date() {
    let (account, calls) = account();
    let now = Instant::now();
    signed_in(&account, now);
    assert_eq!(account.access_token(now), Ok("access-1".into()));
    assert!(calls.lock().unwrap().refreshed.is_empty());
    assert_eq!(
        account.access_token(now + Duration::from_secs(3590)),
        Ok("access-2".into())
    );
}

#[test]
fn a_refused_refresh_token_signs_the_app_out() {
    let (account, calls) = account();
    let now = Instant::now();
    signed_in(&account, now);
    calls.lock().unwrap().refresh_fails = true;
    let later = now + Duration::from_secs(7200);
    assert_eq!(account.access_token(later), Err(AccountError::SignedOut));
    assert!(calls.lock().unwrap().stored.is_none());
    assert_eq!(
        account.status(),
        Status::SignedOut {
            problem: Some(SIGNED_OUT_ELSEWHERE.into())
        }
    );
    assert!(test_log::logged("account.expired"));
}

#[test]
fn the_api_check_lists_decks_with_the_access_token() {
    let (account, calls) = account();
    let now = Instant::now();
    signed_in(&account, now);
    assert_eq!(account.call_api(now), Ok("GET /decks: 200, 2 decks".into()));
    assert_eq!(
        calls.lock().unwrap().api,
        vec![("/decks".to_string(), "access-1".to_string())]
    );
}

#[test]
fn the_email_comes_from_the_id_token() {
    assert_eq!(
        email_from_id_token(&id_token("a@b.co")).as_deref(),
        Some("a@b.co")
    );
    assert_eq!(email_from_id_token("not.a.jwt"), None);
    assert_eq!(email_from_id_token("only-one-part"), None);
}
