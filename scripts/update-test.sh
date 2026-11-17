#!/usr/bin/env bash
# The hands-on update test on this Mac (docs/releasing.md, "Test builds"): two builds with a
# throwaway key and a feed served from this machine. Nothing is published, no repository secret
# is set, and the key lives in out/update-test/, which is never committed.
#
#   scripts/update-test.sh setup           make the throwaway key and a local certificate (needs mkcert)
#   scripts/update-test.sh build 0.0.1     build a signed copy that checks the local feed, as version 0.0.1
#   scripts/update-test.sh build 0.0.2     the same, as the newer version
#   scripts/update-test.sh serve 0.0.2     serve that build as the feed (Ctrl+C stops)
#
# Then: install builds/0.0.1/Oversay.app (drag it to /Applications), start the feed, open it.
# The version is a build-time override, so no tracked file changes.

set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
dir="$root/out/update-test"
port=8443
feed="https://localhost:$port/latest.json"

die() {
  echo "update-test: $*" >&2
  exit 1
}

version_ok() { [[ ${1:-} =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "give a plain version such as 0.0.2"; }

cmd=${1:-help}
case $cmd in
  setup)
    command -v mkcert > /dev/null || die "mkcert is needed: brew install mkcert, then run 'mkcert -install' once (it adds a local certificate authority to this Mac's trust store, so it is yours to run)"
    mkdir -p "$dir"
    # An empty password: the key only ever signs test builds on this machine.
    (cd "$root/app" && npx tauri signer generate --ci -f -p "" -w "$dir/test.key")
    mkcert -cert-file "$dir/cert.pem" -key-file "$dir/key.pem" localhost 127.0.0.1
    echo "Ready. Next: scripts/update-test.sh build 0.0.1"
    ;;
  build)
    version_ok "${2:-}"
    v=$2
    [ -f "$dir/test.key" ] || die "run setup first"
    out="$dir/builds/$v"
    rm -rf "$out"
    mkdir -p "$out"
    config="$dir/config-$v.json"
    OVERSAY_UPDATE_FEED=$feed OVERSAY_UPDATE_PUBKEY=$(cat "$dir/test.key.pub") TAURI_SIGNING_PRIVATE_KEY=x \
      node "$root/scripts/build-config.mjs" "$config"
    node -e 'const f=process.argv[1],c=JSON.parse(require("fs").readFileSync(f));c.version=process.argv[2];require("fs").writeFileSync(f,JSON.stringify(c,null,2))' "$config" "$v"
    (
      cd "$root/app"
      TAURI_SIGNING_PRIVATE_KEY=$(cat "$dir/test.key") TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
        npx tauri build --bundles app --config "$config"
    )
    bundle="$root/app/src-tauri/target/release/bundle/macos"
    ditto "$bundle/Oversay.app" "$out/Oversay.app"
    cp "$bundle/Oversay.app.tar.gz" "$bundle/Oversay.app.tar.gz.sig" "$out/"
    echo "Built $v: $out/Oversay.app (and its update package)"
    ;;
  serve)
    version_ok "${2:-}"
    v=$2
    out="$dir/builds/$v"
    [ -f "$out/Oversay.app.tar.gz.sig" ] || die "build $v first"
    printf 'Test release %s\n' "$v" > "$out/notes.md"
    node "$root/scripts/latest-json.mjs" --dir "$out" --version "$v" --base "https://localhost:$port/" --notes-file "$out/notes.md"
    exec node "$root/scripts/serve-feed.mjs" "$out" "$dir/cert.pem" "$dir/key.pem" "$port"
    ;;
  *)
    sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'
    ;;
esac
