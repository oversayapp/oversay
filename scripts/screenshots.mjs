#!/usr/bin/env node
// Screenshots of every manager screen and of the overlays, for looking at a UI change before
// anyone tests it.
//
// Starts this checkout's Vite dev server on its own port, loads the manager in headless
// Chrome with the Tauri bridge faked (a sample project and recent list), and captures
// Home, Projects, the project overview, the Talk editor, Templates and Settings at 1440, 1000 and
// 720px wide in light and dark mode. Each overlay is then loaded as its own window would be, at
// its window size, in each session state (ready, running, overrun, demo, paused, the last 30
// seconds, finished) over a light and a dark slide colour. Pictures go to out/shots/; any console
// error is printed and fails the run. The dev server sends the app's dev Content Security Policy
// (vite.config.ts), so anything it blocks fails the run too.
//
// Usage: node scripts/screenshots.mjs   (or `make shots`)
// Env:   SHOTS_PORT (default 1430, clear of the dev ports), CHROME (path to Chrome)

import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'out', 'shots')
const port = Number(process.env.SHOTS_PORT ?? 1430)
const debugPort = port + 1000
const chromePath = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const WIDTHS = [1440, 1000, 720]
const HEIGHT = 800
const SCHEMES = ['light', 'dark']

// SHOTS_ONLY=<regex>: take only the pictures whose names match (every step still runs), and the
// overlays only when the pattern matches "overlay".
const only = process.env.SHOTS_ONLY ? new RegExp(process.env.SHOTS_ONLY) : null
const wanted = (name) => !only || only.test(name)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(url) {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return res
    } catch {}
    await sleep(200)
  }
  throw new Error(`nothing answered at ${url}`)
}

// A sample project with every segment kind, open-ended segments and talking points.
const project = {
  schemaVersion: 1,
  id: 'p_demo',
  name: 'Oversay launch',
  talks: [
    {
      id: 't_web', name: 'Customer webinar 30 min', audience: 'Customers', targetSeconds: 1800, sessions: [],
      segments: [
        { id: 's_1', name: 'Welcome', kind: 'intro', plannedSeconds: 180, openEnded: false, points: ['Who I am', 'What you will see today'], hints: ['Smile, slow down'] },
        { id: 's_2', name: 'Planning talks that fit', kind: 'topic', plannedSeconds: 420, openEnded: false, points: ['Why timers fail', 'Segments, not slides'], hints: [] },
        { id: 's_3', name: 'Live demo', kind: 'demo', plannedSeconds: 600, openEnded: true, points: ['Create a talk from a **template**', 'Show the editor:\n- add a segment\n- *drag* it into place'], hints: ['If wifi dies, use the `recording`'] },
        { id: 's_4', name: 'Break', kind: 'break', plannedSeconds: 120, openEnded: false, points: [], hints: [] },
        { id: 's_5', name: 'Q&A', kind: 'demo', plannedSeconds: 420, openEnded: true, points: [], hints: [] },
        { id: 's_6', name: 'Close', kind: 'outro', plannedSeconds: 120, openEnded: false, points: ['Thank you'], hints: [] },
      ],
    },
    { id: 't_board', name: 'Board update 10 min', audience: 'Board', targetSeconds: 600, sessions: [], segments: [] },
  ],
}

