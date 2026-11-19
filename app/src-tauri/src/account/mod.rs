//! The optional account (ADR 0050, spec §14): sign in on Cognito's hosted page in the browser,
//! back through `oversay://auth`, with the refresh token kept only in the OS keychain.
//!
//! Tokens, codes and the PKCE verifier never leave this module: the manager only ever sees
//! `Status` (signed out, signing in, or signed in with the email). Signed out, nothing here makes a
//! request. Cognito, the keychain and the API sit behind `TokenEndpoint`, `SecretStore` and `Api`,
//! so tests use fakes (tests.rs); the real ones are in cognito.rs and keychain.rs, and the Tauri
//! commands in commands.rs.

mod cognito;
pub mod commands;
mod keychain;
#[cfg(test)]
mod tests;

use std::fmt;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::{Deserialize, Serialize};
use sha2::Digest;

/// One deployed stage of oversayapp/web-api: its hosted sign-in page, the desktop app client and
/// the API. Public identifiers, not secrets (a public client has no secret).
#[derive(Clone, Debug, PartialEq)]
pub struct Stage {
    pub name: &'static str,
    pub hosted_page: &'static str,
    pub client_id: &'static str,
    pub api: &'static str,
}

/// The `dev` stage (web-api's `sst.config.ts` outputs: hostedUi, desktopClientId, api).
pub const DEV: Stage = Stage {
    name: "dev",
    hosted_page: "https://oversay-dev.auth.eu-west-1.amazoncognito.com",
    client_id: "2qdlvf4n67atqj4r0asuu26ohv",
    api: "https://wf4garww7g.execute-api.eu-west-1.amazonaws.com",
};

/// The stage this build signs in to: `OVERSAY_ACCOUNT_STAGE` when it was built, `dev` by default.
/// A build for a stage this table doesn't know has no account at all. `prod` comes with epic 036's
/// prod slice.
pub fn built_stage() -> Option<Stage> {
    match option_env!("OVERSAY_ACCOUNT_STAGE").unwrap_or("dev") {
        "dev" => Some(DEV),
        _ => None,
    }
}

/// Where the hosted page sends the browser back (the app client's only callback URL).
pub const REDIRECT: &str = "oversay://auth";
/// Where the hosted page's sign-out sends it (the app client's only sign-out URL).
pub const SIGNED_OUT_REDIRECT: &str = "oversay://auth/signed-out";
/// How long a sign-in waits for its link (ADR 0050: "only for a few minutes").
const SIGN_IN_LIFETIME: Duration = Duration::from_secs(10 * 60);
/// An access token this close to running out is refreshed before it is used.
const ACCESS_MARGIN: Duration = Duration::from_secs(60);

pub const SIGN_IN_DID_NOT_FINISH: &str = "Sign-in did not finish. Try again.";
pub const SIGNED_OUT_ELSEWHERE: &str = "You were signed out. Sign in again to use your account.";
const KEYCHAIN_FAILED: &str =
    "Oversay couldn't keep your sign-in in the keychain, so you are not signed in.";

/// What the manager shows in Settings › Account.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum Status {
    /// This build has no account stage.
    Unavailable,
    SignedOut {
        problem: Option<String>,
    },
    /// The browser is open on the hosted page.
    SigningIn,
    SignedIn {
        email: String,
    },
}

/// Which form of the hosted page Sign in and Create account open.
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Screen {
    SignIn,
    SignUp,
}

/// What became of an `oversay://auth` link.
#[derive(Debug, PartialEq)]
pub enum LinkOutcome {
    SignedIn,
    /// The hosted page's sign-out came back: nothing to do.
    SignedOutReturn,
    Refused(Refusal),
    /// The link was the one expected, but the code couldn't be traded or kept.
    Failed,
    /// The sign-in was cancelled or started again while its code was being traded.
    Abandoned,
}

/// Why a link was refused; logged as `account.link_refused reason=<code>`.
#[derive(Debug, PartialEq)]
pub enum Refusal {
    NoSignIn,
    WrongState,
    Expired,
    HostedPageError,
    NoCode,
    Unknown,
}

impl Refusal {
    fn code(&self) -> &'static str {
        match self {
            Refusal::NoSignIn => "no_sign_in",
            Refusal::WrongState => "wrong_state",
            Refusal::Expired => "expired",
            Refusal::HostedPageError => "hosted_page_error",
            Refusal::NoCode => "no_code",
            Refusal::Unknown => "unknown_link",
        }
    }
}

