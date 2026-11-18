//! The Oversay skill (skills/oversay, ADR 0031, 0033) installed into AI apps from the AI page
//!. The skill is bundled in the app as a resource, so the copy installed is always the
//! app's own version. Each target is one fixed folder under the person's home; the frontend names
//! a target, never a path.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

/// The AI apps the skill installs into. Same ids as `SKILL_TARGETS` in src/lib/skill/targets.ts;
/// both sides test them.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Target {
    ClaudeCode,
    Codex,
    GeminiCli,
}

impl Target {
    const ALL: [Target; 3] = [Target::ClaudeCode, Target::Codex, Target::GeminiCli];

    /// The app's own folders in the home folder, and its commands: when one is there, the app
    /// looks installed. Antigravity CLI (`agy`) replaced Gemini CLI for personal Google accounts
    /// on 2026-06-18; its folder is `~/.antigravity` in Google's docs.
    fn app_dirs(self, home: &Path) -> Vec<PathBuf> {
        match self {
            Target::ClaudeCode => vec![home.join(".claude")],
            Target::Codex => vec![home.join(".codex")],
            Target::GeminiCli => vec![home.join(".gemini"), home.join(".antigravity")],
        }
    }

    fn commands(self) -> &'static [&'static str] {
        match self {
            Target::ClaudeCode | Target::Codex => &[],
            Target::GeminiCli => &["gemini", "agy"],
        }
    }

    /// Where the app reads personal skills. Codex reads `~/.agents/skills` (its docs, 2026-10-21;
    /// older guides said `~/.codex/skills`), and so does Gemini CLI (an alias of
    /// `~/.gemini/skills`, its docs, 2026-04-30): the two share one copy.
    fn skills_dir(self, home: &Path) -> PathBuf {
        match self {
            Target::ClaudeCode => home.join(".claude").join("skills"),
            Target::Codex | Target::GeminiCli => home.join(".agents").join("skills"),
        }
    }

    fn skill_dir(self, home: &Path) -> PathBuf {
        self.skills_dir(home).join(SKILL_NAME)
    }
}

const SKILL_NAME: &str = "oversay";
/// Written beside SKILL.md: this computer's Oversay folders, which the skill reads first.
const LOCAL_FILE: &str = "oversay-local.json";

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TargetInfo {
    id: Target,
    found: bool,
    dir: String,
    installed_version: Option<String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SkillTargets {
    bundled_version: String,
    bundled_dir: String,
    targets: Vec<TargetInfo>,
    desktop_apps: DesktopApps,
    /// Targets whose copy Oversay updated when it started this time, for the AI page to say.
    updated: Vec<Target>,
}

/// The chat apps' desktop apps found on this computer. The AI page says "No AI apps found"
/// only when none of these and no target is there; it can't see a chat in a browser.
#[derive(Serialize, Debug, PartialEq, Default)]
pub struct DesktopApps {
    claude: bool,
    chatgpt: bool,
    gemini: bool,
}

/// Where each desktop app installs, under `apps` (macOS: /Applications and ~/Applications) or
/// `local` (Windows: %LOCALAPPDATA%). Windows paths are unverified; ChatGPT on Windows comes from
/// the Microsoft Store, whose folder can't be read, so it is never found there.
fn desktop_apps(apps: &[PathBuf], local: Option<&Path>) -> DesktopApps {
    let mac = |name: &str| apps.iter().any(|d| d.join(format!("{name}.app")).is_dir());
    let win = |dir: &str| local.is_some_and(|l| l.join(dir).is_dir());
    DesktopApps {
        claude: mac("Claude") || win("AnthropicClaude"),
        chatgpt: mac("ChatGPT"),
        gemini: mac("Gemini"),
    }
}

fn home(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .home_dir()
        .map_err(|e| format!("Could not find your home folder: {e}"))
}

fn bundled(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .resolve("skills/oversay", BaseDirectory::Resource)
        .map_err(|e| format!("Could not find the skill in Oversay: {e}"))?;
    if dir.join("SKILL.md").is_file() {
        Ok(dir)
    } else {
        Err(format!(
            "The skill is missing from Oversay ({})",
            dir.display()
        ))
    }
}

/// The `metadata.version` line of a skill's SKILL.md.
fn version_in(skill: &str) -> Option<String> {
    skill
        .lines()
        .find_map(|l| l.strip_prefix("  version: "))
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
}

fn installed_version(dir: &Path) -> Option<String> {
    version_in(&fs::read_to_string(dir.join("SKILL.md")).ok()?)
}

/// Whether one of `names` is a file in a folder on `path` (the PATH variable's value).
fn on_path(path: Option<&std::ffi::OsStr>, names: &[&str]) -> bool {
    let Some(path) = path else { return false };
    std::env::split_paths(path).any(|dir| {
        names.iter().any(|n| {
            dir.join(n).is_file()
                || dir.join(format!("{n}.exe")).is_file()
                || dir.join(format!("{n}.cmd")).is_file()
        })
    })
}

fn info(home: &Path, target: Target) -> TargetInfo {
    let dir = target.skill_dir(home);
    TargetInfo {
        id: target,
        found: target.app_dirs(home).iter().any(|d| d.is_dir())
            || on_path(std::env::var_os("PATH").as_deref(), target.commands()),
        installed_version: installed_version(&dir),
        dir: dir.display().to_string(),
    }
}

fn copy_dir(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let path = entry.path();
        if entry.file_type()?.is_dir() {
            copy_dir(&path, &to.join(entry.file_name()))?;
        } else {
            fs::copy(&path, to.join(entry.file_name()))?;
        }
    }
    Ok(())
}

