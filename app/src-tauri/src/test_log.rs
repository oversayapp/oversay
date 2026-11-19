//! Tests only: the log lines the code under test wrote on this test's thread, so a test can assert
//! the debug events its behaviour logs (docs/work-standards.md, Observable behaviour). Each test
//! runs on its own thread, so tests running side by side don't see each other's lines.

use std::cell::RefCell;
use std::sync::Once;

thread_local! {
    static LINES: RefCell<Vec<String>> = const { RefCell::new(Vec::new()) };
}

struct Capture;

impl log::Log for Capture {
    fn enabled(&self, _: &log::Metadata) -> bool {
        true
    }
    fn log(&self, record: &log::Record) {
        LINES.with(|l| l.borrow_mut().push(record.args().to_string()));
    }
    fn flush(&self) {}
}

static CAPTURE: Capture = Capture;
static INSTALL: Once = Once::new();

/// Starts capturing on this thread, from an empty list.
pub fn start() {
    INSTALL.call_once(|| {
        log::set_logger(&CAPTURE).expect("no other logger in tests");
        log::set_max_level(log::LevelFilter::Trace);
    });
    LINES.with(|l| l.borrow_mut().clear());
}

/// Every line logged on this thread since `start`.
pub fn lines() -> Vec<String> {
    LINES.with(|l| l.borrow().clone())
}

/// Whether a line starts with `event` (`account.signed_in`, say).
pub fn logged(event: &str) -> bool {
    lines()
        .iter()
        .any(|l| l == event || l.starts_with(&format!("{event} ")))
}