// Stands in for window.__TAURI_INTERNALS__ so the manager runs in a plain browser.
const fakeBridge = `(() => {
  const project = ${JSON.stringify(JSON.stringify(project))};
  const recent = JSON.stringify({ version: 1, recent: [
    { path: '/Users/demo/Documents/launch.oversay.json', name: 'Oversay launch', openedAt: new Date().toISOString(), talks: 2 },
    { path: '/Users/demo/Desktop/board-deck.oversay.json', name: 'Board deck', openedAt: '2026-01-15T10:00:00Z', talks: 1 },
  ] });
  const templates = JSON.stringify({ version: 2,
    categories: [{ id: 'mine', name: 'My templates', color: 'indigo' }, { id: 'c_client', name: 'Client work', color: 'red' }],
    removedStarterCategories: ['speeches'], removedStarterTemplates: ['builtin:keynote-30'],
    templates: [
    { id: 'u_demo5678', name: 'Client kickoff 20', description: 'Saved from “Acme kickoff”.', category: 'c_client', builtin: false,
      segments: [
        { name: 'Introductions', kind: 'intro', plannedSeconds: 180, openEnded: false },
        { name: 'Goals', kind: 'topic', plannedSeconds: 420, openEnded: false },
        { name: 'Plan', kind: 'topic', plannedSeconds: 420, openEnded: false },
        { name: 'Questions', kind: 'outro', plannedSeconds: 180, openEnded: true },
      ] },
    { id: 'u_demo1234', name: 'My keynote 30', description: 'Saved from “Product keynote”.', category: 'conferences', builtin: false,
      segments: [
        { name: 'Story opener', kind: 'intro', plannedSeconds: 180, openEnded: false },
        { name: 'Big idea', kind: 'topic', plannedSeconds: 420, openEnded: false },
        { name: 'Three proofs', kind: 'topic', plannedSeconds: 720, openEnded: false },
        { name: 'Demo', kind: 'demo', plannedSeconds: 300, openEnded: true },
        { name: 'Close', kind: 'outro', plannedSeconds: 180, openEnded: false },
      ] },
  ] });
  // Two favourites: a talk in the sample project, and one whose project has gone (011/02).
  // The Workspaces page's sidebar: one pin, two opened.
  const workspaceNav = { pins: [{ id: 'w_inject01', at: new Date().toISOString() }], opened: [{ id: 'w_svelte01', at: new Date(Date.now() - 3600e3).toISOString() }, { id: 'w_appsec01', at: new Date(Date.now() - 86400e3).toISOString() }], colours: { conferences: 'orange' }, tags: [], place: 'all', sort: 'date' };
  // ?library=empty|one|many: a first run, one deck, or 60 decks in 12 workspaces (epic 036 (#54)).
  const libraryVariant = new URLSearchParams(location.search).get('library');
  const deckPath = (name) => '/Users/demo/Documents/Oversay/Decks/' + name + '/deck.md';
  const openedAt = (hours) => new Date(Date.now() - hours * 3600e3).toISOString();
  const sampleOpened = [{ kind: 'deck', path: deckPath('Stand-up 23 Oct'), id: 'd_standup1', at: openedAt(0.2) }, { kind: 'deck', path: deckPath('Atlas launch review'), id: 'd_atlas001', at: openedAt(30) }];
  const samplePins = [{ kind: 'deck', path: deckPath('Atlas launch review'), id: 'd_atlas001', at: openedAt(72) }];
  const settingsFile = JSON.stringify({ version: 1, appearance: 'system', projectLinesMoved: true, exampleDecksInstalled: libraryVariant ? true : undefined, opened: sampleOpened, pins: samplePins, workspaceNav, favourites: [
    { path: '/Users/demo/Documents/launch.oversay.json', talkId: 't_web', talkName: 'Customer webinar 30 min', projectName: 'Oversay launch' },
    { path: '/Users/demo/Documents/missing.oversay.json', talkId: 't_x', talkName: 'Sales kickoff', projectName: 'Sales 2025' },
  ], lastRun: { path: '/Users/demo/Documents/launch.oversay.json', talkId: 't_web', talkName: 'Customer webinar 30 min', projectName: 'Oversay launch', at: new Date(Date.now() - 2 * 86400000).toISOString() } });
  // The Quick notes folder: three notes, newest first.
  const NOTES_DIR = '/Users/demo/Documents/Oversay/Quick notes/';
  const quick = { notes: {
    'Priya 1-1': { at: Date.now() - 3600e3, text: '---\\nwith: Priya Shah\\nwhen: Tuesdays 10:00\\nlength: 30m\\n---\\n\\n## Promotion case [10m]\\n- Where the write-up stands\\n  - Two peer reviews still to come\\n- Is Atlas slipping a week?\\n> Ask how the on-call week went\\n\\n## Hiring [~5m]\\n1. Two candidates on Friday\\n2. Need a reviewer for the **sync** change\\n\\n## Anything else [open]\\n- Her conference talk\\n' },
    'Weekly standup': { at: Date.now() - 2 * 86400e3, text: '---\\nwith: Platform team\\n---\\n\\n## Yesterday\\n- Shipped the export fix\\n\\n## Today\\n- Pairing on sync\\n\\n## Blockers\\n- None\\n' },
    'Acme renewal call': { at: Date.now() - 9 * 86400e3, text: '## Where they are\\n- Usage up 40%\\n- Want SSO\\n\\n## Ask\\n- Two-year term\\n' },
  }, talks: {
    'Platform stand-up': { at: Date.now() - 1800e3, text: JSON.stringify({ schemaVersion: 1, kind: 'quickTalk', id: 'p_qstand', name: 'Platform stand-up', talks: [{ id: 't_qstand', name: 'Platform stand-up', sessions: [], segments: [
      { id: 's_q1', name: 'Yesterday', kind: 'intro', plannedSeconds: 120, openEnded: false, points: ['Export fix shipped'], hints: [] },
      { id: 's_q2', name: 'Today', kind: 'topic', plannedSeconds: 180, openEnded: false, points: ['Sync review', 'On-call handover'], hints: [] },
      { id: 's_q3', name: 'Blockers', kind: 'outro', plannedSeconds: 60, openEnded: true, points: [], hints: [] } ] }] }) },
    'Investor update': { at: Date.now() - 5 * 86400e3, text: JSON.stringify({ schemaVersion: 1, kind: 'quickTalk', id: 'p_qinv', name: 'Investor update', talks: [{ id: 't_qinv', name: 'Investor update', sessions: [], segments: [
      { id: 's_i1', name: 'Traction', kind: 'topic', plannedSeconds: 240, openEnded: false, points: ['Signups up 32%'], hints: [] },
      { id: 's_i2', name: 'Ask', kind: 'outro', plannedSeconds: 120, openEnded: false, points: [], hints: [] } ] }] }) },
  }, decks: {
    // Decks: the stand-up the AI skill writes, and an untimed 1:1.
    'Stand-up 23 Oct': { at: Date.now() - 600e3, text: '---\\nid: d_standup1\\naudience: Platform team\\ntags: weekly, platform\\ntimeline: waveform\\nmade-with: Oversay skill 0.1.0\\n---\\n\\n# Stand-up · 23 Oct\\n\\n## Intro [1m, intro]\\n- Goal for today\\n\\n## Atlas [3m]\\n1. Shipped the importer\\n\\n## Beacon [4m, demo]\\n- Live demo\\n\\n## Comet [5m]\\n- Load test\\n' },
    '1-1 with Sam': { at: Date.now() - 3 * 86400e3, text: '---\\nwith: Sam\\n---\\n\\n## How are things [intro]\\n- Workload\\n\\n## Growth\\n- Conference talk\\n' },
    // older decks, for the date groups, with a project and tags to filter by.
    'Atlas launch review': { at: Date.now() - 12 * 86400e3, text: '---\\nid: d_atlas001\\naudience: Leadership\\nproject: Atlas\\ntags: launch\\n---\\n\\n## Numbers [5m]\\n- Signups\\n\\n## Risks [5m]\\n- Load\\n' },
    'Board prep Q3': { at: Date.now() - 45 * 86400e3, text: '---\\naudience: Board\\nproject: Atlas\\ntags: board, quarterly\\n---\\n\\n## Revenue [10m]\\n- Q3\\n\\n## Hiring [5m]\\n- Two roles\\n' },
  } };
  // Workspaces (ADR 0040): tagged groups of decks, one listing a deck that has gone.
  let spaces = [
      { id: 'w_appsec01', name: 'AppSec June 2026', folder: 'AppSec June 2026', tags: ['conferences'], decks: ['d_standup1', 'd_atlas001', 'd_gone0001'], when: '2026-06-02', where: 'Zoom', notes: 'Panel with Ana and Raj', problem: null },
      { id: 'w_infra001', name: 'Infrastructure 2026', folder: 'Infrastructure 2026', tags: ['conferences'], decks: ['d_atlas001'], when: '2026-09-15', where: 'Lisbon', notes: '', problem: null },
      { id: 'w_inject01', name: 'Prompt injection in AI agents', folder: 'Prompt injection in AI agents', tags: ['research', 'talks'], decks: ['d_atlas001'], when: '2026-12-02', where: 'AppSec Dublin', notes: '', problem: null },
      { id: 'w_passkey1', name: 'Passkeys in practice', folder: 'Passkeys in practice', tags: ['research'], decks: [], when: '', where: '', notes: '', problem: null },
      { id: 'w_svelte01', name: 'Svelte 5 basics', folder: 'Svelte 5 basics', tags: ['tutorials'], decks: ['d_standup1'], when: '2026-10-06', where: 'Room 2.14', notes: '', problem: null },
      { id: 'w_atlas001', name: 'Atlas launch', folder: 'Atlas launch', tags: [], decks: [], when: '', where: '', notes: '', problem: null },
  ];
  if (libraryVariant === 'empty') { quick.decks = {}; spaces = []; }
  if (libraryVariant === 'one') { quick.decks = { 'Weekly stand-up': quick.decks['Stand-up 23 Oct'] }; quick.decks['Weekly stand-up'].text = quick.decks['Weekly stand-up'].text.replace('d_standup1', 'd_one00001'); spaces = []; }
  if (libraryVariant === 'many') {
    const kinds = ['intro', 'topic', 'demo', 'outro'];
    for (let i = 0; i < 56; i++) {
      const cards = Array.from({ length: 3 + (i % 5) }, (_, c) => '## Card ' + (c + 1) + ' [' + (2 + c) + 'm, ' + kinds[c % 4] + ']\\n- A point\\n').join('\\n');
      quick.decks['Deck number ' + (i + 1)] = { at: Date.now() - (i * 26 + 2) * 3600e3, text: '---\\nid: d_many' + String(i).padStart(4, '0') + '\\naudience: Team ' + (i % 6) + '\\n---\\n\\n' + cards };
    }
    spaces = [];
    const names = ['Beacon redesign', 'Comet migration', 'Hiring loop', 'Q1 planning', 'Passkeys talk', 'Supply chain signing', 'Testing with Vitest', 'Advisory board', 'Team offsite', 'Design system', 'Security review', 'Customer calls'];
    names.forEach((name, i) => spaces.push({ id: 'w_many' + String(i).padStart(4, '0'), name, folder: name, tags: [['Projects', 'Research', 'Talks'][i % 3]], decks: Array.from({ length: 5 }, (_, k) => 'd_many' + String(i * 5 + k).padStart(4, '0')), when: '', where: '', notes: i % 2 ? '' : 'What ' + name + ' is for.', problem: null }));
  }
  const qext = { notes: '.md', talks: '.oversay.json', decks: '.md' };
  const qdir = (kind) => ({ notes: NOTES_DIR, talks: '/Users/demo/Documents/Oversay/Quick talks/', decks: '/Users/demo/Documents/Oversay/Decks/' })[kind];
  const qname = (kind, path) => path.slice(qdir(kind).length, -qext[kind].length);
  let n = 1;
  // Event callbacks, so the fake session engine can broadcast like the real one (state.rs).
  const callbacks = {}, handlers = {};
  const emit = (event, payload) => (handlers[event] ?? []).forEach((h) => callbacks[h]?.({ event, id: 0, payload }));
  // A file written outside Oversay (an AI, another editor), as the folder watcher reports it.
  window.__outside = (kind, name, text) => { quick[kind][name] = { at: Date.now(), text }; emit('quick-files-changed', kind); };
  // An oversay:// link opened by another app, as links.rs hands it over.
  const links = [];
  const skills = { 'claude-code': null, codex: null };
  // No AI app on this computer: the AI page's notice. __noAi(false) puts them back.
  let aiHere = true;
  window.__noAi = (none = true) => { aiHere = !none; };
  // Copies Oversay updated itself when it started.
  let skillsUpdated = [];
  window.__skillsUpdated = (ids) => { skillsUpdated = ids; };
  window.__link = (url) => { links.push(url); emit('oversay-link'); };
  // Files dragged from Finder onto the window, as Tauri reports them; and the clipboard.
  const sessionFiles = {};
  // A review the skill wrote, once window.__review() is called.
  const sessionReviews = {};
  window.__review = () => { const name = stamp(standupStart); sessionReviews[name] = '---\\nsession: ' + standupStart + '\\nmade-with: Oversay skill 0.2.0\\n---\\n\\n# Stand-up\\n\\n## What ran over\\n- **Atlas** took 3:32 for 3:00, and you came back to it after Intro: your note says the importer detail was most of it.\\n- **Intro** ran 0:12 over.\\n\\n## What was rushed or skipped\\n- **Beacon** got 3:51 of 4:00, fine, but the live demo was only described.\\n\\n## What to change in the deck\\n- Atlas: add the point “Importer: see the doc” and keep it to 3:00.\\n- Intro: one line, not three.\\n'; emit('quick-files-changed', 'decks'); };
  // The Atlas review's run yesterday recorded the person's voice, not yet transcribed.
  const atlasYesterday = new Date(Math.floor((Date.now() - 86400e3) / 60000) * 60000).toISOString();
  const stamp = (iso) => { const d = new Date(iso), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + '-' + p(d.getMinutes()); };
  const standupStart = new Date(Math.floor((Date.now() - 900e3) / 1000) * 1000).toISOString();
  window.__drag = (type, paths) => emit('tauri://drag-' + type, { paths, position: { x: 400, y: 300 } });
  let clipboard = '';
  window.__clipboard = (text) => { clipboard = text; };
  let session = null, version = 0;
  const iso = (secondsAgo) => new Date(Date.now() - secondsAgo * 1000).toISOString();
  // An overlay window (?overlay=<plugin>&state=<preset>): its label, and a session already in that state.
  const query = new URLSearchParams(location.search);
  const label = query.get('window') ?? (query.get('overlay') ? 'overlay-' + query.get('overlay') : 'manager');
  // The Timeline's style, talk bar, ring or gauge and its button edge, as the manager would send them (Settings › Overlays, 007/02).
  const overlaySettings = { timelineStyle: query.get('style') ?? 'waveform', buttons: query.get('buttons') ?? 'always', opacity: Number(query.get('opacity') ?? 78), panel: query.get('panel') ?? 'dark', solid: query.get('solid') === '0' ? false : undefined, textSize: query.get('size') ?? 'm', layout: query.get('layout') ?? 'topic', deckView: query.get('view') ?? 'card' };
  // The flashcard widget's deck: four cards, the last untimed, and its options.
  const deckTalk = { id: 'deck', name: 'Stand-up', sessions: [], deckPath: '/Users/demo/Documents/Oversay/Decks/Stand-up/deck.md', deck: { colour: query.get('colour') ?? 'kinds', autoAdvance: query.get('auto') !== 'off', timing: true, hide: (query.get('hide') ?? '').split(',').filter(Boolean) }, segments: [
    { id: 's_deck0', name: 'Intro', kind: 'intro', plannedSeconds: 60, openEnded: false, points: ['Goal for today: ship **Beacon**'], hints: [] },
    { id: 's_deck1', name: 'Atlas', kind: 'topic', plannedSeconds: 180, openEnded: false, points: ['Shipped the importer', '**Blocked** on review:\\n- ask Sam\\n- or Priya', 'Next: ' + String.fromCharCode(96) + 'sync' + String.fromCharCode(96) + ' cleanup'], hints: [] },
    { id: 's_deck2', name: 'Beacon', kind: 'demo', plannedSeconds: 240, openEnded: false, points: ['Live demo of the new flow'], hints: [] },
    { id: 's_deck3', name: 'Questions', kind: 'topic', plannedSeconds: 0, openEnded: true, points: ['Anything blocking?'], hints: [] },
    { id: 's_deck4', name: 'Wrap-up', kind: 'outro', plannedSeconds: 120, openEnded: false, points: ['Who does what'], hints: [] } ] };
  if (query.get('state')) {
    const talk = query.get('overlay') === 'flashcard' ? deckTalk : JSON.parse(project).talks[0];
    // Talking Points' hard cases: the second segment with nine long points, or with nothing.
    const notes = { long: { points: Array.from({ length: 9 }, (_, i) => 'Point ' + (i + 1) + ': a long point that runs over more than one line so the list is taller than the panel'), hints: ['Keep it under seven minutes'] }, empty: { points: [], hints: [] }, md: { points: ['**Never** read the slide aloud', 'Show the editor:\\n- add a segment\\n- *drag* it into place', 'Run ' + String.fromCharCode(96) + 'make check' + String.fromCharCode(96) + ' before pushing', '<b>Raw HTML</b> stays text; [a link](https://example.com) shows its text'], hints: ['Slow down: *breathe*'] } }[query.get('state')];
    if (notes) Object.assign(talk.segments[1], notes);
    const plan = talk.segments.map((s) => ({ segmentId: s.id, name: s.name, plannedSeconds: s.plannedSeconds, openEnded: s.openEnded }));
    // Welcome 3:00, Planning 7:00, Live demo open-ended (est. 10:00), Break, Q&A, Close; target 30:00.
    const ev = (type, secondsAgo) => ({ type, at: iso(secondsAgo) });
    const presets = {
      ready: { status: 'ready', index: 0, events: [] },
      running: { status: 'running', index: 1, events: [ev('start', 260), ev('next', 70)] },
      long: { status: 'running', index: 1, events: [ev('start', 260), ev('next', 70)] },
      empty: { status: 'running', index: 1, events: [ev('start', 260), ev('next', 70)] },
      md: { status: 'running', index: 1, events: [ev('start', 260), ev('next', 70)] },
      overrun: { status: 'running', index: 0, events: [ev('start', 205)] },
      demo: { status: 'running', index: 2, events: [ev('start', 720), ev('next', 530), ev('next', 95)] },
      paused: { status: 'running', index: 1, paused: true, events: [ev('start', 260), ev('next', 70), ev('pause', 12)] },
      wrapup: { status: 'running', index: 0, events: [ev('start', 160)] },
      // Still in the second segment (7:00) after 30 minutes, so the 31:00 talk's time has gone.
      talkover: { status: 'running', index: 1, events: [ev('start', 1980), ev('next', 1800)] },
      // A quick note shown on screen: counts up, Previous / Next topic.
      note: { status: 'running', index: 1, note: true, events: [ev('start', 400), ev('next', 95)] },
      // A deck on the flashcard widget: Ready, on a card, paused, on its untimed last card.
      'deck-ready': { status: 'ready', index: 0, deck: true, events: [] },
      'deck-running': { status: 'running', index: 1, deck: true, events: [ev('start', 90), ev('next', 25)] },
    
      'deck-paused': { status: 'running', index: 2, paused: true, deck: true, events: [ev('start', 400), ev('next', 330), ev('next', 100), ev('pause', 10)] },
      'deck-warn': { status: 'running', index: 1, deck: true, events: [ev('start', 240), ev('next', 172)] },
      'deck-waiting': { status: 'running', index: 1, deck: true, events: [ev('start', 260), ev('next', 192)] },
      'deck-untimed': { status: 'running', index: 3, deck: true, events: [ev('start', 700), ev('next', 640), ev('next', 460), ev('next', 134)] },
      'deck-last': { status: 'running', index: 4, deck: true, events: [ev('start', 900), ev('next', 840), ev('next', 660), ev('next', 420), ev('next', 143)] },
      finished: { status: 'finished', index: 5, events: [ev('start', 1900), ev('next', 1700), ev('next', 1250), ev('next', 640), ev('next', 520), ev('next', 150), ev('end', 0)] },
    };
    session = { paused: false, plan, talk, shortcuts: { next: 'Control+Alt+ArrowRight', previous: 'Control+Alt+ArrowLeft', darker: 'Control+Alt+ArrowUp', lighter: 'Control+Alt+ArrowDown' }, unavailable: [], ...presets[query.get('state')] };
    version = 1;
  }
  const broadcast = () => emit('state:session', { version: ++version, value: session });
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label }, currentWebview: { windowLabel: label, label } },
    transformCallback: (cb) => { const id = n++; callbacks[id] = cb; return id; },
    unregisterCallback: () => {},
    convertFileSrc: (p) => p,
    invoke: async (cmd, args) => {
      if (cmd === 'read_config_file') return { 'recent.json': recent, 'templates.json': templates, 'settings.json': settingsFile }[args.name] ?? null;
      if (cmd === 'read_project_file' && args.path.includes('/Quick talks/')) return quick.talks[qname('talks', args.path)].text;
      if (cmd === 'read_project_file') { if (args.path.includes('missing')) throw new Error('not found'); return project; }
      if (cmd === 'plugin:app|version') return '0.1.0';
      if (cmd === 'plugin:window|get_all_windows') return ['manager', 'overlay-timeline', 'overlay-talking-points'];
      if (cmd === 'plugin:window|is_visible') return true;
      if (cmd === 'take_links') return links.splice(0);
      if (cmd === 'plugin:clipboard-manager|read_text') return clipboard;
      if (cmd === 'import_note') { const stem = args.path.split('/').pop().replace(/\\.md$/i, ''); let name = stem, i = 1; while (quick.notes[name]) name = stem + ' ' + ++i; quick.notes[name] = { at: Date.now(), text: '## Agenda [10m]\\n- Figma walkthrough\\n- Open questions\\n\\n## Decisions\\n- Who signs off\\n' }; return NOTES_DIR + name + '.md'; }
      // The skill in each AI app: both apps found, nothing installed until Install.
      if (cmd === 'skill_targets') return { bundledVersion: '0.1.0', bundledDir: '/Applications/Oversay.app/Contents/Resources/skills/oversay', targets: [
        { id: 'claude-code', found: aiHere, dir: '/Users/demo/.claude/skills/oversay', installedVersion: skills['claude-code'] },
        { id: 'codex', found: aiHere, dir: '/Users/demo/.agents/skills/oversay', installedVersion: skills.codex },
        // Gemini CLI isn't here, and reads Codex's copy.
        { id: 'gemini-cli', found: false, dir: '/Users/demo/.agents/skills/oversay', installedVersion: skills.codex } ],
        desktopApps: { claude: aiHere, chatgpt: false, gemini: false }, updated: skillsUpdated };
      if (cmd === 'plugin:dialog|save') return '/Users/demo/Downloads/' + (args.options?.defaultPath ?? 'file');
      if (cmd === 'save_skill_zip') return null;
      if (cmd === 'install_skill') { skills[args.target === 'gemini-cli' ? 'codex' : args.target] = '0.1.0'; return '/Users/demo/x'; }
      if (cmd === 'remove_skill') { skills[args.target === 'gemini-cli' ? 'codex' : args.target] = null; return null; }
      if (cmd === 'list_quick_files') return Object.entries(quick[args.kind]).map(([name, f]) => ({ path: qdir(args.kind) + name + qext[args.kind], name, modifiedMs: f.at }));
      if (cmd === 'read_quick_file') return quick[args.kind][qname(args.kind, args.path)].text;
      // A deck's runs: the stand-up has two, the latest a little over.
      if (cmd === 'read_deck_sessions') return qname('decks', args.path) === 'Stand-up 23 Oct' ? JSON.stringify({ version: 1, sessions: [
        { startedAt: '2026-10-22T09:30:00.000Z', endedAt: '2026-10-22T09:43:10.000Z', cards: [{ name: 'Intro', kind: 'intro', plannedSeconds: 60, seconds: 55 }, { name: 'Atlas', kind: 'topic', plannedSeconds: 180, seconds: 170 }, { name: 'Beacon', kind: 'demo', plannedSeconds: 240, seconds: 260 }, { name: 'Comet', kind: 'topic', plannedSeconds: 300, seconds: 305 }] },
        { startedAt: standupStart, endedAt: new Date(Date.now() - 60e3).toISOString(), cards: [{ name: 'Intro', kind: 'intro', plannedSeconds: 60, seconds: 72 }, { name: 'Atlas', kind: 'topic', plannedSeconds: 180, seconds: 212 }, { name: 'Beacon', kind: 'demo', plannedSeconds: 240, seconds: 231 }, { name: 'Comet', kind: 'topic', plannedSeconds: 300, seconds: 300 }],
          pausedSeconds: 25, note: 'Ran over on Atlas again: the importer detail can go in the doc.',
          visits: [[0, 0, 40], [1, 40, 150], [0, 150, 182], [1, 182, 284], [2, 284, 515], [3, 515, 815]].map(([card, a, b]) => ({ card, from: new Date(Date.parse(standupStart) + a * 1000).toISOString(), to: new Date(Date.parse(standupStart) + b * 1000).toISOString() })) },
      ] })
        // Sessions: the Atlas review ran yesterday, under, and a week ago, over.
        : qname('decks', args.path) === 'Atlas launch review' ? JSON.stringify({ version: 1, sessions: [
          { startedAt: new Date(Date.now() - 8 * 86400e3).toISOString(), endedAt: new Date(Date.now() - 8 * 86400e3 + 700e3).toISOString(), cards: [{ name: 'Numbers', kind: 'topic', plannedSeconds: 300, seconds: 410 }, { name: 'Risks', kind: 'topic', plannedSeconds: 300, seconds: 290 }] },
          { startedAt: atlasYesterday, endedAt: new Date(Date.now() - 86400e3 + 520e3).toISOString(), cards: [{ name: 'Numbers', kind: 'topic', plannedSeconds: 300, seconds: 260 }, { name: 'Risks', kind: 'topic', plannedSeconds: 300, seconds: 220 }] },
        ] }) : '';
      if (cmd === 'write_deck_sessions') return null;
      // A session's transcript, review and recording (ADR 0041): a transcript once one is saved.
      if (cmd === 'list_session_files') return qname('decks', args.path) === 'Atlas launch review' ? { transcripts: [], reviews: [], recordings: [stamp(atlasYesterday)] } : { transcripts: Object.keys(sessionFiles), reviews: Object.keys(sessionReviews), recordings: [] };
      // Whisper's model is not downloaded yet.
      if (cmd === 'speech_model') return { present: false, bytes: 190098681, from: 'huggingface.co/ggerganov/whisper.cpp' };
      if (cmd === 'write_transcript') { sessionFiles[args.name] = args.contents; return null; }
      if (cmd === 'read_session_file') return (args.kind === 'review' ? sessionReviews : sessionFiles)[args.name] ?? '';
      // A Teams transcript of the latest stand-up, lined up with its Start.
      if (cmd === 'read_transcript_file') {
        const rel = (s) => { const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return [h, m, x].map((n) => String(n).padStart(2, '0')).join(':') + '.000'; };
        return 'WEBVTT\\n\\n' + [[5, 'Alex Rivera', 'Morning all, three things today.'], [50, 'Alex Rivera', 'Atlas: the importer shipped on Monday.'], [80, 'Priya', 'Did the CSV path make it in?'], [300, 'Alex Rivera', 'Beacon, quickly: design review is Thursday.'], [560, 'Sam', 'Comet: cutover is the 12th.'], [2000, 'Sam', 'Said after Stop.']].map(([s, who, said], i) => (i + 1) + '\\n' + rel(s) + ' --> ' + rel(s + 3) + '\\n' + who + ': ' + said + '\\n').join('\\n'); }
      if (cmd === 'trash_session_files') return null;
      // Record my voice: ?rec=recording or paused shows the widget's dot; the editor asks once.
      if (cmd === 'recording_state') return query.get('rec') ? { state: query.get('rec'), deck: deckTalk.deckPath, name: '2026-10-28 09-00', why: '' } : null;
      if (cmd === 'microphone_status') return query.get('mic') ?? 'ask';
      if (cmd === 'write_quick_file') { quick[args.kind][qname(args.kind, args.path)] = { at: Date.now(), text: args.contents }; return null; }
      if (cmd === 'create_quick_file') { let name = args.name, i = 1; while (quick[args.kind][name]) name = args.name + ' ' + ++i; quick[args.kind][name] = { at: Date.now(), text: args.contents }; return qdir(args.kind) + name + qext[args.kind]; }
      if (cmd === 'rename_quick_file') { const from = qname(args.kind, args.path); quick[args.kind][args.name] = quick[args.kind][from]; delete quick[args.kind][from]; return qdir(args.kind) + args.name + qext[args.kind]; }
      if (cmd === 'trash_quick_file') { delete quick[args.kind][qname(args.kind, args.path)]; return null; }
      // Updates: a build with a feed; the newer release turns up once a step sets window.__updateFound.
      if (cmd === 'update_support') return { enabled: true, kind: 'installer' };
      if (cmd === 'check_for_update') return window.__updateFound ? { state: 'available', kind: 'installer', release: { version: '0.3.0', date: '2026-12-01T10:00:00Z', page: null, notes: 'Overlay opacity: a slider in Settings\\nThe Edge strip keeps to the bottom edge\\nFixed: bold inside italic in talking points' } } : { state: 'upToDate' };
      if (cmd === 'platform_info') return { os: 'macos', arch: 'aarch64' };
      if (cmd === 'paths_exist') return args.paths.map(() => true);
      // Workspaces (ADR 0040), from the list above.
      if (cmd === 'list_workspaces') return structuredClone(spaces);
      if (cmd === 'create_workspace') { const w = { id: 'w_new' + spaces.length + 'xx', folder: args.change.name, tags: [], decks: [], when: '', where: '', notes: '', problem: null, ...args.change }; spaces.push(w); return structuredClone(w); }
      if (cmd === 'update_workspace') { const w = spaces.find((x) => x.id === args.id); Object.assign(w, args.change); return structuredClone(w); }
      if (cmd === 'trash_workspace') { spaces = spaces.filter((x) => x.id !== args.id); return null; }
      // A deck's resources: a document, a web link and an alias.
      if (cmd === 'list_resources') return [
        { name: 'Q3 numbers.pdf', kind: 'file', size: 820000, modifiedMs: Date.now() },
        { name: 'docs.example.com plan.webloc', kind: 'link', size: 312, modifiedMs: Date.now() },
        { name: 'Board pack', kind: 'alias', size: null, modifiedMs: Date.now() },
      ];
      // The example deck, deleted, so Settings offers to put it back.
      if (cmd === 'missing_example_decks') return ['Welcome to Oversay'];
      if (cmd === 'install_example_decks') return [];
      if (cmd === 'demo_project_path') return '/Users/demo/Documents/Oversay/Projects/Oversay launch demo/Oversay launch demo.oversay.json';
      if (cmd === 'list_project_versions') return [0, 1, 26].map((h, i) => ({
        path: '/Users/demo/Documents/Versions/launch ' + i + '.oversay.json', savedAtMs: Date.now() - h * 3600e3 - 600e3 }));
      if (cmd === 'plugin:event|listen') { (handlers[args.event] ??= []).push(args.handler); return n++; }
      if (cmd === 'state_get') {
        if (args.channel === 'overlay-settings') return { version: 1, value: overlaySettings };
        // The Timeline's wave held on a point: ?look=<index>,<seconds>.
        if (args.channel === 'look-back') return query.get('look') ? { version: 1, value: { index: Number(query.get('look').split(',')[0]), seconds: Number(query.get('look').split(',')[1]) } } : null;
        return args.channel === 'session' && session ? { version, value: session } : null;
      }
      // A fake session engine: the clock is backdated so the screens show time passing.
      if (cmd === 'panel_shortcut') return 'Control+Alt+KeyP';
      if (cmd === 'session_open') {
        // A note or the control panel's preview starts at once (session.rs); a preview gives way to anything.
        if (args.mode === 'preview' && session && session.status !== 'finished' && !session.preview) throw new Error('A session is already running.');
        const now = args.mode === 'note' || args.mode === 'preview';
        session = { status: now ? 'running' : 'ready', index: 0, plan: args.plan, events: now ? [{ at: iso(40), type: 'start' }] : [], talk: args.talk, shortcuts: args.shortcuts, unavailable: [], paused: false, note: args.mode === 'note', preview: args.mode === 'preview' };
        broadcast();
      }
      if (cmd === 'session_toggle_pause' && session?.status === 'running') {
        session = { ...session, paused: !session.paused, events: [...session.events, { at: iso(0), type: session.paused ? 'resume' : 'pause' }] };
        broadcast();
      }
      if (cmd === 'session_next' && session?.paused) session = { ...session, paused: false, events: [...session.events, { at: iso(0), type: 'resume' }] };
      if (cmd === 'session_next' && session) {
        if (session.status === 'ready') { session = { ...session, status: 'running', events: [{ at: iso(200), type: 'start' }] }; }
        else if (session.index + 1 < session.plan.length) { session = { ...session, index: session.index + 1, events: [...session.events, { at: iso(70), type: 'next' }] }; }
        broadcast();
      }
      if (cmd === 'session_end' && session) { session = { ...session, status: 'finished', events: [...session.events, { at: iso(0), type: 'end' }] }; broadcast(); }
      if (cmd === 'session_close') { session = null; broadcast(); }
      return null;
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
})()`

