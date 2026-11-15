#!/usr/bin/env bash
# make setup: one command to get a fresh clone ready for development. Safe to run again.
# Installs mise (Homebrew), then the tools in mise.toml, the app's npm packages and the git
# hooks, and ends with `make doctor`. Never uses sudo and never prints secrets.
#   scripts/setup.sh --dry-run   print what it would do and change nothing
set -euo pipefail
cd "$(dirname "$0")/.." || exit 1

dry=0
case "${1:-}" in
	"") ;;
	--dry-run) dry=1 ;;
	-h | --help) sed -n '2,6p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
	*) echo "Unknown option: $1 (try --dry-run)" >&2; exit 2 ;;
esac

already=()
installed=()
have() { command -v "$1" > /dev/null 2>&1; }
step() { printf '\n==> %s\n' "$*"; }
# Run a command, or only say so in a dry run.
run() {
	if [ "$dry" -eq 1 ]; then printf '    [dry-run] %s\n' "$*"; else "$@"; fi
}
die() { echo "setup: $*" >&2; exit 1; }

[ "$dry" -eq 1 ] && echo "Dry run: nothing will be installed or changed."

step "Platform"
os=$(uname -s)
if [ "$os" != "Darwin" ]; then
	die "this script supports macOS only (found $os). Install mise (https://mise.jdx.dev), then run: mise install && (cd app && npm ci) && make hooks"
fi
echo "    macOS $(sw_vers -productVersion 2> /dev/null || echo '?') on $(uname -m)"
if ! xcode-select -p > /dev/null 2>&1; then
	die "the Xcode command line tools are missing and need you: run 'xcode-select --install', wait for it to finish, then run make setup again."
fi
echo "    Xcode command line tools found"

step "mise"
# Homebrew lives in /opt/homebrew on Apple silicon and /usr/local on Intel, and may not be on PATH.
for b in /opt/homebrew/bin /usr/local/bin; do
	[ -x "$b/brew" ] && ! have brew && PATH="$b:$PATH"
	[ -x "$b/mise" ] && ! have mise && PATH="$b:$PATH"
done
if have mise; then
	echo "    found $(mise --version | head -n 1)"
	already+=("mise")
else
	have brew || die "mise is missing and so is Homebrew. Install Homebrew from https://brew.sh (it asks for your password itself), then run make setup again."
	run brew install mise
	installed+=("mise")
	have mise || [ "$dry" -eq 1 ] || die "mise installed but is not on PATH."
fi

# Shell activation: needed so plain `cargo`, `node` and `gitleaks` resolve in your terminal.
# The Makefile and the hooks go through mise and work without it.
shell_name=$(basename "${SHELL:-zsh}")
# These are text to show the user, not paths or commands to run here.
# shellcheck disable=SC2088,SC2016
case "$shell_name" in
	zsh) rc='~/.zshrc'; line='eval "$(mise activate zsh)"' ;;
	bash) rc='~/.bashrc'; line='eval "$(mise activate bash)"' ;;
	fish) rc='~/.config/fish/config.fish'; line='mise activate fish | source' ;;
	*) rc='your shell startup file'; line='see https://mise.jdx.dev/getting-started.html' ;;
esac
if [ -z "${MISE_SHELL:-}" ]; then
	echo "    mise is not activated in this shell. To use cargo, node and gitleaks directly,"
	echo "    add this line to $rc and open a new terminal:"
	echo "        $line"
fi

step "Tools from mise.toml (rust, node, cmake, gitleaks, cargo-audit)"
# Rust and cargo-audit are built or downloaded; the first run takes several minutes.
if [ "$dry" -eq 1 ] && ! have mise; then
	echo "    [dry-run] mise install   (after mise is installed)"
else
	before=$(mise ls --installed 2> /dev/null | wc -l | tr -d ' ' || echo 0)
	run mise trust --quiet mise.toml
	run mise install
	after=$(mise ls --installed 2> /dev/null | wc -l | tr -d ' ' || echo 0)
	if [ "$dry" -eq 0 ]; then
		if [ "$after" -gt "$before" ]; then installed+=("mise tools ($((after - before)) new)"); else already+=("mise tools"); fi
	fi
fi

step "Node and npm"
if [ "$dry" -eq 0 ]; then
	node_v=$(mise exec -- node --version) || die "node is not available after mise install."
	npm_v=$(mise exec -- npm --version) || die "npm is not available after mise install."
	echo "    node $node_v, npm $npm_v"
else
	echo "    [dry-run] would check node and npm at the version pinned in mise.toml"
fi

step "App dependencies (npm ci in app/)"
if [ -d app/node_modules ] && [ app/node_modules -nt app/package-lock.json ]; then
	echo "    app/node_modules is up to date"
	already+=("app dependencies")
else
	if [ "$dry" -eq 1 ]; then
		echo "    [dry-run] (cd app && mise exec -- npm ci)"
	else
		(cd app && mise exec -- npm ci)
	fi
	installed+=("app dependencies")
fi

step "Git hooks"
case "$(git config core.hooksPath 2> /dev/null || true)" in
.githooks | */.githooks) hooks_set=1 ;;
*) hooks_set=0 ;;
esac
if [ "$hooks_set" -eq 1 ]; then
	echo "    already installed"
	already+=("git hooks")
else
	run make hooks
	installed+=("git hooks")
fi

step "Summary"
echo "    already there: ${already[*]:-nothing}"
echo "    installed:     ${installed[*]:-nothing}"
if [ "$dry" -eq 1 ]; then
	echo "    (dry run: the lists show what a real run would do or find)"
	exit 0
fi

step "make doctor"
scripts/doctor.sh
