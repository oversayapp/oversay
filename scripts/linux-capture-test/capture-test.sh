#!/usr/bin/env bash
# The capture-hiding test kit for KDE Plasma on Wayland (epic #49, slice 1). Run on the Steam Deck in
# desktop mode, from Konsole. Not part of the app and never shipped: it tries the routes Oversay
# could use to hide its own overlays from screen capture, on a throwaway test window.
# Steps and the capture checklist: docs/platform/linux-capture-test.md.
#
#   capture-test.sh info                  Plasma version, session type and what this kit finds
#   capture-test.sh window [xwayland]     open a test window (native Wayland, or XWayland)
#   capture-test.sh inspect               click a window: prints its class and excludeFromCapture
#   capture-test.sh script-apply          route A: a KWin script hides every test window
#   capture-test.sh script-undo           show the test windows again and unload the script
#   capture-test.sh rule-apply            route B: a KWin window rule hides every test window
#   capture-test.sh rule-undo             remove the rule (open test windows keep it until closed)
#
# Every test window's title starts with "Oversay capture test"; both routes match on that and
# nothing else, so no other window is touched.

set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
title="Oversay capture test"
script_name="oversay-capture-test"
rule_group="oversay-capture-test"
rules_file="${XDG_CONFIG_HOME:-$HOME/.config}/kwinrulesrc"

die() {
  echo "capture-test: $*" >&2
  exit 1
}

have() { command -v "$1" > /dev/null 2>&1; }

kwin() { dbus-send --session --print-reply --dest=org.kde.KWin "$@"; }

need_kwin() {
  have dbus-send || die "dbus-send is missing"
  kwin /KWin org.freedesktop.DBus.Peer.Ping > /dev/null 2>&1 \
    || die "KWin is not answering on the session bus: run this from desktop mode (KDE Plasma)"
}

# kreadconfig6/kwriteconfig6 ship with Plasma 6.
need_kconfig() {
  if ! have kreadconfig6 || ! have kwriteconfig6; then
    die "kreadconfig6 or kwriteconfig6 is missing (Plasma 6 needed)"
  fi
}

# Loads a KWin script file under a plugin name and runs it. An earlier copy is unloaded first:
# KWin refuses to load a name it already has.
run_kwin_script() {
  local file=$1 name=$2 id
  kwin /Scripting org.kde.kwin.Scripting.unloadScript "string:$name" > /dev/null
  id=$(kwin /Scripting org.kde.kwin.Scripting.loadScript "string:$file" "string:$name" | awk '/int32/ {print $2}')
  [[ $id =~ ^[0-9]+$ ]] || die "KWin did not load $file (got '${id:-nothing}')"
  kwin "/Scripting/Script$id" org.kde.kwin.Script.run > /dev/null
  echo "Loaded and ran $name (script $id)."
}

reconfigure() { kwin /KWin org.kde.KWin.reconfigure > /dev/null; }

