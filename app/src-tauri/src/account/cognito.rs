//! The real `TokenEndpoint` and `Api`: Cognito's OAuth endpoints for the stage's desktop client,
//! and the stage's API, over HTTPS (ureq, rustls).

use std::time::Duration;

use super::{AuthError, REDIRECT, Stage, Tokens};

/// One agent for Cognito and the API (an agent is shared state inside: clones share its pool).
pub fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(20)))
        // A 400 from Cognito is an answer to read (`invalid_grant`), not a failed request.
        .http_status_as_error(false)
        .https_only(true)
        .build()
        .into()
}

/// A response's status and its body, up to `limit` bytes.
fn read(
    mut response: ureq::http::Response<ureq::Body>,
    limit: u64,
    from: &str,
) -> Result<(u16, String), String> {
    let status = response.status().as_u16();
    let body = response
        .body_mut()
        .with_config()
        .limit(limit)
        .read_to_string()
        .map_err(|e| format!("{from}'s answer couldn't be read: {e}"))?;
    Ok((status, body))
}

pub struct Cognito {
    token_url: String,
    revoke_url: String,
    client_id: &'static str,
    agent: ureq::Agent,
}

impl Cognito {
    pub fn new(stage: &Stage, agent: ureq::Agent) -> Self {
        Cognito {
            token_url: format!("{}/oauth2/token", stage.hosted_page),
            revoke_url: format!("{}/oauth2/revoke", stage.hosted_page),
            client_id: stage.client_id,
            agent,
        }
    }

    fn post(&self, url: &str, form: &[(&str, &str)]) -> Result<(u16, String), AuthError> {
        let response = self
            .agent
            .post(url)
            .send_form(form.iter().copied())
            .map_err(|e| AuthError::Unreachable(format!("Cognito couldn't be reached: {e}")))?;
        read(response, 64 * 1024, "Cognito").map_err(AuthError::Unreachable)
    }

    fn tokens(&self, form: &[(&str, &str)]) -> Result<Tokens, AuthError> {
        let (status, body) = self.post(&self.token_url, form)?;
        // 400 is `invalid_grant` and its kind: the code or token is no good (RFC 6749 §5.2).
        if status == 400 || status == 401 {
            return Err(AuthError::Rejected);
        }
        if status != 200 {
            return Err(AuthError::Unreachable(format!("Cognito answered {status}")));
        }
        let json: serde_json::Value = serde_json::from_str(&body)
            .map_err(|_| AuthError::Unreachable("Cognito's answer wasn't JSON".into()))?;
        let text = |key: &str| json.get(key).and_then(|v| v.as_str()).map(str::to_string);
        Ok(Tokens {
            access_token: text("access_token")
                .ok_or_else(|| AuthError::Unreachable("no access token".into()))?,
            id_token: text("id_token"),
            refresh_token: text("refresh_token"),
            expires_in: json
                .get("expires_in")
                .and_then(|v| v.as_u64())
                .unwrap_or(300),
        })
    }
}

impl super::TokenEndpoint for Cognito {
    fn exchange_code(&self, code: &str, verifier: &str) -> Result<Tokens, AuthError> {
        self.tokens(&[
            ("grant_type", "authorization_code"),
            ("client_id", self.client_id),
            ("code", code),
            ("redirect_uri", REDIRECT),
            ("code_verifier", verifier),
        ])
    }

    fn refresh(&self, refresh_token: &str) -> Result<Tokens, AuthError> {
        self.tokens(&[
            ("grant_type", "refresh_token"),
            ("client_id", self.client_id),
            ("refresh_token", refresh_token),
        ])
    }

    fn revoke(&self, refresh_token: &str) -> Result<(), AuthError> {
        let (status, _) = self.post(
            &self.revoke_url,
            &[("token", refresh_token), ("client_id", self.client_id)],
        )?;
        match status {
            200 => Ok(()),
            400 | 401 => Err(AuthError::Rejected),
            other => Err(AuthError::Unreachable(format!("Cognito answered {other}"))),
        }
    }
}

pub struct HttpApi {
    base: &'static str,
    agent: ureq::Agent,
}

impl HttpApi {
    pub fn new(stage: &Stage, agent: ureq::Agent) -> Self {
        HttpApi {
            base: stage.api,
            agent,
        }
    }
}

impl super::Api for HttpApi {
    fn get(&self, path: &str, access_token: &str) -> Result<(u16, String), String> {
        let response = self
            .agent
            .get(format!("{}{path}", self.base))
            .header("Authorization", format!("Bearer {access_token}"))
            .call()
            .map_err(|e| format!("The API couldn't be reached: {e}"))?;
        read(response, 4 * 1024 * 1024, "The API")
    }
}
