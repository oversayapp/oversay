// KWin script (Plasma 6.6+), loaded by capture-test.sh script-apply. Marks every window whose title
// starts with "Oversay capture test" as excluded from capture, now and as such windows open. This
// is route A: the way Oversay itself could hide its overlays (epic #49).

const TITLE = "Oversay capture test";

function hideIfTest(window) {
    if (window.caption.indexOf(TITLE) === 0 && !window.excludeFromCapture) {
        window.excludeFromCapture = true;
    }
}

function watch(window) {
    hideIfTest(window);
    // A window's title can arrive after the window does.
    window.captionChanged.connect(function () { hideIfTest(window); });
}

workspace.windowList().forEach(watch);
workspace.windowAdded.connect(watch);