/// Puts a fresh copy of `skill` at `dest` with `local` beside SKILL.md. It is copied next to
/// `dest` first; any copy already at `dest` goes to the Trash only once the new one is complete,
/// so a failure leaves the old copy as it was.
fn install_into(skill: &Path, dest: &Path, local: &str) -> Result<(), String> {
    let parent = dest.parent().ok_or("No folder to install into")?;
    let staging = parent.join(format!(".{SKILL_NAME}.installing"));
    let _ = fs::remove_dir_all(&staging);
    let staged =
        copy_dir(skill, &staging).and_then(|()| fs::write(staging.join(LOCAL_FILE), local));
    if let Err(e) = staged {
        let _ = fs::remove_dir_all(&staging);
        return Err(format!(
            "Could not copy the skill into {}: {e}",
            parent.display()
        ));
    }
    if dest.exists()
        && let Err(e) = trash::delete(dest)
    {
        let _ = fs::remove_dir_all(&staging);
        return Err(format!("Could not move the old copy to the Trash: {e}"));
    }
    fs::rename(&staging, dest)
        .map_err(|e| format!("Could not put the skill in {}: {e}", dest.display()))
}

#[tauri::command]
pub fn skill_targets(app: AppHandle) -> Result<SkillTargets, String> {
    let home = home(&app)?;
    let skill = bundled(&app)?;
    Ok(SkillTargets {
        bundled_version: installed_version(&skill).unwrap_or_default(),
        bundled_dir: skill.display().to_string(),
        targets: Target::ALL.iter().map(|&t| info(&home, t)).collect(),
        desktop_apps: desktop_apps(
            &[PathBuf::from("/Applications"), home.join("Applications")],
            std::env::var_os("LOCALAPPDATA").as_deref().map(Path::new),
        ),
        updated: UPDATED.lock().map(|u| u.clone()).unwrap_or_default(),
    })
}

/// The `oversay-local.json` an install writes: this computer's folders and the app itself.
fn local_json(app: &AppHandle) -> Result<String, String> {
    let local = serde_json::json!({
        // Notes and quick talks are decks: the skill writes only there.
        "decks": crate::quick::folder(app, "decks")?,
        // Workspaces, which list decks by id (ADR 0040).
        "workspaces": crate::workspaces::folder(app)?,
        "app": app.package_info().version.to_string(),
        // The app itself, for `--check` on a note or quick talk the skill wrote (check.rs).
        "oversay": std::env::current_exe().map(|p| p.display().to_string()).unwrap_or_default(),
    });
    Ok(serde_json::to_string_pretty(&local).unwrap_or_default())
}

