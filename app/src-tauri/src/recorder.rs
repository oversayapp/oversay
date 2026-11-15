//! Record my voice (ADR 0041, spec §11): while a deck with `record: on` runs, Oversay records
//! this computer's default microphone, and only that (never the call's audio), into the deck's
//! `recordings/<session name>.wav` until it is transcribed on the device. It pauses with the deck,
//! and the deck widget's record button stops it and records again, adding to the run's recording
//! (ADR 0042). The first recording asks for the microphone
//! (macOS shows its own prompt, with NSMicrophoneUsageDescription from Info.plist); refused, the
//! deck runs on without it and every window is told, so nothing pretends to record.
//!
//! The audio stream lives on a thread of its own (cpal's streams can't move between threads); the
//! commands talk to it over a channel, and each change of state is sent to every window as
//! `recording`.

use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::quick::deck_folder;
use crate::session_files::{SessionFile, file_in};

/// Sent to every window whenever recording starts, pauses, stops or can't.
pub const RECORDING_EVENT: &str = "recording";

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RecordingState {
    /// `recording`, `paused`, `stopped`, `refused` (no microphone permission) or `failed`.
    pub state: &'static str,
    /// The deck's file and the session's name the recording is for.
    pub deck: String,
    pub name: String,
    /// Why it couldn't record, in words, for `refused` and `failed`.
    pub why: String,
}

enum Command {
    Pause(bool),
    Stop,
}

struct Active {
    deck: String,
    name: String,
    control: mpsc::Sender<Command>,
    paused: bool,
}

/// The recording in progress, if any: one at a time.
#[derive(Default)]
pub struct Recorder(Mutex<Option<Active>>);

/// Whether this computer lets Oversay use the microphone: `granted`, `refused`, `ask` (it will ask
/// the first time) or `unknown` (Windows says only when a recording starts).
pub fn microphone_permission() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        use objc2_av_foundation::{AVAuthorizationStatus, AVCaptureDevice, AVMediaTypeAudio};
        // SAFETY: AVMediaTypeAudio is a constant AVFoundation defines; asking for the status has no side effects.
        let status = unsafe {
            AVMediaTypeAudio.map(|t| AVCaptureDevice::authorizationStatusForMediaType(t))
        };
        match status {
            Some(AVAuthorizationStatus::Authorized) => "granted",
            Some(AVAuthorizationStatus::NotDetermined) => "ask",
            Some(_) => "refused",
            None => "unknown",
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        "unknown"
    }
}

/// Mixes interleaved samples of `channels` channels down to one, as 16-bit.
pub fn to_mono(samples: &[f32], channels: usize) -> Vec<i16> {
    let channels = channels.max(1);
    samples
        .chunks(channels)
        .map(|frame| {
            let mean = frame.iter().sum::<f32>() / frame.len() as f32;
            (mean.clamp(-1.0, 1.0) * i16::MAX as f32) as i16
        })
        .collect()
}

fn emit(app: &AppHandle, state: &'static str, deck: &str, name: &str, why: &str) {
    let payload = RecordingState {
        state,
        deck: deck.into(),
        name: name.into(),
        why: why.into(),
    };
    log::debug!("recording {state} {name} {why}");
    let _ = app.emit(RECORDING_EVENT, payload);
}

type Writer = hound::WavWriter<std::io::BufWriter<fs::File>>;

