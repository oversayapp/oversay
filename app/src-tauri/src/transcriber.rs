//! Speech to text on the device (ADR 0041, spec §11): a session's recording becomes timed
//! lines with Whisper (`whisper.cpp`, through whisper-rs), the same on a Mac and Windows. Nothing
//! leaves the computer. Whisper's model, `ggml-small.en-q5_1` (John, 28 Oct), is downloaded once,
//! after the person says yes, from the whisper.cpp project on Hugging Face into the app's data
//! folder, and is used only if its size and SHA-256 are the ones written here. The lines go back to
//! the session's page, which splits them by card as it does a call's transcript.

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};

use crate::quick::deck_folder;
use crate::session_files::{SessionFile, file_in};

pub const MODEL_NAME: &str = "ggml-small.en-q5_1.bin";
const MODEL_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en-q5_1.bin";
/// The model's size and SHA-256, as Hugging Face lists them (28 Oct 2026).
pub const MODEL_BYTES: u64 = 190_098_681;
const MODEL_SHA256: &str = "bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30";

/// Sent while the model downloads: `{ received, total }` in bytes.
pub const MODEL_EVENT: &str = "speech-model";
/// Sent while a recording is transcribed: `{ deck, name, percent }`.
pub const TRANSCRIBING_EVENT: &str = "transcribing";

/// Whisper wants 16 kHz mono.
const WHISPER_RATE: u32 = 16_000;

static DOWNLOADING: AtomicBool = AtomicBool::new(false);

fn model_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("models").join(MODEL_NAME))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechModel {
    present: bool,
    bytes: u64,
    from: &'static str,
}

/// Whether the model is here, and what downloading it means: its size and where it comes from.
#[tauri::command]
pub async fn speech_model(app: AppHandle) -> Result<SpeechModel, String> {
    let present = fs::metadata(model_path(&app)?).is_ok_and(|m| m.len() == MODEL_BYTES);
    Ok(SpeechModel {
        present,
        bytes: MODEL_BYTES,
        from: "huggingface.co/ggerganov/whisper.cpp",
    })
}

/// Whether `file` is `bytes` long with the SHA-256 `sha256`.
fn verified(file: &Path, bytes: u64, sha256: &str) -> Result<bool, String> {
    let mut f = fs::File::open(file).map_err(|e| e.to_string())?;
    if f.metadata().map_err(|e| e.to_string())?.len() != bytes {
        return Ok(false);
    }
    let mut hash = Sha256::new();
    let mut buf = vec![0u8; 1 << 16];
    loop {
        let n = f.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hash.update(&buf[..n]);
    }
    let hex: String = hash.finalize().iter().map(|b| format!("{b:02x}")).collect();
    Ok(hex == sha256)
}

/// Downloads the model, once; the person has said yes on the session's page. Kept only if it is
/// the file this build expects.
#[tauri::command]
pub async fn download_speech_model(app: AppHandle) -> Result<(), String> {
    if DOWNLOADING.swap(true, Ordering::SeqCst) {
        return Err("The speech model is already downloading.".into());
    }
    let result = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || download(&app)
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);
    DOWNLOADING.store(false, Ordering::SeqCst);
    result
}

