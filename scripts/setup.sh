#!/usr/bin/env bash
# make setup: one command to get a fresh clone ready for development. Safe to run again.
# Installs mise (Homebrew on macOS, a pinned download into ~/.local/bin on Linux), then the
# tools in mise.toml, the app's npm packages and the git hooks, and ends with `make doctor`.
# On SteamOS the build libraries go into the oversay-dev distrobox (scripts/linux.sh) and the
# rest runs inside it. Never uses sudo and never prints secrets.
#   scripts/setup.sh --dry-run   print what it would do and change nothing
set -euo pipefail
cd "$(dirname "$0")/.." || exit 1

dry=0
case "${1:-}" in
	"") ;;
	--dry-run) dry=1 ;;
	-h | --help) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
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

# mise for Linux, pinned: a release at least two weeks old, checked against the SHA-256 that
# release published (SHASUMS256.txt). The musl build has no library dependencies.
MISE_VERSION=2026.11.0
mise_sha256() {
	case "$1" in
		x64) echo 4e5a080abe7ad032ad2ce645efa99b3399fd9c8511b7a3bdaaa6f71e545f291a ;;
		arm64) echo f51dc24a295ba281a0fd9626dd8caf2b16d837c4d9be2412d86c933e60c200f8 ;;
	esac
}

# Download mise into ~/.local/bin. Nothing outside $HOME is touched.
install_mise_linux() {
	local arch want tmp got
	case "$(uname -m)" in
		x86_64) arch=x64 ;;
		aarch64 | arm64) arch=arm64 ;;
		*) die "no mise download for $(uname -m). Install mise yourself (https://mise.jdx.dev), then run make setup again." ;;
	esac
	want=$(mise_sha256 "$arch")
	local name="mise-v$MISE_VERSION-linux-$arch-musl.tar.gz"
	if [ "$dry" -eq 1 ]; then
		echo "    [dry-run] download $name from github.com/jdx/mise, check its SHA-256, install it as ~/.local/bin/mise"
		return
	fi
	tmp=$(mktemp -d)
	if ! curl -fsSL -o "$tmp/$name" "https://github.com/jdx/mise/releases/download/v$MISE_VERSION/$name"; then
		rm -rf "$tmp"
		die "could not download mise ($name). Check the network and run make setup again."
	fi
	if have sha256sum; then got=$(sha256sum "$tmp/$name"); else got=$(shasum -a 256 "$tmp/$name"); fi
	if [ "${got%% *}" != "$want" ]; then
		rm -rf "$tmp"
		die "the mise download does not match its pinned SHA-256; nothing was installed."
	fi
	tar -xzf "$tmp/$name" -C "$tmp" mise/bin/mise
	mkdir -p "$HOME/.local/bin"
	install -m 755 "$tmp/mise/bin/mise" "$HOME/.local/bin/mise"
	rm -rf "$tmp"
}

# SteamOS: libraries go into the oversay-dev box, then this script carries on inside it.
setup_devbox() {
	step "Build libraries (the $DEVBOX distrobox; the read-only root is not touched)"
	have distrobox || die "distrobox is missing. SteamOS 3.5 and later ship it; elsewhere install distrobox and podman, then run make setup again."
	local tool
	tool=$(linux_container_tool) || die "distrobox needs podman or docker, and neither is on PATH."
	if linux_devbox_exists; then
		echo "    found the $DEVBOX box"
		already+=("$DEVBOX box")
	else
		run distrobox create --yes --no-entry --name "$DEVBOX" --image "$DEVBOX_IMAGE"
		installed+=("$DEVBOX box")
		if [ "$dry" -eq 1 ]; then
			echo "    [dry-run] install in the box: $(echo "$LINUX_DEPS" | awk 'NF { print $3 }' | awk '!seen[$0]++' | tr '\n' ' ')"
			echo "    [dry-run] continue inside the box: tools from mise.toml, npm ci, git hooks, make doctor"
			summary
			exit 0
		fi
		echo "    first start of the box (a few minutes)"
		distrobox enter "$DEVBOX" -- true
	fi
	local pkgs
	pkgs=$(distrobox enter "$DEVBOX" -- "$PWD/scripts/linux.sh" missing-packages | tr -d '\r' | tail -n 1) ||
		die "could not run a command in the $DEVBOX box. Try: distrobox enter $DEVBOX (or distrobox rm $DEVBOX, then make setup)."
	if [ -z "$pkgs" ]; then
		echo "    every library is in the box"
		already+=("build libraries")
	else
		echo "    missing in the box: $pkgs"
		# As the container's root: the packages land in the box, not on the host.
		# shellcheck disable=SC2086  # one word per package
		run "$tool" exec --user root "$DEVBOX" sh -c 'apt-get update -q && DEBIAN_FRONTEND=noninteractive apt-get install -y -q "$@"' sh $pkgs
		installed+=("build libraries")
	fi
	summary
	step "Continuing inside the $DEVBOX box"
	exec distrobox enter "$DEVBOX" -- "$PWD/scripts/setup.sh" "$@"
}