/// `a` is an older `X.Y.Z` version than `b`; anything unreadable counts as oldest, as
/// compareVersions in targets.ts.
fn older(a: &str, b: &str) -> bool {
    let parts = |v: &str| -> Vec<i64> {
        let p: Vec<i64> = v.split('.').filter_map(|n| n.parse().ok()).collect();
        if p.len() == 3 && v.split('.').count() == 3 {
            p
        } else {
            vec![-1, -1, -1]
        }
    };
    parts(a) < parts(b)
}

static UPDATED: std::sync::Mutex<Vec<Target>> = std::sync::Mutex::new(Vec::new());

/// The copies to update in `home`: each folder (Codex and Gemini CLI share one) holding a copy
/// Oversay installed (it has `oversay-local.json`) that is older than `bundled_version`, with
/// the targets reading it. A copy put there by hand is left for the AI page's Update.
fn stale_copies(home: &Path, bundled_version: &str) -> Vec<(PathBuf, Vec<Target>)> {
    let mut copies: Vec<(PathBuf, Vec<Target>)> = Vec::new();
    for t in Target::ALL {
        let dir = t.skill_dir(home);
        let stale = dir.join(LOCAL_FILE).is_file()
            && installed_version(&dir).is_some_and(|v| older(&v, bundled_version));
        if !stale {
            continue;
        }
        match copies.iter_mut().find(|(d, _)| *d == dir) {
            Some((_, targets)) => targets.push(t),
            None => copies.push((dir, vec![t])),
        }
    }
    copies
}

/// When Oversay starts on a newer version than the skill it installed, it updates those
/// copies itself: they are Oversay's own files, and an old copy would write notes the old way.
/// The old copy goes to the Trash. Runs off the main thread; the AI page says what it did.
pub fn update_installed(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        let (Ok(home), Ok(skill)) = (home(&app), bundled(&app)) else {
            return;
        };
        let Some(version) = installed_version(&skill) else {
            return;
        };
        for (dir, targets) in stale_copies(&home, &version) {
            match local_json(&app).and_then(|local| install_into(&skill, &dir, &local)) {
                Ok(()) => {
                    log::info!("skill updated to {version} for {targets:?}");
                    if let Ok(mut updated) = UPDATED.lock() {
                        updated.extend(targets);
                    }
                }
                Err(e) => log::warn!("skill not updated for {targets:?}: {e}"),
            }
        }
    });
}

/// Installs (or replaces, after the page asked) the skill for `target`; returns where it went.
#[tauri::command]
pub async fn install_skill(app: AppHandle, target: Target) -> Result<String, String> {
    let dest = target.skill_dir(&home(&app)?);
    install_into(&bundled(&app)?, &dest, &local_json(&app)?)?;
    log::info!("skill installed for {target:?}");
    Ok(dest.display().to_string())
}

/// Moves `target`'s copy of the skill to the Trash.
#[tauri::command]
pub async fn remove_skill(app: AppHandle, target: Target) -> Result<(), String> {
    let dir = target.skill_dir(&home(&app)?);
    if dir.exists() {
        trash::delete(&dir)
            .map_err(|e| format!("Could not move {} to the Trash: {e}", dir.display()))?;
    }
    log::info!("skill removed for {target:?}");
    Ok(())
}

/// Shows `target`'s copy in Finder or Explorer.
#[tauri::command]
pub fn reveal_skill(app: AppHandle, target: Target) -> Result<(), String> {
    let file = target.skill_dir(&home(&app)?).join("SKILL.md");
    tauri_plugin_opener::reveal_item_in_dir(&file)
        .map_err(|e| format!("Could not show {}: {e}", file.display()))
}

// ---- saving the skill to upload (task 154, task 204)

