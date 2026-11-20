//! The real `SecretStore`: one generic password in the OS keychain (Keychain on a Mac, Credential
//! Manager on Windows), never a file or the settings JSON (ADR 0050, V7). One item per stage, so a
//! dev sign-in never meets a prod one.

use super::Stage;

pub struct Keychain {
    service: String,
}

/// The item's account name; the service names the stage.
const USER: &str = "refresh-token";

impl Keychain {
    pub fn new(stage: &Stage) -> Self {
        Keychain {
            service: format!("app.oversay.account.{}", stage.name),
        }
    }

    fn entry(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::new(&self.service, USER).map_err(|e| e.to_string())
    }
}

impl super::SecretStore for Keychain {
    fn load(&self) -> Result<Option<String>, String> {
        match self.entry()?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    fn save(&self, value: &str) -> Result<(), String> {
        self.entry()?.set_password(value).map_err(|e| e.to_string())
    }

    fn delete(&self) -> Result<(), String> {
        match self.entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}
