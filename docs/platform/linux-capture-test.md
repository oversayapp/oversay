# Capture-hiding test on the Steam Deck (KDE Plasma, Wayland)

Epic [#49](https://github.com/oversayapp/oversay/issues/49), slice 1. This test decides whether Oversay on Linux keeps the promise that overlays are hidden from screen capture by default ([ADR 0003](../../.adr/0003-overlays-hidden-from-screen-capture-by-default.md)), or lists it as a known gap. Run it before anything else in the epic is built. It needs no Oversay build: a throwaway test window stands in for an overlay. Write what you find in [linux-results.md](linux-results.md).

The kit is [`scripts/linux-capture-test/`](../../scripts/linux-capture-test/): `capture-test.sh`, and two KWin scripts it loads. It never needs sudo and never touches the read-only system. The only file it changes is `~/.config/kwinrulesrc`, and only in route B, which backs that file up first and has an undo step.

## What is being tested

KWin can leave a window out of screen captures: the window menu's **Hide from Screenshots and Screen Recordings**, added in Plasma 6.6. The question is whether an app can turn that on for its own windows, with no clicks from the person using it. The test tries two routes:

- **Route A, a KWin script.** The app asks KWin, over D-Bus, to load a small script, and the script marks the app's windows as hidden from capture. This changes no settings, and it stops when the script is unloaded or the session ends.
- **Route B, a window rule.** The app writes a rule into `~/.config/kwinrulesrc` and asks KWin to reload its rules. The rule stays until it is removed. It is the same rule a person could make in System Settings › Window Rules (Plasma 6.7).

Both routes match only windows whose title starts with "Oversay capture test".

The step-1 baseline (the window menu) shows whether KWin's hiding works on each capture at all. Routes A and B show whether an app can switch it on. If the baseline fails on a capture, that is KWin's gap, and neither route will fix it.

## 1. Get ready (once)

1. Switch the Deck to **desktop mode** (Steam button › Power › Switch to Desktop). Plug in a keyboard if you have one.
2. Open **Konsole** (application launcher › System › Konsole) and fetch the kit:

   ```bash
   git clone --depth 1 -b epic-035-linux-capture-test https://github.com/oversayapp/oversay.git ~/oversay-capture-test
   ```

   ```bash
   cd ~/oversay-capture-test/scripts/linux-capture-test
   ```

   Once the PR is merged, leave out `-b epic-035-linux-capture-test`.
3. Check the system:

   ```bash
   ./capture-test.sh info
   ```

   You need `Session type: wayland`, Plasma 6.7 or later, `dbus-send`, `kreadconfig6`, `kwriteconfig6`, and `zenity` or `kdialog`. Copy the Plasma version into the results table.
4. Install what you'll capture with, from **Discover** (all Flatpaks, no sudo):
   - Google Chrome or Firefox, for Google Meet
   - Zoom
   - OBS Studio

   Spectacle is already installed.
5. Have a second device (a phone or another computer) that can join a Meet and a Zoom call, to see what the share shows.

## 2. Baseline: does KWin's own hiding work?

1. Open a test window:

   ```bash
   ./capture-test.sh window
   ```

2. Click the test window, press **Alt+F3**, open **More Actions**, and tick **Hide from Screenshots and Screen Recordings**. If the menu doesn't have it, Plasma is older than 6.6: stop here and record that.
3. Run the **capture checklist** below. Record each result in the **Baseline** column.
4. Close the test window.

## 3. Route A: the KWin script

1. Apply the script, then open a new test window:

   ```bash
   ./capture-test.sh script-apply
   ```

   ```bash
   ./capture-test.sh window
   ```

2. Check that the flag is set without your doing anything. Press Alt+F3 on the test window: **Hide from Screenshots and Screen Recordings** should already be ticked. Or run this and click the test window, and look for `excludeFromCapture = true`:

   ```bash
   ./capture-test.sh inspect
   ```

   Also copy the `resourceClass` it prints into the results' notes. That's the class a GTK app (as Oversay is) gets on Wayland.
3. Run the capture checklist. Record each result in the **Route A** column.
4. **XWayland:** close the window, then open the XWayland kind:

   ```bash
   ./capture-test.sh window xwayland
   ```

   Repeat step 2 and the Spectacle and OBS rows of the checklist. Record them in **Route A, XWayland**.
5. Undo, and check that a new test window shows up in a Spectacle screenshot again:

   ```bash
   ./capture-test.sh script-undo
   ```

## 4. Route B: the window rule

1. Close every test window. Then apply the rule:

   ```bash
   ./capture-test.sh rule-apply
   ```

   ```bash
   ./capture-test.sh window
   ```

2. Check the flag as in route A, step 2. The rule also shows in System Settings › Window Management › Window Rules as "Oversay capture test (safe to delete)".
3. Run the Spectacle and OBS rows of the checklist (route A covers the rest of the captures). Record them in the **Route B** column. Then try one XWayland window:

   ```bash
   ./capture-test.sh window xwayland
   ```

4. Undo, then close the test windows:

   ```bash
   ./capture-test.sh rule-undo
   ```

   `./capture-test.sh info` should now say `Rule: not present`. A copy of `kwinrulesrc` from before the first rule-apply stays at `~/.config/kwinrulesrc.oversay-backup`.

## Capture checklist

Place the test window over part of something easy to see, such as a browser page. **Pass** means the test window is missing from the capture while the rest of the screen shows. **Fail** means any part of the window shows, even for a moment, when you move it or click it.

| # | Capture | How |
| --- | --- | --- |
| C1 | Google Meet, whole screen | In Chrome or Firefox, start a Meet, join it from the second device, and **Present now › Entire screen**. Look on the second device, and move the test window while you look. |
| C2 | Zoom, whole screen | Start a Zoom meeting, join it from the second device, and **Share Screen** with the whole screen. Look on the second device. |
| C3 | OBS recording | In OBS, add a **Screen Capture (PipeWire)** source and pick the whole screen. Record 15 seconds while you move the test window, then play the recording. |
| C4 | Sharing one other window | In Meet, **Present now › A window**, and pick the browser or Konsole. Put the test window on top of that window. On the second device, the test window must not appear over the shared window. |
| C5 | Spectacle screenshot | Spectacle, **Full Screen** and **Rectangular Region** (drawn across the test window). Also **Window Under Cursor** on the test window itself: Plasma 6.7 should give an empty picture. |

When the portal's picker opens, choose the screen or window and allow it. On a Wayland session, every app above captures through that picker.

## If there is no test window

`window` needs `zenity` (GTK) or `kdialog` (Qt), and `info` says which is there. If both are missing, any app whose window title you can set will do. Start the title with "Oversay capture test". For example, in Kate: save a new file as `Oversay capture test.txt`. Its title then starts with the file name.

## When done

1. Fill in [linux-results.md](linux-results.md).
2. Remove the kit:

   ```bash
   rm -rf ~/oversay-capture-test
   ```

3. Remove the rule backup if you don't want it:

   ```bash
   rm ~/.config/kwinrulesrc.oversay-backup
   ```