#[derive(Debug, PartialEq)]
pub enum AccountError {
    SignedOut,
    /// Cognito or the API couldn't be reached or answered oddly.
    Unreachable(String),
}

impl fmt::Display for AccountError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            AccountError::SignedOut => write!(f, "Not signed in."),
            AccountError::Unreachable(why) => write!(f, "{why}"),
        }
    }
}

#[derive(Debug, PartialEq)]
pub enum AuthError {
    /// Cognito said no (`invalid_grant` and the like): the token or code is no good.
    Rejected,
    /// Cognito couldn't be reached or its answer couldn't be read.
    Unreachable(String),
}

/// What Cognito's token endpoint gives back.
pub struct Tokens {
    pub access_token: String,
    pub id_token: Option<String>,
    /// Only when a code is traded; a refresh keeps the one there is.
    pub refresh_token: Option<String>,
    pub expires_in: u64,
}

/// Cognito's `/oauth2/token` and `/oauth2/revoke` for the stage's desktop client.
pub trait TokenEndpoint: Send + Sync {
    fn exchange_code(&self, code: &str, verifier: &str) -> Result<Tokens, AuthError>;
    fn refresh(&self, refresh_token: &str) -> Result<Tokens, AuthError>;
    fn revoke(&self, refresh_token: &str) -> Result<(), AuthError>;
}

/// The one item Oversay keeps in the OS keychain.
pub trait SecretStore: Send + Sync {
    fn load(&self) -> Result<Option<String>, String>;
    fn save(&self, value: &str) -> Result<(), String>;
    fn delete(&self) -> Result<(), String>;
    /// For the log: `keychain`.
    fn kind(&self) -> &'static str;
}

/// The stage's API: a GET with the access token, giving the status and body.
pub trait Api: Send + Sync {
    fn get(&self, path: &str, access_token: &str) -> Result<(u16, String), String>;
}

/// A string that never shows itself in a `{:?}`, so a token can't reach the log by accident.
#[derive(Clone, PartialEq)]
struct Secret(String);

impl fmt::Debug for Secret {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "Secret(…)")
    }
}

/// What is kept in the keychain: the refresh token and the email it belongs to, so a relaunch shows
/// the email without the network.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Stored {
    refresh_token: String,
    email: String,
}

/// A sign-in in progress: its `state` and PKCE verifier, in memory only.
struct SignIn {
    state: Secret,
    verifier: Secret,
    started: Instant,
    /// `Inner::generation` when it started: if that has moved on by the time its code is traded,
    /// it was cancelled or replaced meanwhile.
    generation: u64,
}

struct SignedIn {
    email: String,
    refresh_token: Secret,
    access: Option<(Secret, Instant)>,
}

#[derive(Default)]
struct Inner {
    sign_in: Option<SignIn>,
    /// Goes up on every start, cancel and sign-out.
    generation: u64,
    signed_in: Option<SignedIn>,
    problem: Option<String>,
}

pub struct Account {
    stage: Stage,
    tokens: Box<dyn TokenEndpoint>,
    store: Box<dyn SecretStore>,
    api: Box<dyn Api>,
    inner: Mutex<Inner>,
}

/// Whether `url` is an `oversay://auth` link (the sign-in's return), which only this module reads.
pub fn is_auth_link(url: &str) -> bool {
    let Some(rest) = url
        .get(..10)
        .filter(|s| s.eq_ignore_ascii_case("oversay://"))
        .map(|_| &url[10..])
    else {
        return false;
    };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    host.eq_ignore_ascii_case("auth")
}

/// 32 random bytes, base64url: a `state` or a PKCE verifier (43 characters, RFC 7636).
fn random_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("the system's random source is unavailable");
    URL_SAFE_NO_PAD.encode(bytes)
}

/// Compares two strings in time that doesn't depend on where they differ.
fn same(a: &str, b: &str) -> bool {
    a.len() == b.len()
        && a.bytes()
            .zip(b.bytes())
            .fold(0u8, |acc, (x, y)| acc | (x ^ y))
            == 0
}