// Each screen: how to get there from the previous one (run in the page).
const SCREENS = [
  ['home', `[...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes('Home')).click()`],
  // Decks: the list, and a deck in the deck editor with an option and a kind changed.
  // Workspaces (ADR 0040): every workspace, with its sidebar of tags; filtered to research; New
  // workspace; a workspace's page with a deck that has gone; Add decks; a deck's editor listing its
  // workspaces, with Add to workspace open.
  // The Library (epic 036 (#54)): the left pane's groups, a workspace's page with its description, + New and the command bar, the picker.
  ['library', `(async () => { const rail = (t) => [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes(t)); const wait = () => new Promise((r) => setTimeout(r, 250)); const pane = (t) => [...document.querySelectorAll('main .library .side .nav')].find((b) => b.textContent.includes(t)); const bar = () => document.querySelector('input[aria-label="Search Oversay"]'); const typeIn = async (v) => { const i = bar(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); await wait() }; const option = (t) => [...document.querySelectorAll('#search-results [role=option]')].find((b) => b.textContent.includes(t)); rail('Library').click(); await wait() })()`],
  ['library-pinned', `(async () => { const rail = (t) => [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes(t)); const wait = () => new Promise((r) => setTimeout(r, 250)); const pane = (t) => [...document.querySelectorAll('main .library .side .nav')].find((b) => b.textContent.includes(t)); const bar = () => document.querySelector('input[aria-label="Search Oversay"]'); const typeIn = async (v) => { const i = bar(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); await wait() }; const option = (t) => [...document.querySelectorAll('#search-results [role=option]')].find((b) => b.textContent.includes(t)); pane('Pinned').click(); await wait() })()`],
  ['library-week', `(async () => { const rail = (t) => [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes(t)); const wait = () => new Promise((r) => setTimeout(r, 250)); const pane = (t) => [...document.querySelectorAll('main .library .side .nav')].find((b) => b.textContent.includes(t)); const bar = () => document.querySelector('input[aria-label="Search Oversay"]'); const typeIn = async (v) => { const i = bar(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); await wait() }; const option = (t) => [...document.querySelectorAll('#search-results [role=option]')].find((b) => b.textContent.includes(t)); pane('This week').click(); await wait() })()`],
  ['library-unsorted', `(async () => { const rail = (t) => [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes(t)); const wait = () => new Promise((r) => setTimeout(r, 250)); const pane = (t) => [...document.querySelectorAll('main .library .side .nav')].find((b) => b.textContent.includes(t)); const bar = () => document.querySelector('input[aria-label="Search Oversay"]'); const typeIn = async (v) => { const i = bar(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); await wait() }; const option = (t) => [...document.querySelectorAll('#search-results [role=option]')].find((b) => b.textContent.includes(t)); pane('Unsorted').click(); await wait() })()`],
  ['library-all', `(async () => { const rail = (t) => [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes(t)); const wait = () => new Promise((r) => setTimeout(r, 250)); const pane = (t) => [...document.querySelectorAll('main .library .side .nav')].find((b) => b.textContent.includes(t)); const bar = () => document.querySelector('input[aria-label="Search Oversay"]'); const typeIn = async (v) => { const i = bar(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); await wait() }; const option = (t) => [...document.querySelectorAll('#search-results [role=option]')].find((b) => b.textContent.includes(t)); pane('All decks').click(); await wait() })()`],
  ['library-workspace', `(async () => { const rail = (t) => [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes(t)); const wait = () => new Promise((r) => setTimeout(r, 250)); const pane = (t) => [...document.querySelectorAll('main .library .side .nav')].find((b) => b.textContent.includes(t)); const bar = () => document.querySelector('input[aria-label="Search Oversay"]'); const typeIn = async (v) => { const i = bar(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); await wait() }; const option = (t) => [...document.querySelectorAll('#search-results [role=option]')].find((b) => b.textContent.includes(t)); pane('AppSec June 2026').click(); await wait() })()`],
  ['library-description-edit', `(async () => { const rail = (t) => [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes(t)); const wait = () => new Promise((r) => setTimeout(r, 250)); const pane = (t) => [...document.querySelectorAll('main .library .side .nav')].find((b) => b.textContent.includes(t)); const bar = () => document.querySelector('input[aria-label="Search Oversay"]'); const typeIn = async (v) => { const i = bar(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); await wait() }; const option = (t) => [...document.querySelectorAll('#search-results [role=option]')].find((b) => b.textContent.includes(t)); document.querySelector('main button.desc').click(); await wait() })()`],
  ['library-new', `(async () => { const rail = (t) => [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes(t)); const wait = () => new Promise((r) => setTimeout(r, 250)); const pane = (t) => [...document.querySelectorAll('main .library .side .nav')].find((b) => b.textContent.includes(t)); const bar = () => document.querySelector('input[aria-label="Search Oversay"]'); const typeIn = async (v) => { const i = bar(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); await wait() }; const option = (t) => [...document.querySelectorAll('#search-results [role=option]')].find((b) => b.textContent.includes(t)); document.querySelector('main textarea.desc-edit').dispatchEvent(new FocusEvent('blur')); await wait(); document.querySelector('.topbar button.new').click(); await wait(); bar().dispatchEvent(new FocusEvent('focus')); await wait() })()`],
  ['library-new-typed', `(async () => { const rail = (t) => [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes(t)); const wait = () => new Promise((r) => setTimeout(r, 250)); const pane = (t) => [...document.querySelectorAll('main .library .side .nav')].find((b) => b.textContent.includes(t)); const bar = () => document.querySelector('input[aria-label="Search Oversay"]'); const typeIn = async (v) => { const i = bar(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); await wait() }; const option = (t) => [...document.querySelectorAll('#search-results [role=option]')].find((b) => b.textContent.includes(t)); await typeIn('Retro') })()`],
  ['workspace-new', `(async () => { const rail = (t) => [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes(t)); const wait = () => new Promise((r) => setTimeout(r, 250)); const pane = (t) => [...document.querySelectorAll('main .library .side .nav')].find((b) => b.textContent.includes(t)); const bar = () => document.querySelector('input[aria-label="Search Oversay"]'); const typeIn = async (v) => { const i = bar(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); await wait() }; const option = (t) => [...document.querySelectorAll('#search-results [role=option]')].find((b) => b.textContent.includes(t)); await typeIn(''); option('Workspace').click(); await wait() })()`],
  ['picker', `(async () => { const rail = (t) => [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes(t)); const wait = () => new Promise((r) => setTimeout(r, 250)); const pane = (t) => [...document.querySelectorAll('main .library .side .nav')].find((b) => b.textContent.includes(t)); const bar = () => document.querySelector('input[aria-label="Search Oversay"]'); const typeIn = async (v) => { const i = bar(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); await wait() }; const option = (t) => [...document.querySelectorAll('#search-results [role=option]')].find((b) => b.textContent.includes(t)); document.querySelector('[role=dialog] button[type=button]')?.click(); [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Cancel').click(); await wait(); document.querySelector('.topbar button.new').click(); await wait(); bar().dispatchEvent(new FocusEvent('focus')); await wait(); option('template').click(); await wait() })()`],
  ['picker-meetings', `(async () => { const rail = (t) => [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes(t)); const wait = () => new Promise((r) => setTimeout(r, 250)); const pane = (t) => [...document.querySelectorAll('main .library .side .nav')].find((b) => b.textContent.includes(t)); const bar = () => document.querySelector('input[aria-label="Search Oversay"]'); const typeIn = async (v) => { const i = bar(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); await wait() }; const option = (t) => [...document.querySelectorAll('#search-results [role=option]')].find((b) => b.textContent.includes(t)); [...document.querySelectorAll('[role=dialog] .rowbtn')].find((b) => b.textContent.includes('Meetings')).click(); await wait() })()`],
  ['library-workspace-again', `(async () => { const rail = (t) => [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes(t)); const wait = () => new Promise((r) => setTimeout(r, 250)); const pane = (t) => [...document.querySelectorAll('main .library .side .nav')].find((b) => b.textContent.includes(t)); const bar = () => document.querySelector('input[aria-label="Search Oversay"]'); const typeIn = async (v) => { const i = bar(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); await wait() }; const option = (t) => [...document.querySelectorAll('#search-results [role=option]')].find((b) => b.textContent.includes(t)); [...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === 'Cancel').click(); await wait(); pane('AppSec June 2026').click(); await wait() })()`],
  // The sidebar (John, 27 Oct): a tag, Pinned, Recent, and a tag's ⋯ menu.
  // Adding a tag: the tags in use to pick from, narrowed by what is typed, or a new one (John, 26 Oct).
  ['workspace-tags', `(async () => { const i = document.querySelector('main input[aria-label="Add a tag"]'); i.focus(); i.dispatchEvent(new FocusEvent('focus')); await new Promise((r) => setTimeout(r, 200)) })()`],
  ['workspace-tags-typed', `(async () => { const i = document.querySelector('main input[aria-label="Add a tag"]'); i.value = 'tu'; i.dispatchEvent(new Event('input', { bubbles: true })); await new Promise((r) => setTimeout(r, 200)) })()`],
  ['workspace-add', `(async () => { const i = document.querySelector('main input[aria-label="Add a tag"]'); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await new Promise((r) => setTimeout(r, 150)); [...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Add decks')).click() })()`],
  // The workspace's Files and links tab (ADR 0046).
  ['workspace-files', `(async () => { [...document.querySelectorAll('main [role=tab]')].find((b) => b.textContent.includes('Files and links')).click(); await new Promise((r) => setTimeout(r, 300)) })()`],
  ['deck-workspaces', `(async () => { const wait = () => new Promise((r) => setTimeout(r, 250)); [...document.querySelectorAll('main [role=tab]')].find((b) => b.textContent.includes('Decks'))?.click(); await wait(); [...document.querySelectorAll('main .decklist button.what')].find((b) => b.textContent.includes('Atlas')).click(); await wait(); [...document.querySelectorAll('main [role=tab]')].find((b) => b.textContent.includes('Settings')).click(); await wait(); document.querySelector('main button.addto').click(); await wait() })()`],
  ['decks', `(async () => { const rail = (t) => [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes(t)); const wait = () => new Promise((r) => setTimeout(r, 250)); const pane = (t) => [...document.querySelectorAll('main .library .side .nav')].find((b) => b.textContent.includes(t)); const bar = () => document.querySelector('input[aria-label="Search Oversay"]'); const typeIn = async (v) => { const i = bar(); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); await wait() }; const option = (t) => [...document.querySelectorAll('#search-results [role=option]')].find((b) => b.textContent.includes(t)); rail('Library').click(); await wait(); pane('All decks').click(); await wait() })()`],
  ['deck', `[...document.querySelectorAll('main button.what')].find((b) => b.textContent.includes('Stand-up')).click()`],
  ['deck-options', `(async () => { const wait = () => new Promise((r) => setTimeout(r, 150)); const k = document.querySelector('select.tkind'); k.value = 'outro'; k.dispatchEvent(new Event('change', { bubbles: true })); await wait() })()`],
  // After the deck, below the cards: the latest run against the plan, and an earlier one.
  ['deck-after', `(async () => { document.querySelector('[aria-label="After the deck"]').scrollIntoView(); await new Promise((r) => setTimeout(r, 300)) })()`],
  // The deck editor's Settings page (ADR 0046): About, Timing, Recording, Look.
  ['deck-settings', `(async () => { [...document.querySelectorAll('main [role=tab]')].find((b) => b.textContent.includes('Settings')).click(); await new Promise((r) => setTimeout(r, 250)) })()`],
  ['deck-markdown', `(async () => { const wait = () => new Promise((r) => setTimeout(r, 250)); [...document.querySelectorAll('main [role=tab]')].find((b) => b.textContent.includes('Cards')).click(); await wait(); [...document.querySelectorAll('main .modes button')].find((b) => b.textContent.includes('Markdown')).click(); await wait() })()`],
  // back on Decks, Stand-up is in Recent; pin Weekly standup (it goes to the top).
  ['decks-pinned', `(async () => { const wait = () => new Promise((r) => setTimeout(r, 200)); [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes('Library')).click(); await wait(); [...document.querySelectorAll('main .library .side .nav')].find((b) => b.textContent.includes('All decks')).click(); await wait(); document.querySelector('button[aria-label="Pin Weekly standup"]').click(); await wait() })()`],
  // the list filtered to one tag, then to a project.
  // the one search bar finds decks, projects, templates and settings, grouped.
  ['search-results', `(async () => { const wait = () => new Promise((r) => setTimeout(r, 200)); const i = document.querySelector('input[aria-label="Search Oversay"]'); i.focus(); i.dispatchEvent(new FocusEvent('focus')); i.value = 'st'; i.dispatchEvent(new Event('input', { bubbles: true })); await wait() })()`],
  // workspaces are found too, by name and tag.
  ['search-workspaces', `(async () => { const wait = () => new Promise((r) => setTimeout(r, 200)); const i = document.querySelector('input[aria-label="Search Oversay"]'); i.focus(); i.dispatchEvent(new FocusEvent('focus')); i.value = 'a'; i.dispatchEvent(new Event('input', { bubbles: true })); await wait() })()`],
  ['decks-filter-open', `(async () => { const wait = () => new Promise((r) => setTimeout(r, 200)); const i = document.querySelector('input[aria-label="Search Oversay"]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); i.dispatchEvent(new FocusEvent('blur')); document.querySelector('main .ftoggle').click(); await wait() })()`],
  ['decks-filtered', `(async () => { const wait = () => new Promise((r) => setTimeout(r, 200)); const chip = (t) => [...document.querySelectorAll('main .fpanel .fchip')].find((b) => b.textContent.trim() === t); chip('weekly').click(); await wait() })()`],
  ['decks-project', `(async () => { const wait = () => new Promise((r) => setTimeout(r, 200)); const chip = (t) => [...document.querySelectorAll('main .fpanel .fchip')].find((b) => b.textContent.trim() === t); chip('weekly').click(); chip('AppSec June 2026').click(); await wait(); document.querySelector('main .ftoggle').click(); await wait() })()`],
  ['decks-cleared', `(async () => { [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === 'Clear').click(); await new Promise((r) => setTimeout(r, 200)) })()`],
  // A deck's ⋯ menu: Rename and Delete.
  ['decks-menu', `(async () => { document.querySelector('main button[aria-label="More actions for Investor update"]').click(); await new Promise((r) => setTimeout(r, 200)) })()`],
  // a link asks before it puts a note on screen.
  ['link-ask', `(async () => { window.__link('oversay://notes/Weekly%20standup/show'); await new Promise((r) => setTimeout(r, 300)) })()`],
  ['link-asked-open', `(async () => { [...document.querySelectorAll('[role=alertdialog] button')].find((b) => b.textContent.includes('Just open it')).click(); await new Promise((r) => setTimeout(r, 300)) })()`],
  // task 156, task 208: the AI page with no AI app here; then found, one row opened; Install for Claude
  // Code, then a note arrives; the Claude app's plugin saved; Home's card once installed.
  ['ai-none', `(async () => { window.__noAi(); [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes('AI')).click(); await new Promise((r) => setTimeout(r, 300)) })()`],
  ['ai', `(async () => { const wait = () => new Promise((r) => setTimeout(r, 200)); window.__noAi(false); [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes('Home')).click(); await wait(); [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes('AI')).click(); await wait() })()`],
  ['ai-details', `(async () => { [...document.querySelectorAll('main button.toggle')].find((b) => b.textContent.includes('Codex')).click(); await new Promise((r) => setTimeout(r, 200)) })()`],
  ['ai-installed', `(async () => { [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === 'Install').click(); await new Promise((r) => setTimeout(r, 300)) })()`],
  ['ai-arrived', `(async () => { window.__outside('decks', 'Board prep', '## Numbers [10m]\\n- Q3 revenue\\n'); await new Promise((r) => setTimeout(r, 400)) })()`],
  ['ai-plugin-saved', `(async () => { [...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Save plugin')).click(); await new Promise((r) => setTimeout(r, 300)) })()`],
  // Gemini CLI shown though not here (it reads Codex's copy), and the Gemini app's skill saved.
  ['ai-gemini', `(async () => { const wait = () => new Promise((r) => setTimeout(r, 250)); [...document.querySelectorAll('main button.folded')].forEach((b) => b.click()); await wait(); [...document.querySelectorAll('main button.toggle')].find((b) => b.textContent.includes('Gemini CLI')).click(); [...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Save skill')).click(); await wait(); document.querySelector('main button.toggle[aria-expanded="true"]')?.scrollIntoView() })()`],
  ['home-ai', `[...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes('Home')).click()`],
  // a note file from Downloads dropped on the window; the same name again; Markdown pasted.
  ['drop-over', `(async () => { [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes('Home')).click(); await new Promise((r) => setTimeout(r, 200)); window.__drag('enter', ['/Users/demo/Downloads/Design review.md', '/Users/demo/Downloads/invoice-0931.pdf']); await new Promise((r) => setTimeout(r, 200)) })()`],
  ['drop-added', `(async () => { window.__drag('drop', ['/Users/demo/Downloads/Design review.md']); await new Promise((r) => setTimeout(r, 400)) })()`],
  ['drop-clash', `(async () => { window.__drag('drop', ['/Users/demo/Downloads/Design review.md']); await new Promise((r) => setTimeout(r, 400)) })()`],
  ['paste-deck', `(async () => { window.__clipboard('# Investor call\\n\\n## Numbers [10m]\\n- Q3 revenue up 18%\\n- Burn down to 9 months\\n\\n## Ask\\n- Bridge round timing\\n'); [...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Paste as deck')).click(); await new Promise((r) => setTimeout(r, 400)) })()`],
  // task 210, task 224: copies updated when Oversay started; a deck from an older skill arrives, with lines
  // Oversay shows differently from how the AI wrote them.
  ['ai-self-updated', `(async () => { const wait = () => new Promise((r) => setTimeout(r, 200)); window.__skillsUpdated(['claude-code', 'codex']); [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes('Home')).click(); await wait(); [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes('AI')).click(); await wait() })()`],
  ['deck-old-skill', `(async () => { const wait = () => new Promise((r) => setTimeout(r, 250)); window.__skillsUpdated([]); window.__outside('decks', 'Design crit', '---\\nwhen: Thursday\\ntimeline: sparkline\\nmade-with: Oversay skill 0.0.9\\n---\\n\\n## Flows [10 mins]\\n- Checkout\\n### Open questions\\n- Who signs off\\n'); await wait(); [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes('Library')).click(); await wait(); [...document.querySelectorAll('main .library .side .nav')].find((b) => b.textContent.includes('All decks')).click(); await wait(); [...document.querySelectorAll('main button.what')].find((b) => b.textContent.includes('Design crit')).click(); await wait() })()`],
  ['deck-skill-check', `(async () => { const wait = () => new Promise((r) => setTimeout(r, 250)); [...document.querySelectorAll('main button')].find((b) => b.textContent.includes('What and where'))?.click(); await wait() })()`],
  // Sessions (ADR 0041): every deck's runs by day; filtered to a deck; found by the search bar.
  ['sessions', `(async () => { [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes('Sessions')).click(); await new Promise((r) => setTimeout(r, 300)) })()`],
  ['sessions-filter', `(async () => { const wait = () => new Promise((r) => setTimeout(r, 200)); document.querySelector('main .ftoggle').click(); await wait(); [...document.querySelectorAll('main .fpanel .fchip')].find((b) => b.textContent.trim() === 'Atlas launch review').click(); await wait() })()`],
  ['sessions-filtered', `(async () => { document.querySelector('main .ftoggle').click(); await new Promise((r) => setTimeout(r, 200)) })()`],
  ['sessions-search', `(async () => { const wait = () => new Promise((r) => setTimeout(r, 200)); [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === 'Clear').click(); await wait(); const i = document.querySelector('input[aria-label="Search Oversay"]'); i.focus(); i.dispatchEvent(new FocusEvent('focus')); i.value = 'atlas'; i.dispatchEvent(new Event('input', { bubbles: true })); await wait() })()`],
  ['sessions-search-done', `(async () => { const i = document.querySelector('input[aria-label="Search Oversay"]'); i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); i.dispatchEvent(new FocusEvent('blur')); await new Promise((r) => setTimeout(r, 150)) })()`],
  ['session', `(async () => { document.querySelector('main .runs button.open').click(); await new Promise((r) => setTimeout(r, 300)) })()`],
  ['session-drop-over', `(async () => { window.__drag('enter', ['/Users/demo/Downloads/Weekly stand-up.vtt']); await new Promise((r) => setTimeout(r, 200)) })()`],
  ['session-transcript-check', `(async () => { window.__drag('drop', ['/Users/demo/Downloads/Weekly stand-up.vtt']); await new Promise((r) => setTimeout(r, 400)); document.querySelector('main .ask').scrollIntoView() })()`],
  ['session-transcript', `(async () => { [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === 'Save transcript').click(); await new Promise((r) => setTimeout(r, 400)); document.querySelector('main .tcard')?.scrollIntoView() })()`],
  ['session-review-ask', `(async () => { [...document.querySelectorAll('main button')].find((b) => b.textContent.includes('Review with your AI')).click(); await new Promise((r) => setTimeout(r, 300)); document.querySelector('main .copied')?.scrollIntoView() })()`],
  ['session-review', `(async () => { window.__review(); document.querySelector('.topbar button.back').click(); await new Promise((r) => setTimeout(r, 300)); document.querySelector('main .runs button.open').click(); await new Promise((r) => setTimeout(r, 500)); [...document.querySelectorAll('main h2')].find((h) => h.textContent.trim() === 'Review')?.scrollIntoView() })()`],
  ['session-menu', `(async () => { document.querySelector('main').scrollTop = 0; await new Promise((r) => setTimeout(r, 100)) })()`],
  ['session-menu-open', `(async () => { document.querySelector('main button[aria-label="More actions for this session"]').click(); await new Promise((r) => setTimeout(r, 200)) })()`],
  ['session-delete', `(async () => { [...document.querySelectorAll('main [role=menuitem]')].find((b) => b.textContent.includes('Delete session')).click(); await new Promise((r) => setTimeout(r, 200)) })()`],
  ['session-recording', `(async () => { const wait = () => new Promise((r) => setTimeout(r, 300)); [...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === 'Cancel')?.click(); document.querySelector('.topbar button.back').click(); await wait(); [...document.querySelectorAll('main .runs button.open')].find((b) => b.textContent.includes('Atlas')).click(); await wait(); await wait(); document.querySelector('main .ask')?.scrollIntoView() })()`],
  ['session-back', `(async () => { document.querySelector('.topbar button.back').click(); await new Promise((r) => setTimeout(r, 300)) })()`],
  ['templates', `[...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes('Templates')).click()`],
  ['templates-meetings', `[...document.querySelectorAll('main .rowbtn')].find((b) => b.textContent.includes('Meetings')).click()`],
  ['templates-mine', `[...document.querySelectorAll('main .rowbtn')].find((b) => b.textContent.includes('My templates')).click()`],
  ['templates-category', `[...document.querySelectorAll('main .rowbtn')].find((b) => b.textContent.includes('Client work')).click()`],
  ['templates-category-menu', `(async () => { document.querySelector('main button[aria-label="More for Client work"]').click(); await new Promise((r) => setTimeout(r, 200)) })()`],
  ['templates-category-delete', `(async () => { [...document.querySelectorAll('main [role=menuitem]')].find((b) => b.textContent.includes('Delete category')).click(); await new Promise((r) => setTimeout(r, 200)) })()`],
  ['templates-template-delete', `(async () => { document.querySelector('[role=alertdialog] button').click(); await new Promise((r) => setTimeout(r, 150)); document.querySelector('main button[aria-label^="Delete "]').click(); await new Promise((r) => setTimeout(r, 200)) })()`],
  ['settings', `[...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes('Settings')).click()`],
  // 013/02: the section list: jump to Shortcuts, scroll to the end, and (narrow) the open menu.
  // Each step runs at the widest size and the picture is then taken at each width.
  ['settings-overlays', `(async () => { [...document.querySelectorAll('.toc ul button')].find((b) => b.textContent.trim() === 'Overlays').click(); await new Promise((r) => setTimeout(r, 900)) })()`],
  // Settings › Recordings, with Auto record turned on.
  ['settings-recordings', `(async () => { const wait = () => new Promise((r) => setTimeout(r, 900)); [...document.querySelectorAll('.toc ul button')].find((b) => b.textContent.trim() === 'Recordings').click(); await wait(); document.querySelector('#recordings input[role=switch]').click(); await new Promise((r) => setTimeout(r, 300)) })()`],
  ['settings-jump', `(async () => { [...document.querySelectorAll('.toc ul button')].find((b) => b.textContent.trim() === 'Shortcuts').click(); await new Promise((r) => setTimeout(r, 900)) })()`],
  ['settings-end', `(async () => { const m = document.querySelector('main'); m.scrollTop = m.scrollHeight; await new Promise((r) => setTimeout(r, 150)) })()`],
  // 013/03: About, and its page of third-party licences.
  ['settings-about', `(async () => { document.querySelector('main').scrollTop = 0; await new Promise((r) => setTimeout(r, 100)); [...document.querySelectorAll('.toc ul button')].find((b) => b.textContent.trim() === 'About').click(); await new Promise((r) => setTimeout(r, 900)) })()`],
  ['settings-licences', `[...document.querySelectorAll('main button')].find((b) => b.textContent.includes('View third-party licences')).click()`],
  ['settings-licences-search', `(() => { const i = document.querySelector('main input[type=search]'); i.value = 'tauri'; i.dispatchEvent(new Event('input', { bubbles: true })) })()`],
  ['settings-licences-back', `document.querySelector('.topbar button.back').click()`],
  ['settings-menu', `(async () => { document.querySelector('main').scrollTop = 0; await new Promise((r) => setTimeout(r, 150)); document.querySelector('.toc .menubtn').click() })()`],
  ['settings-menu-closed', `document.querySelector('.toc .menubtn').click()`],
  ['settings-shortcut', `[...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === 'Change').click()`],
  // Updates: nothing newer, said plainly after Check for updates; then a newer release, with the rail's item and the header's pill.
  ['settings-updates', `(async () => { document.querySelector('main').scrollTop = 0; await new Promise((r) => setTimeout(r, 100)); [...document.querySelectorAll('.toc ul button')].find((b) => b.textContent.trim() === 'Updates').click(); await new Promise((r) => setTimeout(r, 700)); [...document.querySelectorAll('#updates button')].find((b) => b.textContent.includes('Check for updates')).click(); await new Promise((r) => setTimeout(r, 300)) })()`],
  ['settings-updates-found', `(async () => { window.__updateFound = true; [...document.querySelectorAll('#updates button')].find((b) => b.textContent.includes('Check for updates')).click(); await new Promise((r) => setTimeout(r, 500)) })()`],
]