/// Opens the default microphone and writes what it hears to `file` until told to stop; pauses drop
/// what it hears. Returns when it has stopped, with why it couldn't record if it couldn't.
fn record(
    file: &Path,
    control: mpsc::Receiver<Command>,
    refused: impl Fn() -> bool,
) -> Result<(), String> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or("There's no microphone to record from.")?;
    let config = device
        .default_input_config()
        .map_err(|e| format!("The microphone can't be used: {e}"))?;
    let channels = config.channels() as usize;
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: config.sample_rate(),
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    if let Some(dir) = file.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("Could not keep the recording: {e}"))?;
    }
    // Recording again in the same run (the deck widget's record button, ADR 0042) carries on the
    // run's recording rather than starting it over, as long as the microphone records the same way.
    let mut writer = if file.exists() {
        let writer = hound::WavWriter::append(file)
            .map_err(|e| format!("Could not add to the recording: {e}"))?;
        if writer.spec() != spec {
            return Err("The microphone now records differently, so this can't be added to the run's recording.".to_string());
        }
        writer
    } else {
        hound::WavWriter::create(file, spec)
            .map_err(|e| format!("Could not keep the recording: {e}"))?
    };
    // The microphone's callback runs on the system's audio thread, which mustn't wait on a lock or
    // the disk or it misses audio ("buffer underrun or overrun"): it hands its samples over, and
    // this thread writes them.
    let (heard, to_write) = mpsc::channel::<Vec<i16>>();
    let paused = Arc::new(AtomicBool::new(false));
    // The loudest sample heard, to tell a refused microphone (macOS gives silence) from a quiet room.
    let loudest = Arc::new(AtomicU32::new(0));

    let write = {
        let (paused, loudest) = (paused.clone(), loudest.clone());
        move |samples: &[f32]| {
            if paused.load(Ordering::Relaxed) {
                return;
            }
            let mono = to_mono(samples, channels);
            if let Some(peak) = mono.iter().map(|s| s.unsigned_abs() as u32).max() {
                loudest.fetch_max(peak, Ordering::Relaxed);
            }
            let _ = heard.send(mono);
        }
    };
    let failed = |e: cpal::Error| log::warn!("microphone: {e}");
    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => device.build_input_stream(
            config.config(),
            move |d: &[f32], _: &_| write(d),
            failed,
            None,
        ),
        cpal::SampleFormat::I16 => device.build_input_stream(
            config.config(),
            move |d: &[i16], _: &_| {
                write(
                    &d.iter()
                        .map(|s| *s as f32 / i16::MAX as f32)
                        .collect::<Vec<_>>(),
                )
            },
            failed,
            None,
        ),
        cpal::SampleFormat::U16 => device.build_input_stream(
            config.config(),
            move |d: &[u16], _: &_| {
                write(
                    &d.iter()
                        .map(|s| (*s as f32 - 32768.0) / 32768.0)
                        .collect::<Vec<_>>(),
                )
            },
            failed,
            None,
        ),
        other => {
            return Err(format!(
                "The microphone gives {other} samples, which Oversay can't record."
            ));
        }
    }
    .map_err(|e| format!("The microphone can't be used: {e}"))?;
    stream
        .play()
        .map_err(|e| format!("The microphone can't be used: {e}"))?;

    let started = Instant::now();
    let mut said_silent = false;
    let write = |writer: &mut Writer| {
        for s in to_write.try_iter().flatten() {
            let _ = writer.write_sample(s);
        }
    };
    let outcome = loop {
        write(&mut writer);
        match control.recv_timeout(Duration::from_millis(100)) {
            Ok(Command::Pause(p)) => paused.store(p, Ordering::Relaxed),
            Ok(Command::Stop) | Err(mpsc::RecvTimeoutError::Disconnected) => break Ok(()),
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        // The person said no to macOS's prompt, which shows while this runs.
        if refused() {
            break Err("refused".to_string());
        }
        // Windows' privacy setting gives silence too; after a while of nothing at all, say so once.
        if !said_silent
            && started.elapsed() > Duration::from_secs(30)
            && loudest.load(Ordering::Relaxed) == 0
        {
            log::warn!("microphone: nothing heard in 30 s");
            said_silent = true;
        }
    };
    drop(stream);
    write(&mut writer);
    writer
        .finalize()
        .map_err(|e| format!("Could not finish the recording: {e}"))?;
    outcome
}

