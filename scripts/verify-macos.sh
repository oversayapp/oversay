#!/usr/bin/env bash
# Checks that a macOS build is what a user needs to install it without Gatekeeper warnings:
# signed with the hardened runtime and a secure timestamp, only the microphone entitlement, both
# architectures, no library from outside the system, notarized and stapled (the app and the .dmg).
#
# Usage: scripts/verify-macos.sh [bundle-dir]
#   bundle-dir holds macos/Oversay.app and dmg/*.dmg; the default is the universal build's.
# Exits 1 if any check fails. It never prints who signed it (the log of a public run is public).
# Runs after `make build-mac` or in CI after the signed build (.github/workflows/build.yml).

set -u

bundle=${1:-app/src-tauri/target/universal-apple-darwin/release/bundle}
app="$bundle/macos/Oversay.app"
dmg=$(find "$bundle/dmg" -name '*.dmg' 2> /dev/null | head -1)
exe="$app/Contents/MacOS/oversay"
plist="$app/Contents/Info.plist"

failed=0
pass() { echo "ok    $1"; }
fail() { echo "FAIL  $1"; failed=1; }
check() { # check <what> <command...>: ok when the command succeeds
  local what=$1
  shift
  if "$@" > /dev/null 2>&1; then pass "$what"; else fail "$what"; fi
}

[ -d "$app" ] || { echo "FAIL  no app at $app"; exit 1; }
[ -n "$dmg" ] || { echo "FAIL  no .dmg in $bundle/dmg"; exit 1; }

details=$(codesign -dvv "$app" 2>&1)
# shellcheck disable=SC2329  # called through check
has() { echo "$details" | grep -q -E "$1"; }

check "app signature is valid (deep, strict)" codesign --verify --deep --strict "$app"
check "bundle identifier is app.oversay" has '^Identifier=app\.oversay$'
check "signed with a Developer ID Application certificate" has '^Authority=Developer ID Application:'
check "hardened runtime is on" has 'flags=0x[0-9a-f]+\(.*runtime'
check "signature has a secure timestamp" has '^Timestamp='

# Exactly one entitlement, the microphone. Anything else needs a reason (Entitlements.plist).
entitlements=$(codesign -d --entitlements :- "$app" 2> /dev/null | plutil -p - 2> /dev/null)
keys=$(echo "$entitlements" | grep -c '=>')
if [ "$keys" = 1 ] && echo "$entitlements" | grep -q 'com.apple.security.device.audio-input'; then
  pass "the only entitlement is the microphone"
else
  fail "the only entitlement is the microphone (found $keys)"
fi

archs=$(lipo -archs "$exe" 2> /dev/null)
case " $archs " in *" arm64 "*) arm=1 ;; *) arm=0 ;; esac
case " $archs " in *" x86_64 "*) intel=1 ;; *) intel=0 ;; esac
check "both architectures (arm64, x86_64): found $archs" test "$arm$intel" = 11

# A library from outside the system would be rejected by the hardened runtime's library validation.
# otool prints a header line per architecture (ending in a colon), then one line per library.
outside=$(otool -L "$exe" | grep -v ':$' | awk '{print $1}' | grep -v -E '^/System/|^/usr/lib/')
check "links only system libraries" test -z "$outside"
[ -z "$outside" ] || echo "$outside"

check "microphone usage string is in Info.plist" /usr/libexec/PlistBuddy -c 'Print :NSMicrophoneUsageDescription' "$plist"
check "Documents usage string is in Info.plist" /usr/libexec/PlistBuddy -c 'Print :NSDocumentsFolderUsageDescription' "$plist"
scheme=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleURLTypes:0:CFBundleURLSchemes:0' "$plist" 2> /dev/null)
check "oversay:// link scheme is registered" test "$scheme" = oversay

check "app has a stapled notarization ticket" xcrun stapler validate "$app"
app_verdict=$(spctl --assess --type execute --verbose=4 "$app" 2>&1)
check "Gatekeeper accepts the app as notarized" grep -q 'source=Notarized Developer ID' <<< "$app_verdict"

check ".dmg signature is valid" codesign --verify "$dmg"
check ".dmg has a stapled notarization ticket" xcrun stapler validate "$dmg"
dmg_verdict=$(spctl --assess --type open --context context:primary-signature --verbose=4 "$dmg" 2>&1)
check "Gatekeeper accepts the .dmg as notarized" grep -q 'source=Notarized Developer ID' <<< "$dmg_verdict"

if [ "$failed" = 0 ]; then echo "All checks passed."; else echo "Some checks failed."; fi
exit "$failed"