/// What Save… writes. Same names as `ZIP_KINDS` in src/lib/skill/targets.ts; both sides test them.
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ZipKind {
    /// A Claude plugin: Customize › Plugins › Upload plugin, in claude.ai and the desktop app; it
    /// reaches chat, Cowork and Claude Code through the account. Customize › Skills refuses it.
    ClaudePlugin,
    /// The skill alone, its folder at the top: Customize › Skills › Upload a skill in claude.ai and
    /// the desktop app, the Gemini app, or ChatGPT.
    Skill,
}

/// Every file of the skill under `dir`, as (path inside the zip, contents), in a stable order.
fn skill_files(dir: &Path, prefix: &str) -> std::io::Result<Vec<(String, Vec<u8>)>> {
    let mut files = Vec::new();
    let mut entries: Vec<_> = fs::read_dir(dir)?.filter_map(Result::ok).collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let name = entry.file_name().to_string_lossy().into_owned();
        // This computer's folders stay on this computer.
        if name.starts_with('.') || name == LOCAL_FILE {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            files.extend(skill_files(&path, &format!("{prefix}{name}/"))?);
        } else {
            files.push((format!("{prefix}{name}"), fs::read(&path)?));
        }
    }
    Ok(files)
}

/// The files of `kind`'s zip.
fn zip_files(
    skill: &Path,
    kind: ZipKind,
    version: &str,
) -> std::io::Result<Vec<(String, Vec<u8>)>> {
    Ok(match kind {
        ZipKind::Skill => skill_files(skill, &format!("{SKILL_NAME}/"))?,
        ZipKind::ClaudePlugin => {
            // The same file scripts/skill-package.mjs makes the repository's plugin from, so the
            // two manifests differ only in what this adds: the version.
            let mut manifest: serde_json::Value =
                serde_json::from_str(include_str!("../../../skills/plugin-manifest.json"))
                    .unwrap_or_default();
            manifest["version"] = serde_json::Value::from(version);
            let mut files = vec![
                (
                    ".claude-plugin/plugin.json".to_string(),
                    serde_json::to_vec_pretty(&manifest).unwrap_or_default(),
                ),
                // The app's own icon, which the Plugins page shows.
                (
                    ".claude-plugin/icon.png".to_string(),
                    include_bytes!("../icons/icon.png").to_vec(),
                ),
            ];
            files.extend(skill_files(skill, &format!("skills/{SKILL_NAME}/"))?);
            files
        }
    })
}

fn write_zip(path: &Path, files: &[(String, Vec<u8>)]) -> Result<(), String> {
    use std::io::Write;
    let fail = |e: &dyn std::fmt::Display| format!("Could not save {}: {e}", path.display());
    let mut zip = zip::ZipWriter::new(fs::File::create(path).map_err(|e| fail(&e))?);
    let options = zip::write::SimpleFileOptions::default();
    for (name, contents) in files {
        zip.start_file(name.as_str(), options)
            .map_err(|e| fail(&e))?;
        zip.write_all(contents).map_err(|e| fail(&e))?;
    }
    zip.finish().map_err(|e| fail(&e))?;
    Ok(())
}

/// The two files a tagged release carries (ADR 0048), named as the AI page's Save… buttons name them.
const SKILL_ZIP: &str = "oversay-skill.zip";
const PLUGIN_ZIP: &str = "oversay-plugin.zip";

/// Writes both zips of the skill folder `skill` into `out`, the same files the app saves.
fn package_to(skill: &Path, out: &Path, version: &str) -> Result<(), String> {
    fs::create_dir_all(out).map_err(|e| format!("Could not make {}: {e}", out.display()))?;
    for (file, kind) in [
        (SKILL_ZIP, ZipKind::Skill),
        (PLUGIN_ZIP, ZipKind::ClaudePlugin),
    ] {
        let files = zip_files(skill, kind, version)
            .map_err(|e| format!("Could not read the skill {}: {e}", skill.display()))?;
        write_zip(&out.join(file), &files)?;
    }
    Ok(())
}

