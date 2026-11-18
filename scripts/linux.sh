#!/usr/bin/env bash
# Linux development setup: what the build needs from the system, and the oversay-dev box.
# On SteamOS (the Steam Deck) the root filesystem is read-only and there is no sudo, so the
# build libraries live in a distrobox, oversay-dev, which shares $HOME and the desktop session.
# make setup creates it; the Makefile runs every other target inside it. Elsewhere on Linux the
# libraries come from the system (or from the box with OVERSAY_DEVBOX=1).
# Sourced by setup.sh and doctor.sh; run directly for the Makefile and the box:
#   scripts/linux.sh devbox-to-enter    print the box's name when make should run inside it
#   scripts/linux.sh check-libs         list each library as ok or MISSING; exits 1 if one is
#   scripts/linux.sh missing-packages   print the Ubuntu packages that would supply the missing ones

DEVBOX=oversay-dev
# Ubuntu 24.04 as on CI's ubuntu-latest, so the package names below are the ones CI installs.
# The toolbx image carries what distrobox needs. Pinned to the release, not a digest: the
# registry drops old digests once the tag moves, and apt keeps the packages current.
# shellcheck disable=SC2034  # used by setup.sh, which sources this file
DEVBOX_IMAGE=quay.io/toolbx/ubuntu-toolbox:24.04

# What the build needs from the system: name | how to find it | Ubuntu package.
#   cmd:X  a command on PATH;  pc:X  a pkg-config module;  lib:RE  a library in the linker cache.
# The libraries match CI's list (.github/workflows/build.yml); libclang is for whisper.cpp's
# bindings (bindgen), lsof and procps for make stop.
LINUX_DEPS='
cc            cmd:cc                          build-essential
make          cmd:make                        build-essential
pkg-config    cmd:pkg-config                  pkg-config
git           cmd:git                         git
curl          cmd:curl                        curl
lsof          cmd:lsof                        lsof
pgrep         cmd:pgrep                       procps
webkit2gtk    pc:webkit2gtk-4.1               libwebkit2gtk-4.1-dev
appindicator  pc:ayatana-appindicator3-0.1    libayatana-appindicator3-dev
librsvg       pc:librsvg-2.0                  librsvg2-dev
alsa          pc:alsa                         libasound2-dev
openssl       pc:openssl                      libssl-dev
libxdo        lib:libxdo\.so[[:space:]]       libxdo-dev
libclang      lib:libclang(-[0-9.]+)?\.so     libclang-dev
'

linux_have() { command -v "$1" > /dev/null 2>&1; }

# make setup installs mise in ~/.local/bin, which may not be on PATH.
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) PATH="$HOME/.local/bin:$PATH" ;; esac

# Inside any container (distrobox sets CONTAINER_ID to the box's name; podman and docker leave a file).
linux_in_container() { [ -n "${CONTAINER_ID:-}" ] || [ -e /run/.containerenv ] || [ -e /.dockerenv ]; }

linux_os_id() {
	local f=${OVERSAY_OS_RELEASE:-/etc/os-release}
	[ -r "$f" ] && sed -n 's/^ID=//p' "$f" | tr -d '"' | head -n 1
}

# This host keeps the build libraries in the box: SteamOS, or anyone who asks for it.
linux_devbox_route() {
	[ "$(uname -s)" = "Linux" ] || return 1
	linux_in_container && return 1
	[ "${OVERSAY_DEVBOX:-}" = "1" ] || [ "$(linux_os_id)" = "steamos" ]
}

# The container tool distrobox uses; the box is a container of the same name.
linux_container_tool() {
	if linux_have podman; then echo podman; elif linux_have docker; then echo docker; else return 1; fi
}

# Asks the container tool directly: quicker than distrobox list, and make asks on every run.
linux_devbox_exists() {
	local tool
	linux_have distrobox && tool=$(linux_container_tool) && "$tool" container inspect "$DEVBOX" > /dev/null 2>&1
}

linux_ldcache() {
	if linux_have ldconfig; then ldconfig -p; elif [ -x /sbin/ldconfig ]; then /sbin/ldconfig -p; fi 2> /dev/null
}

# Prints "name|found-or-empty|package" for each dependency. Safe under set -e and pipefail,
# which setup.sh uses: a lookup that finds nothing must not end the scan. Not a tab: read collapses empty
# fields between whitespace separators.
linux_scan() {
	local cache name how pkg what found
	cache=$(linux_ldcache)
	while read -r name how pkg; do
		[ -n "$name" ] || continue
		what=${how#*:}
		found=""
		case "$how" in
			cmd:*) found=$(command -v "$what") || found="" ;;
			pc:*) found=$(pkg-config --modversion "$what" 2> /dev/null) || found="" ;;
			lib:*) found=$(printf '%s\n' "$cache" | grep -oE "$what" | head -n 1 | tr -d '[:space:]') || found="" ;;
		esac
		printf '%s|%s|%s\n' "$name" "$found" "$pkg"
	done <<< "$LINUX_DEPS"
}

# The Ubuntu packages, once each, from "name|found|package" lines on stdin.
linux_packages_of() { awk -F'|' '!seen[$3]++ { printf "%s%s", sep, $3; sep = " " }'; }

linux_all_packages() { echo "$LINUX_DEPS" | awk 'NF { print $1 "||" $3 }' | linux_packages_of; }

linux_missing_packages() { linux_scan | awk -F'|' '$2 == ""' | linux_packages_of; }

# The command that installs a missing package, for this host.
linux_fix_hint() { # package
	if [ "${CONTAINER_ID:-}" = "$DEVBOX" ]; then
		echo "run: make setup from the Deck's own terminal, not inside the box (installs $1 in it)"
	elif linux_devbox_route; then
		echo "run: make setup (installs $1 in the $DEVBOX box)"
	elif linux_have apt-get; then
		echo "run: sudo apt-get install $1"
	else
		echo "install your distribution's package for $1 (Ubuntu's name), or: OVERSAY_DEVBOX=1 make setup"
	fi
}

linux_check_libs() {
	local name found pkg missing=0
	while IFS='|' read -r name found pkg; do
		if [ -n "$found" ]; then
			printf '  ok       %-12s %s\n' "$name" "$found"
		else
			printf '  MISSING  %-12s %s\n' "$name" "$(linux_fix_hint "$pkg")"
			missing=1
		fi
	done < <(linux_scan)
	return "$missing"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
	set -u
	case "${1:-}" in
		devbox-to-enter) if linux_devbox_route && linux_devbox_exists; then echo "$DEVBOX"; fi ;;
		check-libs) linux_check_libs ;;
		missing-packages) linux_missing_packages; echo ;;
		*) awk 'NR > 1 && !/^#/ { exit } NR > 1 { sub(/^# ?/, ""); print }' "$0"; exit 2 ;;
	esac
fi