cmd=${1:-help}
case $cmd in
  info)
    echo "Session type:  ${XDG_SESSION_TYPE:-unknown}  (should be wayland)"
    echo "Desktop:       ${XDG_CURRENT_DESKTOP:-unknown}"
    if have plasmashell; then echo "Plasma:        $(plasmashell --version 2> /dev/null)"; fi
    if have kwin_wayland; then echo "KWin:          $(kwin_wayland --version 2> /dev/null)"; fi
    for t in zenity kdialog kreadconfig6 kwriteconfig6 dbus-send spectacle; do
      if have "$t"; then echo "found:         $t"; else echo "missing:       $t"; fi
    done
    # By key, not by group header: KConfig may keep an emptied group after rule-undo.
    if have kreadconfig6 && [[ -n $(kreadconfig6 --file kwinrulesrc --group "$rule_group" --key excludefromcapture) ]]; then
      echo "Rule:          present in $rules_file"
    else
      echo "Rule:          not present"
    fi
    if have dbus-send; then
      loaded=$(kwin /Scripting org.kde.kwin.Scripting.isScriptLoaded "string:$script_name" 2> /dev/null | awk '/boolean/ {print $2}')
      echo "Script:        loaded=${loaded:-unknown}"
    fi
    echo "Plasma 6.6 or later is needed for the flag, 6.7 or later for the rule and Spectacle."
    ;;

  window)
    kind=${2:-native}
    case $kind in
      native) label="native Wayland" ;;
      xwayland) label="XWayland" ;;
      *) die "window takes no argument or 'xwayland'" ;;
    esac
    text="This is a test window. It should be missing from screen shares, recordings and screenshots once a route hides it. Close it when done."
    # Both are GTK (zenity, as Oversay is GTK) or Qt (kdialog) apps that run without the Deck's
    # read-only root being touched. The backend variable picks native Wayland or XWayland.
    if have zenity; then
      if [[ $kind == xwayland ]]; then export GDK_BACKEND=x11; else export GDK_BACKEND=wayland; fi
      zenity --info --title "$title ($label)" --text "$text" --width 700 --height 450 > /dev/null 2>&1 &
    elif have kdialog; then
      if [[ $kind == xwayland ]]; then export QT_QPA_PLATFORM=xcb; else export QT_QPA_PLATFORM=wayland; fi
      kdialog --title "$title ($label)" --msgbox "$text" > /dev/null 2>&1 &
    else
      die "neither zenity nor kdialog is installed; see 'If there is no test window' in docs/platform/linux-capture-test.md"
    fi
    echo "Opened \"$title ($label)\"."
    ;;

  inspect)
    need_kwin
    echo "Click the window to inspect (Esc cancels)..."
    # dbus-send prints each entry as a 'string "key"' line followed by a 'variant <type> <value>' line.
    kwin /KWin org.kde.KWin.queryWindowInfo | awk '
      key != "" { sub(/^ *variant +[a-z0-9]+ /, ""); print key " = " $0; key = "" }
      /^ *string "(caption|resourceClass|resourceName|desktopFile|excludeFromCapture|keepAbove)"$/ {
        key = $2; gsub(/"/, "", key)
      }'
    ;;

  script-apply)
    need_kwin
    run_kwin_script "$here/hide.js" "$script_name"
    echo "Open test windows are hidden now, and new ones as they open, until script-undo."
    ;;

  script-undo)
    need_kwin
    kwin /Scripting org.kde.kwin.Scripting.unloadScript "string:$script_name" > /dev/null
    run_kwin_script "$here/reveal.js" "$script_name-reveal"
    kwin /Scripting org.kde.kwin.Scripting.unloadScript "string:$script_name-reveal" > /dev/null
    echo "Test windows are shown again and both scripts are unloaded."
    ;;

  rule-apply)
    need_kwin
    need_kconfig
    if [[ -f $rules_file && ! -f $rules_file.oversay-backup ]]; then
      cp "$rules_file" "$rules_file.oversay-backup"
      echo "Backed up $rules_file to $rules_file.oversay-backup"
    fi
    w() { kwriteconfig6 --file kwinrulesrc --group "$rule_group" --key "$1" "$2"; }
    w Description "Oversay capture test (safe to delete)"
    w title "$title"
    w titlematch 2 # substring
    w wmclassmatch 0 # any class
    w excludefromcapture true
    w excludefromcapturerule 2 # Force
    # Plasma 6.7 lists rule groups in [General] rules=, comma-separated, with count=.
    list=$(kreadconfig6 --file kwinrulesrc --group General --key rules)
    if [[ ",$list," != *",$rule_group,"* ]]; then
      list=${list:+$list,}$rule_group
    fi
    kwriteconfig6 --file kwinrulesrc --group General --key rules "$list"
    count=$(tr ',' '\n' <<< "$list" | grep -c .)
    kwriteconfig6 --file kwinrulesrc --group General --key count "$count"
    reconfigure
    echo "Rule written and KWin reconfigured. Open a new test window to check it."
    ;;

  rule-undo)
    need_kwin
    need_kconfig
    for k in Description title titlematch wmclassmatch excludefromcapture excludefromcapturerule; do
      kwriteconfig6 --file kwinrulesrc --group "$rule_group" --key "$k" --delete
    done
    list=$(kreadconfig6 --file kwinrulesrc --group General --key rules)
    list=$(tr ',' '\n' <<< "$list" | grep -v -x -F "$rule_group" | paste -s -d, - || true)
    kwriteconfig6 --file kwinrulesrc --group General --key rules "$list"
    count=$(tr ',' '\n' <<< "$list" | grep -c . || true)
    kwriteconfig6 --file kwinrulesrc --group General --key count "$count"
    reconfigure
    echo "Rule removed and KWin reconfigured. Close any open test windows: a forced flag can stay set."
    if [[ -f $rules_file.oversay-backup ]]; then
      echo "The backup from before the first rule-apply: $rules_file.oversay-backup"
    fi
    ;;

  help | -h | --help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) die "unknown command '$cmd' (try: $0 help)" ;;
esac