const children = []
function stopAll() {
  for (const child of children) child.kill()
}
process.on('exit', stopAll)

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

const vite = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
  cwd: join(root, 'app'),
  env: { ...process.env, OVERSAY_DEV_PORT: String(port) },
  stdio: 'ignore',
})
children.push(vite)
await waitFor(`http://localhost:${port}/`)

const profile = mkdtempSync(join(tmpdir(), 'oversay-shots-'))
const chrome = spawn(chromePath, ['--headless=new', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank'], {
  stdio: 'ignore',
})
children.push(chrome)
const targets = await (await waitFor(`http://127.0.0.1:${debugPort}/json`)).json()
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))

let seq = 0
const pending = new Map()
const errors = []
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data)
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg)
    pending.delete(msg.id)
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.source === 'security') errors.push(msg.params.entry.text)
  if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text)
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '))
  }
})
const send = (method, params = {}) =>
  new Promise((r) => {
    const id = ++seq
    pending.set(id, r)
    ws.send(JSON.stringify({ id, method, params }))
  })
const run = async (expression) => {
  const reply = await send('Runtime.evaluate', { expression, awaitPromise: true })
  const failure = reply.result?.exceptionDetails
  // The page's own errors so far say why a step found nothing to click.
  if (failure) throw new Error(`step failed: ${expression}\n${failure.exception?.description ?? failure.text}${errors.length ? `\npage errors:\n${errors.join('\n')}` : ''}`)
}

