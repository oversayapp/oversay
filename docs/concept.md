# Oversay — Concept

> Working name: **Oversay** (a play on "overlay"). Status: early concept. Goal of this document is to explain what I want to achieve so that intents, proofs of concept and build plans can be derived from it.

## One-line summary

A cross-platform (Windows + Mac) app that keeps a live, always-on-top timing diagram on screen while I give a speech or run a meeting, so I can see at a glance how far through the current topic I am and when to move on, and then review my actual pacing against the plan afterwards.

## The problem

When giving a 20-minute talk or running a meeting, it is hard to keep track of time per topic. A single countdown clock tells me total time left but not whether I am overrunning the intro, a particular topic, or the wrap-up. I want a visual that maps directly onto the structure of what I plan to say.

## Core visual idea

A **square-wave / timing-diagram** style timeline:

- Each flat segment of the wave represents one section of the talk (intro, topic 1, topic 2, ..., outro).
- Segment width is proportional to its planned duration.
- A playhead moves along the wave in real time, so I can see how close I am to the end of the current section.
- The wave is overlaid on the screen for the whole session.

## Overlay requirements

- Always on top of other windows, including when I click into other apps in the background.
- Persistent / long-lived: it stays visible for the full duration rather than fading out like a transient notification.
- Draggable: I can move it around the screen.
- Animated: there will be continuous animation inside the window (playhead movement, progress, cues), not just static content.
- Works on both **Windows and Mac**, and should be easy to install on both.

Inspiration: Hammerspoon's `hs.alert` overlay on macOS. I want the same kind of floating overlay, but long-lived, interactive and cross-platform.

## Setting up a session

Two ways to define the sections before starting:

1. **AI-assisted:** give the app a speech (text) and have AI break it down into sections with suggested durations.
2. **Manual:** specify section 1, section 2, section 3, etc., each with a name/title and a duration.

## Running a session

- Press the **spacebar** to start (marks the moment I begin speaking).
- The overlay tracks my actual progress against the planned timeline.
- Goal: let me match my real cadence to the predicted cadence while I speak.

## After the session

- Compare **planned vs actual** timing per section.
- Replay the session, fix up the plan, and do analysis of my pacing.
- Optional: record the session audio and run speech-to-text to align what I actually said against each section. Analysis could run with a small model locally on my machine, or in the cloud for people who want a server-based option.

## Underlying file format

A portable file (e.g. JSON) is the source of truth. It holds:

- Sections, in order
- Per section: **name, duration, keywords, hints**, and within a topic there may be several distinct sub-points I want to make
- Other metadata
- Planned timing and, once a session has been run, the **actual** timing

A separate service reads this file to support replay, editing and analysis. The overlay and the analysis tooling should be decoupled and communicate through this format.

## Prior art (initial look)

Segmented presentation timers already exist, for example CueTimer, Stagetimer, and a GitHub project called ElBruno's Presenter Timer (a Windows tray app with an always-on-top session timeline overlay). None found so far combine the square-wave visual with planned-vs-actual cadence comparison and post-session analysis, which looks like the differentiator. This should be verified in more depth.

## Technology: open

I am deliberately not committing to a stack yet. I want to flesh out the idea and experiment with the different aspects first.

What I have said so far:

- Must be easy to ship on both Windows and Mac.
- Not interested in Electron.
- Not interested in per-platform native development.
- Options discussed so far: Python with PySide6/Qt, Tauri (Rust shell with a webview), and pure Rust GUI toolkits (egui, Iced). None chosen.

## Possible proofs of concept

- Overlay window: frameless, transparent, always-on-top, draggable, persistent, with continuous animation, on both Windows and Mac.
- Square-wave timeline rendering with a moving playhead driven by a section list.
- Session file format: draft the schema and load/save planned and actual timings.
- AI breakdown: take a speech as text and produce sections, durations, keywords and hints in the file format.
- Spacebar start and capture of actual section boundaries.
- Post-session comparison view of planned vs actual.
- Optional: local speech-to-text alignment against sections.

## Open questions

- How should I advance to the next section during a session: automatically by time, or with a manual keypress, or both?
- How should the overlay behave when I overrun a section?
- Where should hints and sub-points appear during the session (inside the overlay, or hidden until needed)?
- What should the analysis output look like?
- Local-only versus optional cloud service for transcription and analysis.