/// The `email` claim of an ID token that came straight from Cognito's token endpoint over TLS
/// (OpenID Connect Core §3.1.3.7: its signature needn't be checked then).
fn email_from_id_token(id_token: &str) -> Option<String> {
    let mut parts = id_token.split('.');
    let payload = parts.nth(1)?;
    let bytes = URL_SAFE_NO_PAD.decode(payload.trim_end_matches('=')).ok()?;
    let claims: serde_json::Value = serde_json::from_slice(&bytes).ok()?;
    claims
        .get("email")?
        .as_str()
        .filter(|e| e.contains('@'))
        .map(str::to_string)
}

impl Account {
    pub fn new(
        stage: Stage,
        tokens: Box<dyn TokenEndpoint>,
        store: Box<dyn SecretStore>,
        api: Box<dyn Api>,
    ) -> Self {
        Account {
            stage,
            tokens,
            store,
            api,
            inner: Mutex::new(Inner::default()),
        }
    }

    /// The real Cognito, keychain and API for `stage`.
    pub fn for_stage(stage: Stage) -> Self {
        let tokens = cognito::Cognito::new(&stage);
        let api = cognito::HttpApi::new(&stage);
        let store = keychain::Keychain::new(&stage);
        Account::new(stage, Box::new(tokens), Box::new(store), Box::new(api))
    }