await send('Runtime.enable')
await send('Page.enable')
await send('Log.enable')
await send('Page.addScriptToEvaluateOnNewDocument', { source: fakeBridge })
await send('Emulation.setDeviceMetricsOverride', { width: WIDTHS[0], height: HEIGHT, deviceScaleFactor: 2, mobile: false })
await send('Page.navigate', { url: `http://localhost:${port}/` })
// The manager is up once its rail is: a cold dev server can take longer than a fixed wait.
for (let waited = 0; waited < 30000; waited += 250) {
  const up = await send('Runtime.evaluate', { expression: `!!document.querySelector('nav.rail')` })
  if (up.result?.result?.value) break
  await sleep(250)
}
await sleep(500)

const written = []
// One picture of the page as it is, at each width, in light and dark.
async function shoot(name) {
  if (!wanted(name)) return
  for (const width of WIDTHS) {
    for (const scheme of SCHEMES) {
      await send('Emulation.setDeviceMetricsOverride', { width, height: HEIGHT, deviceScaleFactor: 2, mobile: false })
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] })
      await sleep(250)
      const { result } = await send('Page.captureScreenshot', { format: 'png' })
      const file = join(out, `${name}-${width}-${scheme}.png`)
      writeFileSync(file, Buffer.from(result.data, 'base64'))
      written.push(file)
    }
  }
}
for (const [name, step] of SCREENS) {
  await send('Emulation.setDeviceMetricsOverride', { width: WIDTHS[0], height: HEIGHT, deviceScaleFactor: 2, mobile: false })
  await run(step)
  await sleep(500)
  await shoot(name)
}