fn download(app: &AppHandle) -> Result<(), String> {
    let file = model_path(app)?;
    if fs::metadata(&file).is_ok_and(|m| m.len() == MODEL_BYTES) {
        return Ok(());
    }
    let dir = file.parent().expect("the model is in a folder");
    fs::create_dir_all(dir)
        .map_err(|e| format!("Could not make a place for the speech model: {e}"))?;
    let part = file.with_extension("part");
    log::info!("downloading the speech model from {MODEL_URL}");
    // A stalled connection must end, or the download stays "in progress" until the app restarts.
    // ureq has no limit per read, so the body gets one generous limit for the whole download.
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_connect(Some(std::time::Duration::from_secs(20)))
        .timeout_recv_response(Some(std::time::Duration::from_secs(30)))
        .timeout_recv_body(Some(std::time::Duration::from_secs(30 * 60)))
        .build()
        .into();
    let response = agent
        .get(MODEL_URL)
        .call()
        .map_err(|e| format!("Could not download the speech model: {e}"))?;
    let mut body = response.into_body().into_reader();
    let mut out =
        fs::File::create(&part).map_err(|e| format!("Could not save the speech model: {e}"))?;
    let mut buf = vec![0u8; 1 << 16];
    let mut received: u64 = 0;
    let mut told = 0u64;
    loop {
        let n = body
            .read(&mut buf)
            .map_err(|e| format!("The download stopped: {e}"))?;
        if n == 0 {
            break;
        }
        received += n as u64;
        // Never more than the model: anything else is not it.
        if received > MODEL_BYTES {
            let _ = fs::remove_file(&part);
            return Err("The download was larger than the speech model; it was not kept.".into());
        }
        out.write_all(&buf[..n])
            .map_err(|e| format!("Could not save the speech model: {e}"))?;
        if received - told >= 1 << 20 || received == MODEL_BYTES {
            told = received;
            let _ = app.emit(
                MODEL_EVENT,
                serde_json::json!({ "received": received, "total": MODEL_BYTES }),
            );
        }
    }
    out.flush().map_err(|e| e.to_string())?;
    drop(out);
    if !verified(&part, MODEL_BYTES, MODEL_SHA256)? {
        let _ = fs::remove_file(&part);
        return Err("The downloaded speech model wasn't the expected file, so it was not kept. Try again later.".into());
    }
    fs::rename(&part, &file).map_err(|e| format!("Could not save the speech model: {e}"))?;
    log::info!("speech model downloaded and checked");
    Ok(())
}

/// Removes the model (Settings › Sessions); it downloads again, after asking, when next needed.
#[tauri::command]
pub async fn remove_speech_model(app: AppHandle) -> Result<(), String> {
    match fs::remove_file(model_path(&app)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(format!("Could not remove the speech model: {e}")),
    }
}

/// `samples` at `from` Hz as Whisper's 16 kHz, by straight lines between samples.
pub fn resample(samples: &[f32], from: u32) -> Vec<f32> {
    if from == WHISPER_RATE || samples.is_empty() {
        return samples.to_vec();
    }
    let ratio = from as f64 / WHISPER_RATE as f64;
    let len = (samples.len() as f64 / ratio).floor() as usize;
    (0..len)
        .map(|i| {
            let at = i as f64 * ratio;
            let j = at.floor() as usize;
            let next = samples.get(j + 1).copied().unwrap_or(samples[j]);
            samples[j] + (next - samples[j]) * (at - j as f64) as f32
        })
        .collect()
}

/// A recording as Whisper's samples: mono, 16 kHz, -1 to 1.
fn audio_of(file: &Path) -> Result<Vec<f32>, String> {
    let mut reader =
        hound::WavReader::open(file).map_err(|e| format!("Could not read the recording: {e}"))?;
    let spec = reader.spec();
    let channels = spec.channels.max(1) as usize;
    let raw: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Int => reader
            .samples::<i32>()
            .map(|s| s.map(|v| v as f32 / (1i64 << (spec.bits_per_sample - 1)) as f32))
            .collect::<Result<_, _>>(),
        hound::SampleFormat::Float => reader.samples::<f32>().collect::<Result<_, _>>(),
    }
    .map_err(|e| format!("Could not read the recording: {e}"))?;
    let mono: Vec<f32> = raw
        .chunks(channels)
        .map(|f| f.iter().sum::<f32>() / f.len() as f32)
        .collect();
    Ok(resample(&mono, spec.sample_rate))
}

/// A word Whisper heard: from and to, in ms into the recording, and what.
#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Heard {
    from_ms: i64,
    to_ms: i64,
    text: String,
}