/// Starts recording the session `name` of the deck at `path`. Says `refused` when this computer
/// doesn't let Oversay use the microphone, and records nothing.
#[tauri::command]
pub async fn start_recording(
    app: AppHandle,
    path: String,
    name: String,
) -> Result<&'static str, String> {
    let file = file_in(&deck_folder(&app, &path)?, SessionFile::Recording, &name)?;
    stop(&app);
    if microphone_permission() == "refused" {
        emit(
            &app,
            "refused",
            &path,
            &name,
            "Oversay isn't allowed to use the microphone.",
        );
        return Ok("refused");
    }
    let (tx, rx) = mpsc::channel();
    {
        let recorder = app.state::<Recorder>();
        let mut active = recorder.0.lock().map_err(|e| e.to_string())?;
        *active = Some(Active {
            deck: path.clone(),
            name: name.clone(),
            control: tx,
            paused: false,
        });
    }
    emit(&app, "recording", &path, &name, "");
    let (thread_app, deck) = (app.clone(), path.clone());
    // A run recorded again keeps what it had, whatever happens to the part added now.
    let added_to = file.exists();
    thread::Builder::new()
        .name("recorder".into())
        .spawn(move || {
            let result = record(&file, rx, || microphone_permission() == "refused");
            // Whatever stopped it, it is no longer the recording in progress.
            if let Ok(mut active) = thread_app.state::<Recorder>().0.lock()
                && active
                    .as_ref()
                    .is_some_and(|a| a.name == name && a.deck == deck)
            {
                *active = None;
            }
            match result {
                Ok(()) => emit(&thread_app, "stopped", &deck, &name, ""),
                Err(why) => {
                    // Nothing worth keeping was heard: no recording is left behind.
                    if !added_to {
                        let _ = fs::remove_file(&file);
                    }
                    if why == "refused" {
                        emit(
                            &thread_app,
                            "refused",
                            &deck,
                            &name,
                            "Oversay isn't allowed to use the microphone.",
                        );
                    } else {
                        emit(&thread_app, "failed", &deck, &name, &why);
                    }
                }
            }
        })
        .map_err(|e| format!("Could not start recording: {e}"))?;
    Ok("recording")
}

/// Stops the recording in progress, if any; the recorder's thread says when it has.
fn stop(app: &AppHandle) {
    if let Ok(mut active) = app.state::<Recorder>().0.lock()
        && let Some(a) = active.take()
    {
        let _ = a.control.send(Command::Stop);
    }
}

/// Whether the session `name` of the deck at `path` is still being recorded.
pub fn is_recording(app: &AppHandle, path: &str, name: &str) -> bool {
    app.state::<Recorder>()
        .0
        .lock()
        .is_ok_and(|a| a.as_ref().is_some_and(|a| a.deck == path && a.name == name))
}

/// Pauses or resumes the recording with the deck.
#[tauri::command]
pub async fn pause_recording(app: AppHandle, paused: bool) -> Result<(), String> {
    let recorder = app.state::<Recorder>();
    let mut active = recorder.0.lock().map_err(|e| e.to_string())?;
    if let Some(a) = active.as_mut().filter(|a| a.paused != paused) {
        a.paused = paused;
        let _ = a.control.send(Command::Pause(paused));
        emit(
            &app,
            if paused { "paused" } else { "recording" },
            &a.deck,
            &a.name,
            "",
        );
    }
    Ok(())
}

/// Stops recording: at Stop, or from the deck widget's record button until it is pressed again.
#[tauri::command]
pub async fn stop_recording(app: AppHandle) -> Result<(), String> {
    stop(&app);
    Ok(())
}

/// What a window that opens mid-run needs: the recording in progress, if any.
#[tauri::command]
pub async fn recording_state(app: AppHandle) -> Result<Option<RecordingState>, String> {
    let recorder = app.state::<Recorder>();
    let active = recorder.0.lock().map_err(|e| e.to_string())?;
    Ok(active.as_ref().map(|a| RecordingState {
        state: if a.paused { "paused" } else { "recording" },
        deck: a.deck.clone(),
        name: a.name.clone(),
        why: String::new(),
    }))
}

/// Whether Oversay may use the microphone, for the deck editor's Record my voice switch.
#[tauri::command]
pub async fn microphone_status() -> &'static str {
    microphone_permission()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mixes_channels_down_to_one_and_clips() {
        assert_eq!(to_mono(&[0.5, -0.5, 1.0, 1.0], 2), vec![0, i16::MAX]);
        assert_eq!(to_mono(&[2.0, -3.0], 1), vec![i16::MAX, -i16::MAX]);
        assert_eq!(to_mono(&[0.25], 0), vec![(0.25 * i16::MAX as f32) as i16]);
    }
}