// The Library with nothing in it (a first run), with one deck, and with 60 decks in 12 workspaces
// (epic 036 (#54)): Home must stay calm in all three, and the Library's left pane must keep to a few.
for (const variant of ['empty', 'one', 'many']) {
  await send('Page.navigate', { url: `http://localhost:${port}/?library=${variant}` })
  for (let waited = 0; waited < 30000; waited += 250) {
    const up = await send('Runtime.evaluate', { expression: `!!document.querySelector('nav.rail')` })
    if (up.result?.result?.value) break
    await sleep(250)
  }
  await sleep(900)
  await shoot(`home-${variant}`)
  await run(`(async () => { [...document.querySelectorAll('nav.rail button')].find((b) => b.textContent.includes('Library')).click(); await new Promise((r) => setTimeout(r, 400)) })()`)
  await shoot(`library-${variant}`)
}

if (wanted('overlay')) {
// Overlays: each plugin's window, at the size the plugin asks for, in each session state, over a
// light and a dark slide. Variants (the Timeline's style, ring or gauge, its button tab on top) are
// sent as the overlay-settings channel, and checked on the page so a renamed key fails loudly.
const OVERLAYS = ['timeline']
const STATES = ['ready', 'running', 'overrun', 'demo', 'paused', 'wrapup', 'talkover', 'finished']
const SLIDES = { light: '#f4f1ea', dark: '#11151c' }
const VARIANT_SHOWN = {}
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value
// The Timeline has two styles since decks replaced the others (ADR 0036), each its own
// window: the waveform in every state, with the Light panel too, and the edge strip.
const LIGHT = ['ready', 'running', 'overrun', 'paused', 'finished'].map((s) => [s, 'bar', 'bottom', 'light'])
const STYLES = {
  waveform: { variants: LIGHT },
  strip: { variants: [] },
}
for (const id of OVERLAYS) {
  await send('Page.navigate', { url: `http://localhost:${port}/?overlay=${id}&state=ready` })
  await sleep(1200)
  for (const [style, { variants }] of Object.entries(STYLES)) {
    const size = await evaluate(`import('/src/plugins/registry.ts').then(({ getPlugin }) => getPlugin('${id}').windowFor({ timelineStyle: '${style}' }))`)
    if (!size?.width) throw new Error(`no window size for overlay ${id} style ${style}`)
    await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 2, mobile: false })
    for (const [state, indicator, notch = 'bottom', asked] of [...STATES.map((s) => [s, 'bar']), ...variants]) {
      const panel = asked ?? 'dark'
      await send('Page.navigate', { url: `http://localhost:${port}/?overlay=${id}&state=${state}&indicator=${indicator}&notch=${notch}&style=${style}&panel=${panel}` })
      await sleep(1200)
      for (const variant of [indicator, notch]) {
        const selector = VARIANT_SHOWN[variant]
        if (selector && !(await evaluate(`!!document.querySelector('${selector}')`))) {
          throw new Error(`overlay ${id} ${style} (${state}): asked for ${variant} but ${selector} isn't on the page; did the overlay-settings channel change?`)
        }
      }
      for (const [slide, colour] of Object.entries(SLIDES)) {
        await run(`document.documentElement.style.setProperty('background', '${colour}', 'important')`)
        await sleep(150)
        const { result } = await send('Page.captureScreenshot', { format: 'png' })
        const file = join(out, `overlay-${id}${style === 'waveform' ? '' : '-' + style}-${state}${indicator === 'bar' ? '' : '-' + indicator}${notch === 'top' ? '-notch-top' : ''}${asked ? '-' + asked + '-panel' : ''}-${slide}.png`)
        writeFileSync(file, Buffer.from(result.data, 'base64'))
        written.push(file)
      }
    }
  }
}