/// Runs `--package-skill <skill folder> <out folder>` when the app was started with it, so the
/// release job makes its zips with the code that makes the app's: the exit code, or None to go on.
pub fn package_from_args() -> Option<i32> {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) != Some("--package-skill") {
        return None;
    }
    crate::platform::attach_console();
    let (Some(skill), Some(out)) = (args.get(2), args.get(3)) else {
        eprintln!("Usage: Oversay --package-skill <skill folder> <out folder>");
        return Some(2);
    };
    match package_to(Path::new(skill), Path::new(out), env!("CARGO_PKG_VERSION")) {
        Ok(()) => {
            println!("Wrote {SKILL_ZIP} and {PLUGIN_ZIP} in {out}");
            Some(0)
        }
        Err(e) => {
            eprintln!("{e}");
            Some(1)
        }
    }
}

/// Saves the skill as `kind` at `path` (from the save dialog) and shows it in Finder or Explorer.
#[tauri::command]
pub async fn save_skill_zip(app: AppHandle, kind: ZipKind, path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if path.extension().and_then(|e| e.to_str()) != Some("zip") {
        return Err("Save it as a .zip file.".into());
    }
    let version = app.package_info().version.to_string();
    let files = zip_files(&bundled(&app)?, kind, &version)
        .map_err(|e| format!("Could not read the skill: {e}"))?;
    write_zip(&path, &files)?;
    log::info!("skill saved as {kind:?}");
    let _ = tauri_plugin_opener::reveal_item_in_dir(&path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("oversay-skill-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// The real skill in this repository, as the bundle carries it.
    fn source() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../skills/oversay")
    }

    #[test]
    fn finds_desktop_apps_where_they_install() {
        let root = temp_dir("desktop");
        let (apps, local) = (root.join("Applications"), root.join("Local"));
        fs::create_dir_all(apps.join("ChatGPT.app")).unwrap();
        fs::create_dir_all(local.join("AnthropicClaude")).unwrap();
        fs::create_dir_all(apps.join("Gemini")).unwrap(); // not an app bundle
        assert_eq!(
            desktop_apps(std::slice::from_ref(&apps), Some(&local)),
            DesktopApps {
                claude: true,
                chatgpt: true,
                gemini: false
            }
        );
        assert_eq!(desktop_apps(&[], None), DesktopApps::default());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn gemini_cli_shares_codexs_copy_and_is_found_by_its_commands() {
        let home = Path::new("/h");
        assert_eq!(
            Target::GeminiCli.skill_dir(home),
            Target::Codex.skill_dir(home)
        );
        let bin = temp_dir("path");
        fs::write(bin.join("agy"), "").unwrap();
        let path = std::env::join_paths([Path::new("/nowhere"), bin.as_path()]).unwrap();
        assert!(on_path(Some(&path), Target::GeminiCli.commands()));
        assert!(!on_path(Some(&path), Target::Codex.commands()));
        assert!(!on_path(None, &["agy"]));
        fs::remove_dir_all(bin).unwrap();
    }

    #[test]
    fn targets_have_the_frontends_ids() {
        let ids: Vec<String> = Target::ALL
            .iter()
            .map(|t| {
                serde_json::to_value(t)
                    .unwrap()
                    .as_str()
                    .unwrap()
                    .to_string()
            })
            .collect();
        assert_eq!(ids, ["claude-code", "codex", "gemini-cli"]);
    }

    #[test]
    fn reads_the_skills_version_as_make_skills_writes_it() {
        assert_eq!(
            version_in("---\nname: oversay\nmetadata:\n  version: 0.2.0\n---\n"),
            Some("0.2.0".into())
        );
        assert_eq!(version_in("---\nname: oversay\n---\n"), None);
        let app_version = env!("CARGO_PKG_VERSION");
        assert_eq!(
            installed_version(&source()).as_deref(),
            Some(app_version),
            "skills/oversay: run make skills"
        );
    }

    #[test]
    fn each_target_has_its_own_fixed_folder() {
        let home = Path::new("/h");
        assert_eq!(
            Target::ClaudeCode.skill_dir(home),
            Path::new("/h/.claude/skills/oversay")
        );
        assert_eq!(
            Target::Codex.skill_dir(home),
            Path::new("/h/.agents/skills/oversay")
        );
        assert_eq!(Target::Codex.app_dirs(home), [Path::new("/h/.codex")]);
    }

    #[test]
    fn installs_a_full_copy_with_this_computers_folders() {
        let home = temp_dir("install");
        let dest = Target::ClaudeCode.skill_dir(&home);
        fs::create_dir_all(dest.parent().unwrap()).unwrap();
        install_into(&source(), &dest, "{\"notes\": \"/n\"}").unwrap();
        assert!(dest.join("SKILL.md").is_file());
        assert!(dest.join("references").join("note-format.md").is_file());
        assert_eq!(
            fs::read_to_string(dest.join(LOCAL_FILE)).unwrap(),
            "{\"notes\": \"/n\"}"
        );
        assert!(!dest.parent().unwrap().join(".oversay.installing").exists());
        let found = info(&home, Target::ClaudeCode);
        assert_eq!(found.installed_version, installed_version(&source()));
        assert!(found.found, "~/.claude exists once the skill is in it");
        fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn a_failed_copy_leaves_the_old_one() {
        let home = temp_dir("failed");
        let dest = Target::Codex.skill_dir(&home);
        fs::create_dir_all(&dest).unwrap();
        fs::write(dest.join("SKILL.md"), "old").unwrap();
        assert!(install_into(&home.join("no-such-skill"), &dest, "{}").is_err());
        assert_eq!(fs::read_to_string(dest.join("SKILL.md")).unwrap(), "old");
        fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn zip_kinds_have_the_frontends_names() {
        let kind: ZipKind = serde_json::from_str("\"claude-plugin\"").unwrap();
        assert_eq!(kind, ZipKind::ClaudePlugin);
        let kind: ZipKind = serde_json::from_str("\"skill\"").unwrap();
        assert_eq!(kind, ZipKind::Skill);
    }

    #[test]
    fn a_plugin_holds_its_manifest_and_the_skill_without_this_computers_folders() {
        let dir = temp_dir("zipsrc");
        copy_dir(&source(), &dir).unwrap();
        fs::write(dir.join(LOCAL_FILE), "{}").unwrap();
        let names = |kind| -> Vec<String> {
            zip_files(&dir, kind, "0.2.0")
                .unwrap()
                .into_iter()
                .map(|(n, _)| n)
                .collect()
        };
        let plugin = names(ZipKind::ClaudePlugin);
        assert_eq!(plugin[0], ".claude-plugin/plugin.json");
        assert!(plugin.contains(&"skills/oversay/SKILL.md".to_string()));
        assert!(plugin.contains(&"skills/oversay/references/note-format.md".to_string()));
        let skill = names(ZipKind::Skill);
        assert!(skill.contains(&"oversay/SKILL.md".to_string()));
        assert!(
            skill
                .iter()
                .chain(&plugin)
                .all(|n| !n.ends_with(LOCAL_FILE))
        );
        let manifest: serde_json::Value =
            serde_json::from_slice(&zip_files(&dir, ZipKind::ClaudePlugin, "0.2.0").unwrap()[0].1)
                .unwrap();
        assert_eq!(manifest["name"], "oversay");
        assert_eq!(manifest["version"], "0.2.0");
        // Everything else is the shared manifest the repository's plugin is made from.
        let shared: serde_json::Value = serde_json::from_str(
            &fs::read_to_string(source().join("../plugin-manifest.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(manifest["description"], shared["description"]);
        assert_eq!(manifest["author"], shared["author"]);
        // A real archive that reads back with the same files.
        let zip = dir.join("out.zip");
        write_zip(
            &zip,
            &zip_files(&dir, ZipKind::ClaudePlugin, "0.2.0").unwrap(),
        )
        .unwrap();
        let mut archive = zip::ZipArchive::new(fs::File::open(&zip).unwrap()).unwrap();
        let mut read: Vec<String> = archive
            .file_names()
            .map(|n| n.unwrap().into_owned())
            .collect();
        read.sort();
        let mut want = plugin.clone();
        want.push(".claude-plugin/icon.png".into());
        want.sort();
        want.dedup();
        assert_eq!(read, want);
        assert!(archive.by_name("skills/oversay/SKILL.md").unwrap().size() > 100);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_release_gets_the_same_two_zips_the_app_saves() {
        let out = temp_dir("release-zips");
        package_to(&source(), &out, "0.4.0").unwrap();
        for (file, kind) in [
            (SKILL_ZIP, ZipKind::Skill),
            (PLUGIN_ZIP, ZipKind::ClaudePlugin),
        ] {
            let archive = zip::ZipArchive::new(fs::File::open(out.join(file)).unwrap()).unwrap();
            let mut read: Vec<String> = archive
                .file_names()
                .map(|n| n.unwrap().into_owned())
                .collect();
            read.sort();
            let mut want: Vec<String> = zip_files(&source(), kind, "0.4.0")
                .unwrap()
                .into_iter()
                .map(|(n, _)| n)
                .collect();
            want.sort();
            read.dedup();
            want.dedup();
            // The plugin's icon is added when the archive is written.
            read.retain(|n| n != ".claude-plugin/icon.png");
            want.retain(|n| n != ".claude-plugin/icon.png");
            assert_eq!(read, want, "{file}");
        }
        assert!(package_to(&out.join("no-such-skill"), &out, "0.4.0").is_err());
        fs::remove_dir_all(out).unwrap();
    }

    #[test]
    fn a_skill_zip_passes_claudes_upload_rules() {
        // What Customize › Skills › Upload a skill told John (2026-10-22): exactly one top-level
        // folder, SKILL.md directly in it, and no plugin manifest.
        let names: Vec<String> = zip_files(&source(), ZipKind::Skill, "0.2.0")
            .unwrap()
            .into_iter()
            .map(|(n, _)| n)
            .collect();
        let tops: std::collections::BTreeSet<_> =
            names.iter().map(|n| n.split('/').next().unwrap()).collect();
        assert_eq!(tops.into_iter().collect::<Vec<_>>(), vec![SKILL_NAME]);
        assert!(names.contains(&format!("{SKILL_NAME}/SKILL.md")));
        assert!(names.iter().all(|n| !n.contains(".claude-plugin")));
    }

    #[test]
    fn updates_only_older_copies_oversay_installed_once_per_folder() {
        let home = temp_dir("stale");
        let put = |t: Target, version: &str, ours: bool| {
            let dir = t.skill_dir(&home);
            fs::create_dir_all(&dir).unwrap();
            fs::write(
                dir.join("SKILL.md"),
                format!("---\nmetadata:\n  version: {version}\n---\n"),
            )
            .unwrap();
            if ours {
                fs::write(dir.join(LOCAL_FILE), "{}").unwrap();
            }
        };
        put(Target::ClaudeCode, "0.1.0", false); // put there by hand
        put(Target::Codex, "0.1.0", true); // Gemini CLI reads this copy too
        assert_eq!(
            stale_copies(&home, "0.2.0"),
            vec![(
                Target::Codex.skill_dir(&home),
                vec![Target::Codex, Target::GeminiCli]
            )]
        );
        assert!(stale_copies(&home, "0.1.0").is_empty());
        put(Target::ClaudeCode, "0.3.0", true);
        assert_eq!(stale_copies(&home, "0.2.0").len(), 1);
        fs::remove_dir_all(&home).unwrap();
    }

    #[test]
    fn compares_versions_as_the_frontend_does() {
        assert!(older("0.1.0", "0.2.0"));
        assert!(older("0.9.0", "0.10.0"));
        assert!(!older("0.2.0", "0.2.0"));
        assert!(older("nonsense", "0.0.1"));
    }
}
