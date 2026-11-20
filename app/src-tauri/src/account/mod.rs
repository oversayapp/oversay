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
use std::sync::{Mutex, MutexGuard, OnceLock};
use std::time::{Duration, Instant};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use serde::{Deserialize, Serialize};
use sha2::Digest;

/// One deployed stage of oversayapp/web-api: its hosted sign-in page, the desktop app client and
/// the API. Public identifiers, not secrets (a public client has no secret).
#[derive(Clone, Copy, Debug, PartialEq)]
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
    /// The sign-in was cancelled, or signed out, while its code was being traded.
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
    /// Sign in while signed in: sign out first.
    SignedIn,
    /// Cognito or the API couldn't be reached or answered oddly.
    Unreachable(String),
}

impl fmt::Display for AccountError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            AccountError::SignedOut => write!(f, "Not signed in."),
            AccountError::SignedIn => write!(f, "Already signed in. Sign out first."),
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

impl fmt::Display for AuthError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            AuthError::Rejected => write!(f, "rejected"),
            AuthError::Unreachable(why) => write!(f, "{why}"),
        }
    }
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
}

/// The stage's API: a request with the access token, giving the status and body.
pub trait Api: Send + Sync {
    fn get(&self, path: &str, access_token: &str) -> Result<(u16, String), String>;
    /// A PUT with a JSON body (a deck, in `sync`).
    fn put(&self, path: &str, access_token: &str, body: &str) -> Result<(u16, String), String>;
    fn delete(&self, path: &str, access_token: &str) -> Result<(u16, String), String>;
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
    /// Its link came and its code is being traded: a second link with the same state is refused.
    exchanging: bool,
}

struct SignedIn {
    email: String,
    refresh_token: Secret,
    access: Option<(Secret, Instant)>,
}

/// Where the account is: one of three, so no two can be true at once.
enum State {
    SignedOut { problem: Option<String> },
    SigningIn(SignIn),
    SignedIn(SignedIn),
}

impl State {
    fn signed_out() -> Self {
        State::SignedOut { problem: None }
    }

    fn did_not_finish() -> Self {
        State::SignedOut {
            problem: Some(SIGN_IN_DID_NOT_FINISH.into()),
        }
    }

    /// Whether this is the sign-in whose link carried `state` and is being traded.
    fn is_exchanging(&self, state: &Secret) -> bool {
        matches!(self, State::SigningIn(s) if s.exchanging && s.state == *state)
    }
}

/// Signing out hands back the refresh token to revoke, which `revoke` does later: it is a network
/// call, and signing out mustn't wait for it.
pub struct Revocation(Secret);

pub struct Account {
    stage: Stage,
    tokens: Box<dyn TokenEndpoint>,
    store: Box<dyn SecretStore>,
    api: Box<dyn Api>,
    state: Mutex<State>,
    /// Told when the account changes by itself (a link, a refused refresh, a restore), not when a
    /// caller changed it and has the status back already.
    on_change: OnceLock<Box<dyn Fn() + Send + Sync>>,
}