// The waveform with its buttons hidden (the capsule keeps the talk's name).
{
  const size = await evaluate(`import('/src/plugins/registry.ts').then(({ getPlugin }) => getPlugin('timeline').windowFor({ timelineStyle: 'waveform' }))`)
  await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 2, mobile: false })
  for (const [name, params] of [['buttons-hidden', 'state=running&buttons=hidden']]) {
    await send('Page.navigate', { url: `http://localhost:${port}/?overlay=timeline&style=waveform&${params}` })
    await sleep(1200)
    for (const [slide, colour] of Object.entries(SLIDES)) {
      await run(`document.documentElement.style.setProperty('background', '${colour}', 'important')`)
      await sleep(150)
      const { result } = await send('Page.captureScreenshot', { format: 'png' })
      const file = join(out, `overlay-timeline-${name}-${slide}.png`)
      writeFileSync(file, Buffer.from(result.data, 'base64'))
      written.push(file)
    }
  }
}

// Looking back: the waveform held on an earlier point, pressed as a person would, and
// Talking Points showing the segment looked at.
{
  const size = await evaluate(`import('/src/plugins/registry.ts').then(({ getPlugin }) => getPlugin('timeline').windowFor({ timelineStyle: 'waveform' }))`)
  await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 2, mobile: false })
  await send('Page.navigate', { url: `http://localhost:${port}/?overlay=timeline&style=waveform&state=running` })
  await sleep(1200)
  const box = await evaluate(`(() => { const r = document.querySelector('[data-hold]').getBoundingClientRect(); return { x: r.left + r.width * 0.05, y: r.top + r.height / 2 } })()`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(300)
  for (const [slide, colour] of Object.entries(SLIDES)) {
    await run(`document.documentElement.style.setProperty('background', '${colour}', 'important')`)
    await sleep(150)
    const { result } = await send('Page.captureScreenshot', { format: 'png' })
    const file = join(out, `overlay-timeline-look-back-${slide}.png`)
    writeFileSync(file, Buffer.from(result.data, 'base64'))
    written.push(file)
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', buttons: 0, clickCount: 1 })
  const tp = await evaluate(`import('/src/plugins/registry.ts').then(({ getPlugin }) => getPlugin('talking-points').window)`)
  await send('Emulation.setDeviceMetricsOverride', { width: tp.width, height: tp.height, deviceScaleFactor: 2, mobile: false })
  await send('Page.navigate', { url: `http://localhost:${port}/?overlay=talking-points&state=running&look=0,60` })
  await sleep(1200)
  for (const [slide, colour] of Object.entries(SLIDES)) {
    await run(`document.documentElement.style.setProperty('background', '${colour}', 'important')`)
    await sleep(150)
    const { result } = await send('Page.captureScreenshot', { format: 'png' })
    const file = join(out, `overlay-talking-points-look-back-${slide}.png`)
    writeFileSync(file, Buffer.from(result.data, 'base64'))
    written.push(file)
  }
}

// Talking Points: one style, at the window its plugin asks for, in each session state.
{
  const id = 'talking-points'
  await send('Page.navigate', { url: `http://localhost:${port}/?overlay=${id}&state=ready` })
  await sleep(1200)
  const size = await evaluate(`import('/src/plugins/registry.ts').then(({ getPlugin }) => getPlugin('${id}').window)`)
  if (!size?.width) throw new Error(`no window size for overlay ${id}`)
  await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 2, mobile: false })
  for (const state of ['ready', 'running', 'long', 'empty', 'md', 'demo', 'note', 'finished']) {
    await send('Page.navigate', { url: `http://localhost:${port}/?overlay=${id}&state=${state}` })
    await sleep(1200)
    for (const [slide, colour] of Object.entries(SLIDES)) {
      await run(`document.documentElement.style.setProperty('background', '${colour}', 'important')`)
      await sleep(150)
      const { result } = await send('Page.captureScreenshot', { format: 'png' })
      const file = join(out, `overlay-${id}-${state}-${slide}.png`)
      writeFileSync(file, Buffer.from(result.data, 'base64'))
      written.push(file)
    }
  }  // The look: the dark and light panels, large text, every part with this one open;
  // and with the waveform (the default) light, and see-through at its lowest, 50%.
  for (const [name, params] of [['dark', 'style=strip&panel=dark&solid=0'], ['light', 'style=strip&panel=light&solid=0'], ['large', 'size=l'], ['every', 'layout=all'], ['light-every', 'style=wave&panel=light&solid=0&layout=all&size=s'], ['waveform-light', 'panel=light'], ['see-through', 'solid=0&opacity=50']]) {
    await send('Page.navigate', { url: `http://localhost:${port}/?overlay=${id}&state=running&${params}` })
    await sleep(1200)
    for (const [slide, colour] of Object.entries(SLIDES)) {
      await run(`document.documentElement.style.setProperty('background', '${colour}', 'important')`)
      await sleep(150)
      const { result } = await send('Page.captureScreenshot', { format: 'png' })
      const file = join(out, `overlay-${id}-look-${name}-${slide}.png`)
      writeFileSync(file, Buffer.from(result.data, 'base64'))
      written.push(file)
    }
  }
}

