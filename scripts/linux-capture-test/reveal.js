// KWin script, run once by capture-test.sh script-undo: shows every "Oversay capture test" window
// in captures again.

const TITLE = "Oversay capture test";

workspace.windowList().forEach(function (window) {
    if (window.caption.indexOf(TITLE) === 0) {
        window.excludeFromCapture = false;
    }
});
