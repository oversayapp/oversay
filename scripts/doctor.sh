#!/usr/bin/env bash
# make doctor: read-only check of the tools development needs, and on Linux of the build
# libraries. Installs nothing and changes nothing. Exits 1 when something is missing, naming the
# command that fixes it. `make setup` runs this last. On SteamOS it runs inside the oversay-dev
# box once that exists (scripts/linux.sh).
set -u
cd "$(dirname "$0")/.." || exit 1

# Never let mise install anything from here.
export MISE_EXEC_AUTO_INSTALL=0 MISE_NOT_FOUND_AUTO_INSTALL=0

missing=0
have() { command -v "$1" > /dev/null 2>&1; }

# Version of a tool as the repo would run it: through mise when mise is there, else from PATH.
version_of() {
	local out
	if have mise && out=$(mise exec -- "$@" 2> /dev/null); then :
	elif out=$("$@" 2> /dev/null); then :
	else return 1; fi
	# This tool prints a description first and "version: x.y.z" on a later line.
	local v
	v=$(printf '%s\n' "$out" | sed -n 's/^version: //p' | head -n 1)
	printf '%s\n' "${v:-$(printf '%s\n' "$out" | head -n 1)}"
}

report() { # name, version-or-empty, hint
	if [ -n "$2" ]; then
		printf '  ok       %-12s %s\n' "$1" "$2"
	else
		printf '  MISSING  %-12s %s\n' "$1" "$3"
		missing=1
	fi
}

check() { # name, hint, command...
	local name=$1 hint=$2 v
	shift 2
	v=$(version_of "$@") || v=""
	report "$name" "$v" "$hint"
}

os=$(uname -s)
mise_hint="run: make setup (installs it with Homebrew)"
if [ "$os" = "Linux" ]; then
	# shellcheck source=linux.sh
	. scripts/linux.sh
	if linux_devbox_route && linux_devbox_exists; then
		exec distrobox enter "$DEVBOX" -- "$PWD/scripts/doctor.sh"
	fi
	[ -x "$HOME/.local/bin/mise" ] && ! have mise && PATH="$HOME/.local/bin:$PATH"
	mise_hint="run: make setup (installs it in ~/.local/bin)"
fi

echo "Oversay development tools:"
if [ "$os" = "Darwin" ]; then
	if xcode-select -p > /dev/null 2>&1; then
		report "xcode-clt" "$(xcode-select -p)" ""
	else
		report "xcode-clt" "" "run: xcode-select --install"
	fi
fi
if have mise; then report mise "$(mise --version | head -n 1)" ""; else report mise "" "$mise_hint"; fi
check rust "run: make setup" rustc --version
check cargo "run: make setup" cargo --version
check cmake "run: make setup" cmake --version
check gitleaks "run: make setup" gitleaks version
check cargo-audit "run: make setup" cargo audit --version
check shellcheck "run: make setup" shellcheck --version
check node "run: make setup" node --version
check npm "run: make setup" npm --version

hooks=$(git config core.hooksPath 2> /dev/null || true)
# A worktree may carry its own config with an absolute path to .githooks; that counts too.
case "$hooks" in
	.githooks | */.githooks) report git-hooks "$hooks" "" ;;
	*) report git-hooks "" "run: make hooks" ;;
esac

if [ -d app/node_modules ]; then report app-deps "app/node_modules present" ""; else report app-deps "" "run: cd app && npm ci (make setup does it)"; fi

if [ "$os" = "Linux" ]; then
	echo
	if linux_devbox_route; then
		# Only reached before the box exists: make setup creates it.
		echo "Build libraries (they live in the $DEVBOX distrobox):"
		if have distrobox; then report distrobox "$(distrobox version 2> /dev/null | head -n 1)" ""; else report distrobox "" "SteamOS 3.5 and later ship it; elsewhere install distrobox and podman"; fi
		report devbox "" "run: make setup (creates the $DEVBOX box)"
	else
		echo "Build libraries${CONTAINER_ID:+ (in the $CONTAINER_ID box)}:"
		linux_check_libs || missing=1
	fi
fi

if [ "$missing" -ne 0 ]; then
	echo
	echo "Something is missing. make setup installs what it can."
	exit 1
fi
echo
echo "Everything is in place."