summary() {
	step "Summary"
	echo "    already there: ${already[*]:-nothing}"
	echo "    installed:     ${installed[*]:-nothing}"
	if [ "$dry" -eq 1 ]; then echo "    (dry run: the lists show what a real run would do or find)"; fi
}

step "Platform"
os=$(uname -s)
case "$os" in
	Darwin)
		echo "    macOS $(sw_vers -productVersion 2> /dev/null || echo '?') on $(uname -m)"
		if ! xcode-select -p > /dev/null 2>&1; then
			die "the Xcode command line tools are missing and need you: run 'xcode-select --install', wait for it to finish, then run make setup again."
		fi
		echo "    Xcode command line tools found"
		;;
	Linux)
		# shellcheck source=linux.sh
		. scripts/linux.sh
		echo "    Linux ($(linux_os_id || echo '?')) on $(uname -m)$(if linux_in_container; then echo ", in the container ${CONTAINER_ID:-?}"; fi)"
		if linux_devbox_route; then
			echo "    the build libraries live in the $DEVBOX distrobox"
		else
			step "Build libraries"
			if linux_check_libs; then
				already+=("build libraries")
			elif [ "$dry" -eq 1 ]; then
				echo "    (a real run stops here until the missing ones are installed)"
			else
				die "install the missing libraries above (this script never uses sudo), then run make setup again."
			fi
		fi
		;;
	*) die "this script supports macOS and Linux (found $os). Install mise (https://mise.jdx.dev), then run: mise install && (cd app && npm ci) && make hooks" ;;
esac

step "mise"
if [ "$os" = "Darwin" ]; then
	# Homebrew lives in /opt/homebrew on Apple silicon and /usr/local on Intel, and may not be on PATH.
	for b in /opt/homebrew/bin /usr/local/bin; do
		[ -x "$b/brew" ] && ! have brew && PATH="$b:$PATH"
		[ -x "$b/mise" ] && ! have mise && PATH="$b:$PATH"
	done
else
	[ -x "$HOME/.local/bin/mise" ] && ! have mise && PATH="$HOME/.local/bin:$PATH"
fi
if have mise; then
	echo "    found $(mise --version | head -n 1)"
	already+=("mise")
elif [ "$os" = "Darwin" ]; then
	have brew || die "mise is missing and so is Homebrew. Install Homebrew from https://brew.sh (it asks for your password itself), then run make setup again."
	run brew install mise
	installed+=("mise")
	have mise || [ "$dry" -eq 1 ] || die "mise installed but is not on PATH."
else
	install_mise_linux
	PATH="$HOME/.local/bin:$PATH"
	installed+=("mise")
	have mise || [ "$dry" -eq 1 ] || die "mise installed but is not on PATH."
fi

# Shell activation: needed so plain `cargo`, `node` and `gitleaks` resolve in your terminal.
# The Makefile and the hooks go through mise and work without it.
shell_name=$(basename "${SHELL:-zsh}")
# These are text to show the user, not paths or commands to run here.
mise_word=mise
# shellcheck disable=SC2088
[ "$os" = "Linux" ] && [ "$(command -v mise || echo "$HOME/.local/bin/mise")" = "$HOME/.local/bin/mise" ] && mise_word='~/.local/bin/mise'
# shellcheck disable=SC2088
case "$shell_name" in
	zsh) rc='~/.zshrc'; line="eval \"\$($mise_word activate zsh)\"" ;;
	bash) rc='~/.bashrc'; line="eval \"\$($mise_word activate bash)\"" ;;
	fish) rc='~/.config/fish/config.fish'; line="$mise_word activate fish | source" ;;
	*) rc='your shell startup file'; line='see https://mise.jdx.dev/getting-started.html' ;;
esac
# Inside the box this was already said on the host, and ~/.bashrc is shared.
if [ -z "${MISE_SHELL:-}" ] && { [ -z "${DEVBOX:-}" ] || [ "${CONTAINER_ID:-}" != "$DEVBOX" ]; }; then
	echo "    mise is not activated in this shell. To use cargo, node and gitleaks directly,"
	echo "    add this line to $rc and open a new terminal:"
	echo "        $line"
fi

if [ "$os" = "Linux" ] && linux_devbox_route; then
	setup_devbox "$@"
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

summary
[ "$dry" -eq 1 ] && exit 0

step "make doctor"
scripts/doctor.sh
