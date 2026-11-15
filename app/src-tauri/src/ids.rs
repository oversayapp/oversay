//! Short random ids such as `d_k3x9a2bq` (spec §3, ADR 0037), made as `newId` in
//! src/lib/project/ids.ts makes them: the same alphabet and length, each character drawn evenly.
//! Both sides test against src/lib/project/ids.json.

const ALPHABET: &[u8] = b"abcdefghijklmnopqrstuvwxyz0123456789";
const BODY_LENGTH: usize = 8;

/// A deck's id prefix (ADR 0037).
pub const DECK_PREFIX: &str = "d_";

/// A workspace's id prefix (ADR 0040).
pub const WORKSPACE_PREFIX: &str = "w_";

/// The largest multiple of the alphabet's length a byte can hold (252): a byte at or above it is
/// drawn again, so no character comes up more often than another (a byte modulo 36 favoured a–d).
const LIMIT: u8 = (256 / ALPHABET.len() * ALPHABET.len()) as u8;

/// The id body from `bytes`, taking each byte below `LIMIT`; None until there are enough.
fn body_from(bytes: impl IntoIterator<Item = u8>) -> Option<String> {
    let body: String = bytes
        .into_iter()
        .filter(|&b| b < LIMIT)
        .take(BODY_LENGTH)
        .map(|b| ALPHABET[usize::from(b) % ALPHABET.len()] as char)
        .collect();
    (body.len() == BODY_LENGTH).then_some(body)
}

/// A new id with `prefix`, from the system's random source.
pub fn new_id(prefix: &str) -> String {
    let mut drawn = Vec::new();
    loop {
        let mut bytes = [0u8; BODY_LENGTH * 2];
        getrandom::fill(&mut bytes).expect("the system's random source is unavailable");
        drawn.extend_from_slice(&bytes);
        if let Some(body) = body_from(drawn.iter().copied()) {
            return format!("{prefix}{body}");
        }
    }
}

/// Whether `id` is an id with `prefix`: as `isValidId` in ids.ts, 1 to 16 of the alphabet after it.
pub fn is_valid_id(prefix: &str, id: &str) -> bool {
    id.strip_prefix(prefix).is_some_and(|body| {
        (1..=16).contains(&body.len()) && body.bytes().all(|b| ALPHABET.contains(&b))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec() -> serde_json::Value {
        serde_json::from_str(include_str!("../../src/lib/project/ids.json")).unwrap()
    }

    #[test]
    fn ids_are_made_as_the_frontend_makes_them() {
        let spec = spec();
        assert_eq!(spec["alphabet"].as_str().unwrap().as_bytes(), ALPHABET);
        assert_eq!(spec["length"].as_u64().unwrap() as usize, BODY_LENGTH);
        assert_eq!(spec["prefixes"]["deck"].as_str().unwrap(), DECK_PREFIX);
        assert_eq!(
            spec["prefixes"]["workspace"].as_str().unwrap(),
            WORKSPACE_PREFIX
        );
    }

    #[test]
    fn a_new_id_has_its_prefix_and_length() {
        let id = new_id(DECK_PREFIX);
        assert!(id.starts_with("d_"));
        assert_eq!(id.len(), 2 + BODY_LENGTH);
        assert!(is_valid_id(DECK_PREFIX, &id));
        assert_ne!(new_id(DECK_PREFIX), id);
    }

    #[test]
    fn bytes_that_would_favour_a_character_are_drawn_again() {
        assert_eq!(LIMIT, 252);
        // 252 to 255 would be a to d a second time.
        assert_eq!(
            body_from([252, 253, 254, 255, 0, 1, 2, 3, 4, 5, 6, 35]),
            Some("abcdefg9".into())
        );
        assert_eq!(body_from([255, 0, 1]), None);
    }

    #[test]
    fn every_character_comes_up_evenly() {
        let mut counts = [0usize; 36];
        let ids = 20_000;
        for _ in 0..ids {
            for b in new_id("").bytes() {
                counts[ALPHABET.iter().position(|&a| a == b).unwrap()] += 1;
            }
        }
        // Expected 4444 each; a byte modulo 36 gave a–d 5000. Within 10%, about 6.7 standard deviations.
        let expected = ids * BODY_LENGTH / ALPHABET.len();
        for (i, &n) in counts.iter().enumerate() {
            assert!(
                n.abs_diff(expected) < expected / 10,
                "{} came up {n} times",
                ALPHABET[i] as char
            );
        }
    }

    #[test]
    fn checks_ids_as_the_frontend_does() {
        assert!(is_valid_id("d_", "d_k3x9a2bq"));
        assert!(!is_valid_id("d_", "p_k3x9a2bq"));
        assert!(!is_valid_id("d_", "d_"));
        assert!(!is_valid_id("d_", "d_K3X9"));
        assert!(!is_valid_id("d_", "d_k3x9-2bq"));
        assert!(!is_valid_id("d_", &format!("d_{}", "a".repeat(17))));
    }
}