// The flashcard widget: a deck in each state, Dark and Light, the bar at the bottom or
// the top, colour by kind or one colour.
{
  const id = 'flashcard'
  await send('Page.navigate', { url: `http://localhost:${port}/?overlay=${id}&state=deck-ready` })
  await sleep(1200)
  const size = await evaluate(`import('/src/plugins/registry.ts').then(({ getPlugin }) => getPlugin('${id}').window)`)
  if (!size?.width) throw new Error(`no window size for overlay ${id}`)
  await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 2, mobile: false })
  const cases = [
    ...['deck-ready', 'deck-running', 'deck-warn', 'deck-paused', 'deck-untimed', 'deck-last', 'finished'].map((state) => [state, `state=${state}`]),
    ['deck-waiting', 'state=deck-waiting&auto=off'],
    ['deck-running-light', 'state=deck-running&panel=light'],
    ['deck-running-one-colour', 'state=deck-running&colour=one'],
    ['deck-ready-light', 'state=deck-ready&panel=light'],
    // a quiet card for a 1:1: no position, next card, time left or end time.
    ['deck-running-quiet', 'state=deck-running&hide=position,next,left,ends'],
  ]
  for (const [name, params] of cases) {
    await send('Page.navigate', { url: `http://localhost:${port}/?overlay=${id}&${params}` })
    await sleep(1200)
    for (const [slide, colour] of Object.entries(SLIDES)) {
      await run(`document.documentElement.style.setProperty('background', '${colour}', 'important')`)
      await sleep(150)
      const { result } = await send('Page.captureScreenshot', { format: 'png' })
      const file = join(out, `overlay-${id}-${name}-${slide}.png`)
      writeFileSync(file, Buffer.from(result.data, 'base64'))
      written.push(file)
    }
  }
}

// The deck widget's Agenda view (ADR 0042): every card along the bottom, in its own window size;
// and both views pointed at, to see the switch beside ✕.
{
  const id = 'flashcard'
  const cases = [
    ['agenda', 'agenda', 'state=deck-running', false],
    ['agenda-ready', 'agenda', 'state=deck-ready', false],
    ['agenda-light', 'agenda', 'state=deck-running&panel=light', false],
    ['agenda-one-colour', 'agenda', 'state=deck-running&colour=one', false],
    ['agenda-warn', 'agenda', 'state=deck-warn', false],
    ['agenda-pointed', 'agenda', 'state=deck-running', true],
    ['card-pointed', 'card', 'state=deck-running', true],
    ['card-pointed-light', 'card', 'state=deck-running&panel=light', true],
    // Record my voice (ADR 0041, 0042): the record button left of the switch, red while it
    // records, dimmed while paused, grey when not.
    ['card-recording', 'card', 'state=deck-running&rec=recording', false],
    ['card-recording-paused', 'card', 'state=deck-paused&rec=paused', false],
    ['card-recording-stopped', 'card', 'state=deck-running&rec=stopped', false],
    // every deck has the button, grey until pressed; struck through when the microphone is refused.
    ['card-not-recording', 'card', 'state=deck-running', false],
    ['card-recording-refused', 'card', 'state=deck-running&rec=refused', false],
    ['card-recording-light', 'card', 'state=deck-running&rec=recording&panel=light', true],
    ['agenda-recording', 'agenda', 'state=deck-running&rec=recording', true],
    ['agenda-recording-stopped-light', 'agenda', 'state=deck-running&rec=stopped&panel=light', false],
  ]
  for (const [name, view, params, pointed] of cases) {
    const size = await evaluate(`import('/src/plugins/flashcard/index.ts').then(({ deckWidgetWindow }) => deckWidgetWindow('${view}'))`)
    if (!size?.width) throw new Error(`no window size for ${id} ${view}`)
    await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 2, mobile: false })
    await send('Page.navigate', { url: `http://localhost:${port}/?overlay=${id}&view=${view}&${params}` })
    await sleep(1200)
    // As if the pointer were over it: the host's ✕ and the switch show.
    if (pointed) await run(`document.head.insertAdjacentHTML('beforeend', '<style>.corner, .switch { opacity: 1 !important; transition: none !important } .tb { transform: none !important; transition: none !important }</style>')`)
    for (const [slide, colour] of Object.entries(SLIDES)) {
      const file = join(out, `overlay-deck-widget-${name}-${slide}.png`)
      if (!wanted(`overlay-deck-widget-${name}-${slide}`)) continue
      await run(`document.documentElement.style.setProperty('background', '${colour}', 'important')`)
      await sleep(150)
      const { result } = await send('Page.captureScreenshot', { format: 'png' })
      writeFileSync(file, Buffer.from(result.data, 'base64'))
      written.push(file)
    }
  }
}

// Every overlay at the lowest opacity, over both slides: the text must still read.
for (const [id, style] of [['talking-points', null], ['timeline', 'waveform'], ['timeline', 'strip']]) {
  const size = await evaluate(`import('/src/plugins/registry.ts').then(({ getPlugin }) => { const p = getPlugin('${id}'); return p.windowFor ? p.windowFor({ timelineStyle: '${style}', stripEdge: 'screen' }) : p.window })`)
  await send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 2, mobile: false })
  await send('Page.navigate', { url: `http://localhost:${port}/?overlay=${id}&state=running&style=${style ?? 'strip'}&opacity=40&solid=0&panel=dark` })
  await sleep(1200)
  for (const [slide, colour] of Object.entries(SLIDES)) {
    await run(`document.documentElement.style.setProperty('background', '${colour}', 'important')`)
    await sleep(150)
    const { result } = await send('Page.captureScreenshot', { format: 'png' })
    const file = join(out, `overlay-${id}${style && style !== 'waveform' ? '-' + style : ''}-opacity40-${slide}.png`)
    writeFileSync(file, Buffer.from(result.data, 'base64'))
    written.push(file)
  }
}


}

// The control panel: docked at the right edge, in each kind of run and with none.
if (wanted('panel')) {
  await send('Emulation.setDeviceMetricsOverride', { width: 330, height: 860, deviceScaleFactor: 2, mobile: false })
  for (const state of ['none', 'ready', 'running', 'paused', 'note']) {
    for (const scheme of SCHEMES) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }] })
      await send('Page.navigate', { url: `http://localhost:${port}/?window=control-panel${state === 'none' ? '' : '&state=' + state}` })
      await sleep(1200)
      const { result } = await send('Page.captureScreenshot', { format: 'png' })
      const file = join(out, `panel-${state}-${scheme}.png`)
      writeFileSync(file, Buffer.from(result.data, 'base64'))
      written.push(file)
    }
  }
}

ws.close()
const chromeExited = new Promise((r) => chrome.once('exit', r))
stopAll()
await chromeExited
// Chrome can still be flushing its throwaway profile; it lives in the temp folder either way.
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
} catch {}
console.log(`${written.length} screenshots in ${out}`)
if (errors.length) {
  console.error(`console errors:\n${errors.map((e) => `  ${e}`).join('\n')}`)
  process.exit(1)
}
