# Cargo comes from mise locally; CI sets CARGO=cargo.
CARGO ?= mise exec -- cargo

# Dev server port; give each worktree its own to run them side by side.
PORT ?= 1420

# Process patterns for this checkout only. The leading [/] stops pkill
# matching the shell that runs it.
HERE := [/]$(patsubst /%,%,$(CURDIR))

# A new target that needs gh or claude rather than the build libraries goes in HOST_ONLY below.
.PHONY: help setup doctor dev dev-fg logs stop crash check pr-checks hooks skills skill-try shots fetch build verify-mac clean clean-rust

help: ## List targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-10s %s\n", $$1, $$2}'

setup: ## One-command dev setup: mise, Rust, Node, cmake, gitleaks, npm ci, git hooks; DRY=1 shows the plan
	@scripts/setup.sh $(if $(DRY),--dry-run)

# On SteamOS the build libraries live in the oversay-dev distrobox (scripts/linux.sh). From the
# Deck's own terminal (or with OVERSAY_DEVBOX=1), targets that build or run the app run again
# inside it once make setup has made it; HOST_ONLY ones stay on the host, where gh and claude are.
OVERSAY_BOX :=
FORWARD_GOALS :=
ifeq ($(shell uname -s),Linux)
# make setup installs mise in ~/.local/bin, which may not be on PATH.
export PATH := $(HOME)/.local/bin:$(PATH)
# Only asked when a goal could be forwarded; help, setup and a bare make never are.
ifndef OVERSAY_HOST
ifneq ($(filter-out help setup,$(MAKECMDGOALS)),)
OVERSAY_BOX := $(shell scripts/linux.sh devbox-to-enter 2> /dev/null)
endif
endif
endif

ifneq ($(OVERSAY_BOX),)
HOST_ONLY := crash fetch build skill-try verify-mac clean
FORWARD_GOALS := $(filter-out help setup,$(MAKECMDGOALS))
endif
ifneq ($(FORWARD_GOALS),)
# MAKEFLAGS is cleared for the box: the jobserver's file descriptors don't exist in it.
$(FORWARD_GOALS):
	@$(if $(filter $(HOST_ONLY),$@),$(MAKE) OVERSAY_HOST=1 $@,MAKEFLAGS= distrobox enter $(OVERSAY_BOX) -- make -C '$(CURDIR)' $@ $(MAKEOVERRIDES))
else

doctor: ## Read-only check that every tool development needs is installed; exits 1 if one is missing
	@scripts/doctor.sh

# The Tauri dev command for this checkout's port.
TAURI_DEV = OVERSAY_DEV_PORT=$(PORT) mise exec -- npm run tauri dev -- \
  --config '{"build":{"devUrl":"http://localhost:$(PORT)"}}'

# Refuses to start a second copy, which would also overwrite the running copy's log.
RUNNING_CHECK = if pgrep -f '$(HERE)/app/node_modules/.bin/tauri' > /dev/null; then \
  echo "Already running for this checkout. make stop first (log: out/dev.log)."; exit 1; fi

dev: ## Start the app from source in the background (PORT=1420); log in out/dev.log
	@$(RUNNING_CHECK)
	@mkdir -p out
	@cd app && { [ -d node_modules ] || npm ci; }
	@cd app && nohup sh -c '$(subst ','"'"',$(TAURI_DEV))' > ../out/dev.log 2>&1 < /dev/null &
	@echo "Starting on port $(PORT). make logs to follow it, make stop to stop it. Log: out/dev.log"

dev-fg: ## Run the app from source in this terminal (Ctrl+C stops it); also logs to out/dev.log
	@$(RUNNING_CHECK)
	@mkdir -p out
	@cd app && { [ -d node_modules ] || npm ci; } && $(TAURI_DEV) 2>&1 | tee ../out/dev.log

logs: ## Follow out/dev.log (Ctrl+C stops following, not the app)
	@tail -n 40 -f out/dev.log

# The app's command line is a relative path, so match it by its working
# directory (this checkout's src-tauri) instead.
stop: ## Stop this checkout's dev app and dev server
	@pkill -f '$(HERE)/app/node_modules/.bin/(tauri|vite)' || true
	@for pid in $$(pgrep -x oversay); do \
	  [ "$$(lsof -a -p $$pid -d cwd -Fn | sed -n 's/^n//p')" = "$(CURDIR)/app/src-tauri" ] && kill $$pid; \
	done; true

crash: ## Summarise the newest macOS crash report for the app
	@scripts/last-crash.py

check: ## Run every check CI runs: types, lint, tests, fmt, clippy, Rust dependency audit, window rules, command names, versions
	cd app && { [ -d node_modules ] || npm ci; } && npm run check && npm run lint && npm test
	node scripts/version.mjs --check
	node --test scripts/*.test.mjs
	cd app/src-tauri && $(CARGO) fmt --check && $(CARGO) clippy --all-targets -- -D warnings && $(CARGO) test && $(CARGO) audit
	scripts/check-window-rules.py
	scripts/check-commands.py

# Level two: before a PR is opened or marked ready. A commit's hook sees only that
# commit, so this scans every commit on the branch (one made with --no-verify included).
pr-checks: check ## Level-two checks before a PR: make check, secrets in every commit since main, npm audit
	git fetch -q origin main
	mise exec -- gitleaks git --log-opts="origin/main..HEAD" --redact --no-banner --verbose
	cd app && npm audit --audit-level=moderate
	@echo "Level two passed."

# core.hooksPath lives in the repo's shared config, so this covers every worktree; the
# relative path means each one runs the hooks from its own checkout.
hooks: ## Install the git hooks: every commit is checked for secrets (gitleaks) and linted
	git config core.hooksPath .githooks
	@echo "Hooks installed: each commit is checked for secrets. Emergency skip: git commit --no-verify"

skills: ## Write the Oversay skill's generated parts (format reference, version) from the app's code
	cd app && { [ -d node_modules ] || npm ci; } && UPDATE_SKILL=1 npx vitest run src/lib/notes/skill.test.ts

skill-try: ## Run the skill's prompt fixtures through Claude Code (a paid model run) and check what it made; CASE=<name> for one
	scripts/skill-try.sh $(CASE)

shots: ## Screenshot every manager screen at 1440/1000/720px, light and dark, into out/shots/
	@cd app && { [ -d node_modules ] || npm ci; }
	@node scripts/screenshots.mjs

fetch: ## Download the latest successful CI builds into out/
	@scripts/fetch-builds.sh

build: ## Start a CI build on main, wait for it, then download it into out/
	@scripts/fetch-builds.sh --trigger

verify-mac: ## Check a signed macOS build (app and .dmg): signature, hardened runtime, entitlements, notarization; BUNDLE=<dir> for another folder
	scripts/verify-macos.sh $(BUNDLE)

clean: ## Remove out/
	rm -rf out

# Cargo never deletes old builds, so target/ grows by a full set of dependencies
# each time features, the lock file or the toolchain change.
clean-rust: ## Remove this checkout's Rust build output (app/src-tauri/target); the next build starts from scratch
	@if pgrep -f '$(HERE)/app/node_modules/.bin/tauri' > /dev/null; then \
	  echo "The dev app is running for this checkout. make stop first."; exit 1; fi
	cd app/src-tauri && $(CARGO) clean

endif