/// Whisper's tokens as words: a token starting with a space starts a word (Whisper's tokens are
/// pieces of words, and a piece may be part of a character). Each is its bytes and its from and to
/// in Whisper's 10 ms steps; the word runs from its first token's from to its last token's to.
fn words(tokens: impl IntoIterator<Item = (Vec<u8>, i64, i64)>) -> Vec<Heard> {
    let mut found: Vec<(Vec<u8>, i64, i64)> = Vec::new();
    for (bytes, from, to) in tokens {
        match found.last_mut() {
            Some(last) if !bytes.starts_with(b" ") => {
                last.0.extend_from_slice(&bytes);
                last.2 = to;
            }
            _ => found.push((bytes, from, to)),
        }
    }
    found
        .into_iter()
        .filter_map(|(bytes, from, to)| {
            let text = String::from_utf8_lossy(&bytes).trim().to_string();
            (!text.is_empty()).then_some(Heard {
                from_ms: from * 10,
                to_ms: to * 10,
                text,
            })
        })
        .collect()
}

/// How sure Whisper must be that a segment is silence to leave it out.
const NO_SPEECH: f32 = 0.6;

/// What Whisper hears in 16 kHz mono audio, word by word, saying how far it has got as it goes.
fn heard_in(
    model: &Path,
    audio: &[f32],
    progress: impl FnMut(i32) + 'static,
) -> Result<Vec<Heard>, String> {
    whisper_rs::install_logging_hooks();
    let ctx = whisper_rs::WhisperContext::new_with_params(model, {
        // Word times by aligning the model's attention with the audio (DTW): without it a word
        // after a silence is timed from the silence's start.
        let mut p = whisper_rs::WhisperContextParameters::default();
        p.dtw_parameters(whisper_rs::DtwParameters {
            mode: whisper_rs::DtwMode::ModelPreset {
                model_preset: whisper_rs::DtwModelPreset::SmallEn,
            },
            ..Default::default()
        });
        p
    })
    .map_err(|e| format!("Could not load the speech model: {e}"))?;
    let mut state = ctx
        .create_state()
        .map_err(|e| format!("Could not start transcribing: {e}"))?;
    let mut params =
        whisper_rs::FullParams::new(whisper_rs::SamplingStrategy::Greedy { best_of: 1 });
    params.set_language(Some("en"));
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    // A time for each token, not only for each segment of several seconds.
    params.set_token_timestamps(true);
    // Whisper writes as the text before it does; without this it sometimes leaves out every capital
    // and full stop (John's run of 6 Nov).
    params.set_initial_prompt("Hello, everyone. Thanks for coming. Let's get started.");
    let threads = std::thread::available_parallelism().map_or(4, |n| n.get().min(8)) as i32;
    params.set_n_threads(threads);
    params.set_progress_callback_safe(progress);
    state
        .full(params, audio)
        .map_err(|e| format!("Could not transcribe the recording: {e}"))?;
    let eot = ctx.token_eot();
    let heard = state
        .as_iter()
        .filter(|s| {
            // Whisper marks silence and noise as [BLANK_AUDIO], (music) and the like.
            let text = s
                .to_str_lossy()
                .map(|t| t.trim().to_string())
                .unwrap_or_default();
            let noise =
                text.is_empty() || (text.starts_with(['[', '(']) && text.ends_with([']', ')']));
            // In silence Whisper may still write something, but says it heard no speech.
            !noise && s.no_speech_probability() < NO_SPEECH
        })
        .flat_map(|s| {
            let tokens: Vec<_> = (0..s.n_tokens())
                .filter_map(|i| s.get_token(i))
                // [_BEG_], timestamps and the like are Whisper's own, not speech.
                .filter(|t| t.token_id() < eot)
                .filter_map(|t| {
                    let d = t.token_data();
                    // DTW's time for the token, else Whisper's own guess.
                    let at = if d.t_dtw >= 0 { d.t_dtw } else { d.t0 };
                    Some((t.to_bytes().ok()?.to_vec(), at, at))
                })
                .collect();
            words(tokens)
        })
        .collect();
    Ok(heard)
}