    fn inner(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// At launch: signed in again from the keychain, with no request made.
    pub fn restore(&self) {
        let loaded = match self.store.load() {
            Ok(loaded) => loaded,
            Err(e) => {
                log::warn!(
                    "account.restore_failed store={} error={e}",
                    self.store.kind()
                );
                return;
            }
        };
        let Some(text) = loaded else {
            log::debug!("account.none_stored");
            return;
        };
        match serde_json::from_str::<Stored>(&text) {
            Ok(stored) => {
                self.inner().signed_in = Some(SignedIn {
                    email: stored.email,
                    refresh_token: Secret(stored.refresh_token),
                    access: None,
                });
                log::debug!(
                    "account.restored check=epic-036/V4 stage={}",
                    self.stage.name
                );
            }
            Err(_) => {
                log::warn!("account.stored_unreadable removed=true");
                let _ = self.store.delete();
            }
        }
    }

    pub fn status(&self) -> Status {
        let inner = self.inner();
        if let Some(s) = &inner.signed_in {
            Status::SignedIn {
                email: s.email.clone(),
            }
        } else if inner
            .sign_in
            .as_ref()
            .is_some_and(|s| s.started.elapsed() <= SIGN_IN_LIFETIME)
        {
            Status::SigningIn
        } else if inner.sign_in.is_some() {
            // Its link can only be refused now (follow).
            Status::SignedOut {
                problem: Some(SIGN_IN_DID_NOT_FINISH.into()),
            }
        } else {
            Status::SignedOut {
                problem: inner.problem.clone(),
            }
        }
    }

    /// Starts a sign-in and gives the hosted page's address to open in the browser. A sign-in
    /// already waiting is replaced, so only the newest page's link is accepted.
    pub fn start_sign_in(&self, screen: Screen, now: Instant) -> String {
        let state = random_token();
        let verifier = random_token();
        let challenge = URL_SAFE_NO_PAD.encode(sha2::Sha256::digest(verifier.as_bytes()));
        let path = match screen {
            Screen::SignIn => "/oauth2/authorize",
            Screen::SignUp => "/signup",
        };
        let mut url =
            url::Url::parse(self.stage.hosted_page).expect("the stage's hosted page is a URL");
        url.set_path(path);
        url.query_pairs_mut()
            .append_pair("response_type", "code")
            .append_pair("client_id", self.stage.client_id)
            .append_pair("redirect_uri", REDIRECT)
            .append_pair("scope", "openid email")
            .append_pair("state", &state)
            .append_pair("code_challenge", &challenge)
            .append_pair("code_challenge_method", "S256");
        let mut inner = self.inner();
        inner.problem = None;
        inner.generation += 1;
        inner.sign_in = Some(SignIn {
            state: Secret(state),
            verifier: Secret(verifier),
            started: now,
            generation: inner.generation,
        });
        log::debug!(
            "account.sign_in_started screen={screen:?} stage={}",
            self.stage.name
        );
        url.into()
    }

    pub fn cancel_sign_in(&self) {
        let mut inner = self.inner();
        inner.generation += 1;
        if inner.sign_in.take().is_some() {
            log::debug!("account.sign_in_cancelled");
        }
        inner.problem = None;
    }

    /// An `oversay://auth` link: accepted only when it carries the `state` of the sign-in in
    /// progress (ADR 0050); then the sign-in is used up and its code traded for tokens.
    pub fn handle_link(&self, link: &str, now: Instant) -> LinkOutcome {
        let outcome = self.follow(link, now);
        if let LinkOutcome::Refused(why) = &outcome {
            // The link's query holds the code and state, so only the reason is logged.
            log::warn!("account.link_refused reason={}", why.code());
            // Shown only when signed out with no sign-in waiting (spec §14).
            self.inner().problem = Some(SIGN_IN_DID_NOT_FINISH.into());
        }
        outcome
    }

    fn follow(&self, link: &str, now: Instant) -> LinkOutcome {
        let Ok(url) = url::Url::parse(link) else {
            return LinkOutcome::Refused(Refusal::Unknown);
        };
        match url.path().trim_end_matches('/') {
            "" => {}
            "/signed-out" => {
                log::debug!("account.hosted_page_signed_out");
                return LinkOutcome::SignedOutReturn;
            }
            _ => return LinkOutcome::Refused(Refusal::Unknown),
        }
        let param = |key: &str| {
            url.query_pairs()
                .find(|(k, _)| k == key)
                .map(|(_, v)| v.into_owned())
        };
        let sign_in = {
            let mut inner = self.inner();
            let Some(pending) = &inner.sign_in else {
                return LinkOutcome::Refused(Refusal::NoSignIn);
            };
            if now.saturating_duration_since(pending.started) > SIGN_IN_LIFETIME {
                inner.sign_in = None;
                return LinkOutcome::Refused(Refusal::Expired);
            }
            // Another state is someone else's link: it doesn't end this sign-in.
            if !param("state").is_some_and(|s| same(&s, &pending.state.0)) {
                return LinkOutcome::Refused(Refusal::WrongState);
            }
            let sign_in = inner.sign_in.take().expect("checked above");
            if param("error").is_some() {
                return LinkOutcome::Refused(Refusal::HostedPageError);
            }
            sign_in
        };
        let Some(code) = param("code") else {
            return LinkOutcome::Refused(Refusal::NoCode);
        };
        match self.finish(&code, &sign_in, now) {
            Ok(true) => LinkOutcome::SignedIn,
            Ok(false) => LinkOutcome::Abandoned,
            Err(problem) => {
                self.inner().problem = Some(problem);
                LinkOutcome::Failed
            }
        }
    }

    /// Trades the code for tokens, keeps the refresh token in the keychain, and signs in. False
    /// when the sign-in was cancelled or replaced while the code was being traded.
    fn finish(&self, code: &str, sign_in: &SignIn, now: Instant) -> Result<bool, String> {
        let tokens = self
            .tokens
            .exchange_code(code, &sign_in.verifier.0)
            .map_err(|e| {
                log::warn!(
                    "account.sign_in_failed step=exchange error={}",
                    describe(&e)
                );
                SIGN_IN_DID_NOT_FINISH.to_string()
            })?;
        let email = tokens.id_token.as_deref().and_then(email_from_id_token);
        let (Some(refresh_token), Some(email)) = (tokens.refresh_token, email) else {
            log::warn!("account.sign_in_failed step=tokens error=missing_refresh_token_or_email");
            return Err(SIGN_IN_DID_NOT_FINISH.into());
        };
        let stored = serde_json::to_string(&Stored {
            refresh_token: refresh_token.clone(),
            email: email.clone(),
        })
        .expect("two strings serialize");
        // Held while the keychain is written, so a cancel can't slip in between the check and it.
        let mut inner = self.inner();
        if inner.generation != sign_in.generation {
            drop(inner);
            log::debug!("account.sign_in_abandoned");
            let _ = self.tokens.revoke(&refresh_token);
            return Ok(false);
        }
        if let Err(e) = self.store.save(&stored) {
            log::warn!(
                "account.sign_in_failed step=store store={} error={e}",
                self.store.kind()
            );
            drop(inner);
            let _ = self.tokens.revoke(&refresh_token);
            return Err(KEYCHAIN_FAILED.into());
        }
        log::debug!(
            "account.token_stored store={} check=epic-036/V7",
            self.store.kind()
        );
        inner.problem = None;
        inner.signed_in = Some(SignedIn {
            email,
            refresh_token: Secret(refresh_token),
            access: Some((
                Secret(tokens.access_token),
                now + Duration::from_secs(tokens.expires_in),
            )),
        });
        log::debug!(
            "account.signed_in check=epic-036/V4 stage={}",
            self.stage.name
        );
        Ok(true)
    }

    /// Signs out: the keychain item is deleted and the refresh token revoked. Local decks are not
    /// touched. Gives the hosted page's sign-out address, so the browser forgets the sign-in too.
    pub fn sign_out(&self) -> Option<String> {
        let signed_in = {
            let mut inner = self.inner();
            inner.sign_in = None;
            inner.problem = None;
            inner.generation += 1;
            inner.signed_in.take()
        }?;
        self.forget(&signed_in);
        log::debug!("account.signed_out check=epic-036/V6");
        let mut url =
            url::Url::parse(self.stage.hosted_page).expect("the stage's hosted page is a URL");
        url.set_path("/logout");
        url.query_pairs_mut()
            .append_pair("client_id", self.stage.client_id)
            .append_pair("logout_uri", SIGNED_OUT_REDIRECT);
        Some(url.into())
    }

    fn forget(&self, signed_in: &SignedIn) {
        if let Err(e) = self.store.delete() {
            log::warn!(
                "account.token_not_deleted store={} error={e}",
                self.store.kind()
            );
        }
        if let Err(e) = self.tokens.revoke(&signed_in.refresh_token.0) {
            log::warn!("account.revoke_failed error={}", describe(&e));
        }
    }

    /// An access token for the API, refreshed when it is nearly out of date. Signed out, it is
    /// `SignedOut` with no request made (V5).
    pub fn access_token(&self, now: Instant) -> Result<String, AccountError> {
        let refresh_token = {
            let inner = self.inner();
            let signed_in = inner.signed_in.as_ref().ok_or(AccountError::SignedOut)?;
            if let Some((token, until)) = &signed_in.access
                && now + ACCESS_MARGIN < *until
            {
                return Ok(token.0.clone());
            }
            signed_in.refresh_token.clone()
        };
        match self.tokens.refresh(&refresh_token.0) {
            Ok(tokens) => {
                let mut inner = self.inner();
                // Signed out, or in again as someone else, while the refresh was in flight.
                let signed_in = inner
                    .signed_in
                    .as_mut()
                    .filter(|s| s.refresh_token == refresh_token)
                    .ok_or(AccountError::SignedOut)?;
                signed_in.access = Some((
                    Secret(tokens.access_token.clone()),
                    now + Duration::from_secs(tokens.expires_in),
                ));
                log::debug!("account.token_refreshed");
                Ok(tokens.access_token)
            }
            Err(AuthError::Rejected) => {
                // Revoked, expired, or the account deleted: there is no sign-in left to keep.
                let signed_in = {
                    let mut inner = self.inner();
                    let taken = inner
                        .signed_in
                        .take_if(|s| s.refresh_token == refresh_token);
                    if taken.is_some() {
                        inner.problem = Some(SIGNED_OUT_ELSEWHERE.into());
                        inner.generation += 1;
                    }
                    taken
                };
                if signed_in.is_some() {
                    let _ = self.store.delete();
                }
                log::warn!("account.expired reason=refresh_rejected");
                Err(AccountError::SignedOut)
            }
            Err(AuthError::Unreachable(why)) => Err(AccountError::Unreachable(why)),
        }
    }

    /// Developer tools only: `GET /decks` with the access token, to show the token works.
    pub fn call_api(&self, now: Instant) -> Result<String, AccountError> {
        let token = self.access_token(now)?;
        let (status, body) = self
            .api
            .get("/decks", &token)
            .map_err(AccountError::Unreachable)?;
        let decks = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v.get("decks").and_then(|d| d.as_array()).map(Vec::len));
        log::debug!("account.api_checked status={status}");
        Ok(match decks {
            Some(n) => format!(
                "GET /decks: {status}, {n} deck{}",
                if n == 1 { "" } else { "s" }
            ),
            None => format!("GET /decks: {status}"),
        })
    }
}

fn describe(e: &AuthError) -> String {
    match e {
        AuthError::Rejected => "rejected".into(),
        AuthError::Unreachable(why) => why.clone(),
    }
}