/// Whether `url` is an `oversay://auth` link (the sign-in's return), which only this module reads.
pub fn is_auth_link(url: &str) -> bool {
    url::Url::parse(url).is_ok_and(|u| {
        u.scheme() == "oversay" && u.host_str().is_some_and(|h| h.eq_ignore_ascii_case("auth"))
    })
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
    let payload = id_token.split('.').nth(1)?;
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
            state: Mutex::new(State::signed_out()),
            on_change: OnceLock::new(),
        }
    }

    /// The real Cognito, keychain and API for `stage`.
    pub fn for_stage(stage: Stage) -> Self {
        let agent = cognito::agent();
        let tokens = cognito::Cognito::new(&stage, agent.clone());
        let api = cognito::HttpApi::new(&stage, agent);
        let store = keychain::Keychain::new(&stage);
        Account::new(stage, Box::new(tokens), Box::new(store), Box::new(api))
    }

    /// What to call when the account changes by itself (see `on_change`). Set once.
    pub fn on_change(&self, f: impl Fn() + Send + Sync + 'static) {
        let _ = self.on_change.set(Box::new(f));
    }

    fn changed(&self) {
        if let Some(f) = self.on_change.get() {
            f();
        }
    }

    fn state(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// The hosted page at `path`, for the stage's desktop client.
    fn hosted(&self, path: &str) -> url::Url {
        let mut url =
            url::Url::parse(self.stage.hosted_page).expect("the stage's hosted page is a URL");
        url.set_path(path);
        url.query_pairs_mut()
            .append_pair("client_id", self.stage.client_id);
        url
    }

    /// At launch: signed in again from the keychain, with no request made.
    pub fn restore(&self) {
        let text = match self.store.load() {
            Ok(Some(text)) => text,
            Ok(None) => {
                log::debug!("account.none_stored");
                return;
            }
            Err(e) => {
                log::warn!("account.restore_failed store=keychain error={e}");
                return;
            }
        };
        let Ok(stored) = serde_json::from_str::<Stored>(&text) else {
            log::warn!("account.stored_unreadable removed=true");
            let _ = self.store.delete();
            return;
        };
        {
            let mut state = self.state();
            // A sign-in finished while the keychain was read: it is the newer one.
            if !matches!(*state, State::SignedOut { .. }) {
                return;
            }
            *state = State::SignedIn(SignedIn {
                email: stored.email,
                refresh_token: Secret(stored.refresh_token),
                access: None,
            });
        }
        log::debug!(
            "account.restored check=epic-036/V4 stage={}",
            self.stage.name
        );
        self.changed();
    }

    pub fn status(&self) -> Status {
        match &*self.state() {
            State::SignedIn(s) => Status::SignedIn {
                email: s.email.clone(),
            },
            State::SigningIn(s) if s.started.elapsed() <= SIGN_IN_LIFETIME => Status::SigningIn,
            // Its link can only be refused now (follow).
            State::SigningIn(_) => Status::SignedOut {
                problem: Some(SIGN_IN_DID_NOT_FINISH.into()),
            },
            State::SignedOut { problem } => Status::SignedOut {
                problem: problem.clone(),
            },
        }
    }

    /// Starts a sign-in and gives the hosted page's address to open in the browser. A sign-in
    /// already waiting is replaced, so only the newest page's link is accepted.
    pub fn start_sign_in(&self, screen: Screen, now: Instant) -> Result<String, AccountError> {
        let state = random_token();
        let verifier = random_token();
        let challenge = URL_SAFE_NO_PAD.encode(sha2::Sha256::digest(verifier.as_bytes()));
        let mut url = self.hosted(match screen {
            Screen::SignIn => "/oauth2/authorize",
            Screen::SignUp => "/signup",
        });
        url.query_pairs_mut()
            .append_pair("response_type", "code")
            .append_pair("redirect_uri", REDIRECT)
            .append_pair("scope", "openid email")
            .append_pair("state", &state)
            .append_pair("code_challenge", &challenge)
            .append_pair("code_challenge_method", "S256");
        let mut current = self.state();
        if matches!(*current, State::SignedIn(_)) {
            return Err(AccountError::SignedIn);
        }
        *current = State::SigningIn(SignIn {
            state: Secret(state),
            verifier: Secret(verifier),
            started: now,
            exchanging: false,
        });
        log::debug!(
            "account.sign_in_started screen={screen:?} stage={}",
            self.stage.name
        );
        Ok(url.into())
    }

    pub fn cancel_sign_in(&self) {
        let mut state = self.state();
        if !matches!(*state, State::SignedIn(_)) {
            if matches!(*state, State::SigningIn(_)) {
                log::debug!("account.sign_in_cancelled");
            }
            *state = State::signed_out();
        }
    }

    /// An `oversay://auth` link: accepted only when it carries the `state` of the sign-in in
    /// progress (ADR 0050); then the sign-in is used up and its code traded for tokens.
    pub fn handle_link(&self, link: &str, now: Instant) -> LinkOutcome {
        let outcome = self.follow(link, now);
        if let LinkOutcome::Refused(why) = &outcome {
            // The link's query holds the code and state, so only the reason is logged.
            log::warn!("account.link_refused reason={}", why.code());
            // Spec §14: the manager says sign-in did not finish, unless a sign-in is still
            // waiting or the account is signed in.
            let mut state = self.state();
            if let State::SignedOut { problem } = &mut *state {
                *problem = Some(SIGN_IN_DID_NOT_FINISH.into());
            }
        }
        if outcome != LinkOutcome::SignedOutReturn {
            self.changed();
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
        let (state, verifier) = {
            let mut current = self.state();
            let State::SigningIn(pending) = &mut *current else {
                return LinkOutcome::Refused(Refusal::NoSignIn);
            };
            if pending.exchanging {
                return LinkOutcome::Refused(Refusal::NoSignIn);
            }
            if now.saturating_duration_since(pending.started) > SIGN_IN_LIFETIME {
                *current = State::did_not_finish();
                return LinkOutcome::Refused(Refusal::Expired);
            }
            // Another state is someone else's link: it doesn't end this sign-in.
            if !param("state").is_some_and(|s| same(&s, &pending.state.0)) {
                return LinkOutcome::Refused(Refusal::WrongState);
            }
            if param("error").is_some() {
                *current = State::did_not_finish();
                return LinkOutcome::Refused(Refusal::HostedPageError);
            }
            if param("code").is_none() {
                *current = State::did_not_finish();
                return LinkOutcome::Refused(Refusal::NoCode);
            }
            pending.exchanging = true;
            (pending.state.clone(), pending.verifier.clone())
        };
        let code = param("code").expect("checked above");
        let outcome = self.finish(&code, &state, &verifier, now);
        if outcome != LinkOutcome::SignedIn {
            let mut current = self.state();
            if current.is_exchanging(&state) {
                *current = State::did_not_finish();
            }
        }
        outcome
    }

    /// Trades the code for tokens, keeps the refresh token in the keychain, and signs in, unless
    /// the sign-in was cancelled or signed out of meanwhile. The lock isn't held while Cognito or
    /// the keychain is busy, so the manager never waits on them.
    fn finish(&self, code: &str, state: &Secret, verifier: &Secret, now: Instant) -> LinkOutcome {
        let tokens = match self.tokens.exchange_code(code, &verifier.0) {
            Ok(tokens) => tokens,
            Err(e) => {
                log::warn!("account.sign_in_failed step=exchange error={e}");
                return LinkOutcome::Failed;
            }
        };
        let email = tokens.id_token.as_deref().and_then(email_from_id_token);
        let (Some(refresh_token), Some(email)) = (tokens.refresh_token, email) else {
            log::warn!("account.sign_in_failed step=tokens error=missing_refresh_token_or_email");
            return LinkOutcome::Failed;
        };
        let abandoned = |account: &Account| {
            log::debug!("account.sign_in_abandoned");
            let _ = account.tokens.revoke(&refresh_token);
            LinkOutcome::Abandoned
        };
        if !self.state().is_exchanging(state) {
            return abandoned(self);
        }
        let stored = serde_json::to_string(&Stored {
            refresh_token: refresh_token.clone(),
            email: email.clone(),
        })
        .expect("two strings serialize");
        if let Err(e) = self.store.save(&stored) {
            log::warn!("account.sign_in_failed step=store store=keychain error={e}");
            let _ = self.tokens.revoke(&refresh_token);
            let mut current = self.state();
            if current.is_exchanging(state) {
                *current = State::SignedOut {
                    problem: Some(KEYCHAIN_FAILED.into()),
                };
            }
            return LinkOutcome::Failed;
        }
        log::debug!("account.token_stored store=keychain check=epic-036/V7");
        {
            let mut current = self.state();
            if !current.is_exchanging(state) {
                drop(current);
                let _ = self.store.delete();
                return abandoned(self);
            }
            *current = State::SignedIn(SignedIn {
                email,
                refresh_token: Secret(refresh_token),
                access: Some((
                    Secret(tokens.access_token),
                    now + Duration::from_secs(tokens.expires_in),
                )),
            });
        }
        log::debug!(
            "account.signed_in check=epic-036/V4 stage={}",
            self.stage.name
        );
        LinkOutcome::SignedIn
    }

    /// Signs out: the keychain item is deleted at once; local decks are not touched. Gives the
    /// hosted page's sign-out address, so the browser forgets the sign-in too, and the refresh
    /// token for `revoke`.
    pub fn sign_out(&self) -> Option<(String, Revocation)> {
        let signed_in = match std::mem::replace(&mut *self.state(), State::signed_out()) {
            State::SignedIn(s) => s,
            _ => return None,
        };
        if let Err(e) = self.store.delete() {
            log::warn!("account.token_not_deleted store=keychain error={e}");
        }
        log::debug!("account.signed_out check=epic-036/V6");
        Some((self.hosted_logout(), Revocation(signed_in.refresh_token)))
    }

    /// Deletes the account in the cloud (`DELETE /account`: Cognito user and every row of theirs),
    /// then signs out as Sign out does: keychain item removed, local decks untouched (this module
    /// has no access to them). Any failure leaves the account signed in so the person can try
    /// again; the API's delete is safe to repeat. Gives the hosted page's sign-out address, which
    /// clears the browser's sign-in.
    pub fn delete_account(&self, now: Instant) -> Result<String, AccountError> {
        let token = self.access_token(now)?;
        let (status, _) = self
            .api
            .delete("/account", &token)
            .map_err(AccountError::Unreachable)?;
        if status != 204 {
            log::warn!("account.delete_failed status={status}");
            return Err(AccountError::Unreachable(format!(
                "The account couldn't be deleted (the server answered {status}). Nothing on this computer changed. Try again."
            )));
        }
        // Signed out meanwhile is fine: the account is gone either way. No revoke: the user is gone.
        let logout = self.sign_out().map(|(logout, _)| logout);
        log::debug!(
            "account.deleted check=epic-036/V15 stage={}",
            self.stage.name
        );
        Ok(logout.unwrap_or_else(|| self.hosted_logout()))
    }

    fn hosted_logout(&self) -> String {
        let mut url = self.hosted("/logout");
        url.query_pairs_mut()
            .append_pair("logout_uri", SIGNED_OUT_REDIRECT);
        url.into()
    }

    /// Tells Cognito a signed-out refresh token is no longer good.
    pub fn revoke(&self, revocation: Revocation) {
        if let Err(e) = self.tokens.revoke(&revocation.0.0) {
            log::warn!("account.revoke_failed error={e}");
        }
    }

    /// An access token for the API, refreshed when it is nearly out of date. Signed out, it is
    /// `SignedOut` with no request made (V5).
    pub fn access_token(&self, now: Instant) -> Result<String, AccountError> {
        let refresh_token = {
            let State::SignedIn(signed_in) = &*self.state() else {
                return Err(AccountError::SignedOut);
            };
            if let Some((token, until)) = &signed_in.access
                && now + ACCESS_MARGIN < *until
            {
                return Ok(token.0.clone());
            }
            signed_in.refresh_token.clone()
        };
        let refreshed = self.tokens.refresh(&refresh_token.0);
        let mut state = self.state();
        // Signed out, or in again as someone else, while the refresh was in flight.
        let State::SignedIn(signed_in) = &mut *state else {
            return Err(AccountError::SignedOut);
        };
        if signed_in.refresh_token != refresh_token {
            return Err(AccountError::SignedOut);
        }
        match refreshed {
            Ok(tokens) => {
                signed_in.access = Some((
                    Secret(tokens.access_token.clone()),
                    now + Duration::from_secs(tokens.expires_in),
                ));
                log::debug!("account.token_refreshed");
                Ok(tokens.access_token)
            }
            Err(AuthError::Rejected) => {
                // Revoked, expired, or the account deleted: there is no sign-in left to keep.
                *state = State::SignedOut {
                    problem: Some(SIGNED_OUT_ELSEWHERE.into()),
                };
                drop(state);
                let _ = self.store.delete();
                log::warn!("account.expired reason=refresh_rejected");
                self.changed();
                Err(AccountError::SignedOut)
            }
            Err(AuthError::Unreachable(why)) => Err(AccountError::Unreachable(why)),
        }
    }

    /// Whether the account is signed in: the only thing `sync` asks before it makes a request.
    pub fn is_signed_in(&self) -> bool {
        matches!(*self.state(), State::SignedIn(_))
    }

    /// A GET to the API with the account's token. Signed out, no request is made (V5).
    pub fn api_get(&self, now: Instant, path: &str) -> Result<(u16, String), AccountError> {
        let token = self.access_token(now)?;
        self.api
            .get(path, &token)
            .map_err(AccountError::Unreachable)
    }

    /// A PUT to the API with the account's token. Signed out, no request is made (V5).
    pub fn api_put(
        &self,
        now: Instant,
        path: &str,
        body: &str,
    ) -> Result<(u16, String), AccountError> {
        let token = self.access_token(now)?;
        self.api
            .put(path, &token, body)
            .map_err(AccountError::Unreachable)
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