/// Transcribes the session's recording on this computer, word by word, so the page can put each
/// word under the card that was up when it was said.
#[tauri::command]
pub async fn transcribe_recording(
    app: AppHandle,
    path: String,
    name: String,
) -> Result<Vec<Heard>, String> {
    let file = file_in(&deck_folder(&app, &path)?, SessionFile::Recording, &name)?;
    let model = model_path(&app)?;
    if !fs::metadata(&model).is_ok_and(|m| m.len() == MODEL_BYTES) {
        return Err("The speech model isn't downloaded yet.".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        // A recording that has only just stopped may still be being finished.
        for _ in 0..50 {
            if !crate::recorder::is_recording(&app, &path, &name) {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(100));
        }
        let audio = audio_of(&file)?;
        let (progress_app, deck, session) = (app.clone(), path.clone(), name.clone());
        heard_in(&model, &audio, move |percent| {
            let _ = progress_app.emit(
                TRANSCRIBING_EVENT,
                serde_json::json!({ "deck": deck, "name": session, "percent": percent }),
            );
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Once transcribed, the recording goes to the Trash, unless Settings keeps recordings.
#[tauri::command]
pub async fn discard_recording(app: AppHandle, path: String, name: String) -> Result<(), String> {
    let file = file_in(&deck_folder(&app, &path)?, SessionFile::Recording, &name)?;
    if fs::symlink_metadata(&file).is_err() {
        return Ok(());
    }
    crate::platform::move_to_trash(&file)
        .map_err(|e| format!("Could not move the recording to the Trash: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resamples_to_16_khz_by_straight_lines() {
        assert_eq!(resample(&[0.0, 1.0], 16_000), vec![0.0, 1.0]);
        // 48 kHz to 16 kHz keeps every third sample.
        assert_eq!(
            resample(&[0.0, 0.1, 0.2, 0.3, 0.4, 0.5], 48_000),
            vec![0.0, 0.3]
        );
        // 8 kHz to 16 kHz puts a sample half way between each.
        assert_eq!(
            resample(&[0.0, 1.0, 0.0], 8_000),
            vec![0.0, 0.5, 1.0, 0.5, 0.0, 0.0]
        );
        assert!(resample(&[], 44_100).is_empty());
    }

    #[test]
    fn joins_whisper_tokens_into_timed_words() {
        let t = |s: &[u8], from, to| (s.to_vec(), from, to);
        let heard = words([
            t(b" Good", 10, 30),
            t(b" morn", 40, 60),
            t(b"ing.", 60, 75),
            // "café", its é split across two tokens.
            t(b" caf", 80, 90),
            t(&[0xC3], 90, 95),
            t(&[0xA9], 95, 100),
        ]);
        let said: Vec<_> = heard
            .iter()
            .map(|h| (h.text.as_str(), h.from_ms, h.to_ms))
            .collect();
        assert_eq!(
            said,
            [
                ("Good", 100, 300),
                ("morning.", 400, 750),
                ("café", 800, 1000)
            ]
        );
    }

    #[test]
    fn keeps_a_model_only_with_its_size_and_hash() {
        let dir = std::env::temp_dir().join(format!("oversay-model-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let file = dir.join("m.bin");
        fs::write(&file, b"abc").unwrap();
        let abc = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        assert!(verified(&file, 3, abc).unwrap());
        assert!(!verified(&file, 4, abc).unwrap(), "wrong size");
        assert!(
            !verified(&file, 3, &abc.replace('b', "c")).unwrap(),
            "wrong hash"
        );
        fs::remove_dir_all(&dir).unwrap();
    }
}
