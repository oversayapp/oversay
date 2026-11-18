<script lang="ts">
  // The AI page (ADR 0033):
  // one row per AI app, one app at a time, each with one button and its details inside. Oversay
  // installs the skill it carries into the apps on this computer; for chat apps it saves the skill
  // or copies instructions, and the person says when they've added it. Once an app is Ready, Try
  // it sits at the top and watches for the first note.
  import { onMount } from 'svelte'
  import { save } from '@tauri-apps/plugin-dialog'
  import { openUrl } from '@tauri-apps/plugin-opener'
  import { logAction } from '../lib/log'
  import { readQuickFile } from '../lib/notes/files'
  import { parseNoteDoc } from '../lib/notes/format'
  import { showBlockedBy } from '../lib/notes/show'
  import { showDeckOnScreen } from '../lib/decks/show'
  import { decks } from '../lib/decks/store'
  import { session } from '../lib/session/store'
  import { freshPaths, markAiPageSeen, markOpened, setChatAppAdded, settings } from '../lib/settings/store'
  import { addedChatApps, chatAppsToUpdate, planAiPage, type AiApp, type ChatApp } from '../lib/skill/page'
  import {
    installSkill,
    removeSkill,
    revealSkill,
    saveSkillZip,
    sharing,
    skillState,
    skillTargets,
    SKILL_TARGETS,
    TARGET_LABELS,
    type SkillTarget,
    type SkillTargets,
    type ZipKind,
  } from '../lib/skill/targets'
  import { chatInstructions } from '../lib/skill/chatgpt'
  import { claudeCodeInstallPrompt, codexInstallPrompt, marketplaceAddress } from '../lib/skill/install'
  import { attempt } from './errors'
  import Icon from './Icon.svelte'
  import { goDeck } from './route'

  let info = $state<SkillTargets | null>(null)
  /** Rows showing their details. */
  let open = $state<Partial<Record<AiApp, boolean>>>({})
  /** Command-line apps not on this computer, shown after "Show". */
  let showAway = $state(false)
  let showAllPrompts = $state(false)
  /** A row asking before it replaces or removes a copy. */
  let confirming = $state<{ target: SkillTarget; action: 'replace' | 'remove' } | null>(null)
  let installing = $state<SkillTarget | null>(null)
  /** A row whose last install failed, with why. */
  let failed = $state<{ target: SkillTarget; message: string } | null>(null)
  /** Chat apps whose file was saved or instructions copied on this visit: their steps are under way. */
  let started = $state<Partial<Record<ChatApp, string>>>({})
  /** The app set up most recently on this visit, which Try it talks about. */
  let latest = $state<AiApp | null>(null)
  /** When an app was set up on this visit: from then on the page watches for a new note. */
  let watchingSince = $state<number | null>(null)
  let copied = $state('')

  const refresh = async () => {
    info = await skillTargets()
  }

  onMount(() => {
    void markAiPageSeen()
    attempt(refresh)
  })

  const PROMPTS = [
    'Create an Oversay note for my catch-up with Sam tomorrow: the Q4 hiring plan, her promotion case, and the offsite.',
    'Here’s some Markdown, add it to my Weekly standup note in Oversay.',
    'Create talking points for my stand-up today in Oversay: one topic per project, timed 3, 4 and 5 minutes, plus a 1-minute intro. Add the timeline.',
    'Open my catch-up with Sam note in Oversay and show it on screen.',
  ]

  const CHAT_LABELS: Record<ChatApp, { name: string; ask: string; abbr: string; line: string; works: string }> = {
    'claude-app': {
      name: 'Claude app and Cowork',
      ask: 'Claude',
      abbr: 'C',
      line: 'Cowork makes notes in Oversay. Chat gives you a note file.',
      works: 'Claude on the web, the desktop app and phones, and Cowork.',
    },
    'gemini-app': {
      name: 'Gemini app',
      ask: 'Gemini',
      abbr: 'G',
      line: 'Gives you a note file to drop on Oversay.',
      works: 'gemini.google.com, and the Gemini app on the Mac and phones.',
    },
    chatgpt: {
      name: 'ChatGPT',
      ask: 'ChatGPT',
      abbr: 'GPT',
      line: 'Gives you Markdown to paste as a note.',
      works: 'ChatGPT on the web, the desktop app and phones.',
    },
  }

  const GET_AI = [
    { name: 'Claude', abbr: 'C', cls: 'claude-app', url: 'https://claude.ai/download' },
    { name: 'ChatGPT', abbr: 'GPT', cls: 'chatgpt', url: 'https://chatgpt.com/download' },
    { name: 'Gemini', abbr: 'G', cls: 'gemini', url: 'https://gemini.google/desktop/' },
  ]

  const added = $derived(addedChatApps($settings.aiAdded))
  const plan = $derived(info ? planAiPage(info, added) : null)
  const isReady = (app: AiApp) => plan?.ready.includes(app) ?? false
  // Chat apps given an older skill than this Oversay carries: Ready, but saved again to update.
  const toUpdate = $derived(info ? chatAppsToUpdate($settings.aiAdded, info.bundledVersion) : [])
  const current = (app: ChatApp) => isReady(app) && !toUpdate.includes(app)
  // Copies Oversay updated itself when it started, until the line is closed.
  let updatedSeen = $state(false)
  /** Try it talks about the app set up last on this visit, else the first one Ready. */
  const tryApp = $derived(latest && plan?.ready.includes(latest) ? latest : (plan?.ready[0] ?? null))

  const arrived = $derived(
    watchingSince === null ? null : (($decks ?? []).filter((n) => $freshPaths.has(n.path) && n.modifiedMs >= watchingSince!).sort((a, b) => b.modifiedMs - a.modifiedMs)[0] ?? null),
  )

  const anyUpdate = $derived(info?.targets.some((t) => skillState(t, info!.bundledVersion) === 'update') ?? false)

  const targetOf = (id: SkillTarget) => info!.targets.find((t) => t.id === id)!
  const isTarget = (app: AiApp): app is SkillTarget => app in TARGET_LABELS
  const appName = (app: AiApp) => (isTarget(app) ? TARGET_LABELS[app].name : CHAT_LABELS[app].name)
  /** Found apps reading the same copy as `id`, which Remove takes from them too. */
  const sharedWith = (id: SkillTarget) => sharing(info!.targets, id).filter((o) => targetOf(o).found)

  function toggle(app: AiApp) {
    open = { ...open, [app]: !open[app] }
  }

  function settled(app: AiApp) {
    latest = app
    watchingSince ??= Date.now()
  }

  async function install(target: SkillTarget) {
    confirming = null
    failed = null
    installing = target
    logAction('install skill', target)
    try {
      await installSkill(target)
      settled(target)
    } catch (e) {
      failed = { target, message: e instanceof Error ? e.message : String(e) }
    }
    installing = null
    await refresh()
  }

  function updateAll() {
    attempt(async () => {
      for (const t of info?.targets ?? []) if (skillState(t, info!.bundledVersion) === 'update') await install(t.id)
    })
  }

  function remove(target: SkillTarget) {
    confirming = null
    logAction('remove skill', target)
    attempt(async () => {
      await removeSkill(target)
      await refresh()
    })
  }

  function copy(text: string) {
    attempt(async () => {
      await navigator.clipboard.writeText(text)
      copied = text
      setTimeout(() => (copied = copied === text ? '' : copied), 1500)
    })
  }

  /** Saves the skill to upload, where the person chooses, and shows the file; then the row's steps. */
  function saveZip(kind: ZipKind, app: ChatApp) {
    attempt(async () => {
      const name = kind === 'claude-plugin' ? 'oversay-plugin.zip' : 'oversay-skill.zip'
      const path = await save({ defaultPath: name, filters: [{ name: 'Zip', extensions: ['zip'] }] })
      if (!path) return
      logAction('save skill zip', kind)
      await saveSkillZip(kind, path)
      started = { ...started, [app]: path.split(/[/\\]/).pop() ?? name }
      open = { ...open, [app]: true }
    })
  }

  /** The Claude app takes a marketplace address, so there is no file to save (ADR 0049). */
  function copyMarketplace() {
    const address = marketplaceAddress()
    copy(address)
    started = { ...started, 'claude-app': address }
    open = { ...open, 'claude-app': true }
  }

  function copyInstallPrompt(id: 'claude-code' | 'codex') {
    logAction('copy install prompt', id)
    copy(id === 'codex' ? codexInstallPrompt() : claudeCodeInstallPrompt())
  }

  function copyInstructions() {
    copy(chatInstructions(info?.bundledVersion ?? ''))
    started = { ...started, chatgpt: 'instructions' }
    open = { ...open, chatgpt: true }
  }

  function markAdded(app: ChatApp, yes: boolean) {
    attempt(async () => {
      await setChatAppAdded(app, yes, info?.bundledVersion ?? '')
      if (yes) {
        settled(app)
        open = { ...open, [app]: false }
        started = Object.fromEntries(Object.entries(started).filter(([k]) => k !== app))
      }
    })
  }

  function show(path: string, name: string) {
    attempt(async () => {
      await markOpened('deck', path)
      await showDeckOnScreen(parseNoteDoc(await readQuickFile('decks', path)), name, path)
    })
  }

  function getAi(name: string, url: string) {
    logAction('get an ai', name)
    attempt(() => openUrl(url))
  }
</script>

{#snippet prompt(p: string)}
  <div class="chip">
    <span class="grow">{p}</span>
    <button class="icon" title={copied === p ? 'Copied' : 'Copy'} aria-label="Copy" onclick={() => copy(p)}><Icon name={copied === p ? 'check' : 'copy'} size={15} /></button>
  </div>
{/snippet}

{#snippet ready()}
  <span class="pill ok"><Icon name="check" size={13} /> Ready</span>
{/snippet}

{#snippet head(app: AiApp, abbr: string, name: string, line: string, direct: boolean)}
  <button class="toggle" aria-expanded={!!open[app]} onclick={() => toggle(app)}>
    <span class="logo {app}">{abbr}</span>
    <span class="nm">
      <span class="name">{name}</span>
      <span class="line"><span class="dot" class:direct></span>{line}</span>
    </span>
  </button>
{/snippet}

{#snippet chev(app: AiApp)}
  <button class="icon chev" class:open={open[app]} aria-label={open[app] ? 'Hide details' : 'Details'} aria-expanded={!!open[app]} onclick={() => toggle(app)}
    ><Icon name="chevron" size={16} /></button
  >
{/snippet}

{#snippet targetRow(id: SkillTarget)}
  {@const t = targetOf(id)}
  {@const copyState = skillState(t, info!.bundledVersion)}
  {@const state = (copyState === 'installed' || copyState === 'update') && !isReady(id) ? 'no-app' : copyState}
  {@const shared = sharedWith(id)}
  {@const label = TARGET_LABELS[id]}
  <div class="arow">
    <div class="arow-h">
      {@render head(id, label.abbr, label.name, 'Makes notes straight into Oversay.', true)}
      <div class="acts">
        {#if confirming?.target === id}
          <span class="ask"
            >{confirming.action === 'replace' ? 'Replace the copy there?' : 'Move it to the Trash?'}{shared.length && confirming.action === 'remove'
              ? ` ${shared.map((o) => TARGET_LABELS[o].name).join(' and ')} use${shared.length === 1 ? 's' : ''} it too.`
              : ''}</span
          >
          <button onclick={() => (confirming = null)}>Cancel</button>
          <button class="primary" onclick={() => (confirming?.action === 'replace' ? install(id) : remove(id))}>{confirming.action === 'replace' ? 'Replace' : 'Remove'}</button>
        {:else if installing === id}
          <button class="primary" disabled><span class="spin"></span> Installing…</button>
        {:else if state === 'installed'}
          {@render ready()}
          <button onclick={() => (confirming = { target: id, action: 'remove' })}>Remove</button>
        {:else if state === 'update'}
          <span class="pill warn">Update available</span>
          <button class="primary" onclick={() => (confirming = { target: id, action: 'replace' })}>Update</button>
        {:else if state === 'no-app'}
          <span class="pill off">App not found</span>
          <button onclick={() => install(id)}><Icon name="saveas" size={15} /> Install anyway</button>
        {:else}
          <button class="primary" onclick={() => install(id)}><Icon name="saveas" size={15} /> Install</button>
        {/if}
        {@render chev(id)}
      </div>
    </div>
    {#if failed?.target === id}
      <p class="error">
        Not installed: {failed.message}. To do it by hand, copy the folder <code>{info!.bundledDir}</code> into <code>{t.dir.replace(/[/\\]oversay$/, '')}</code>.
      </p>
    {/if}
    {#if open[id]}
      <div class="arow-b">
        <p>{label.where}.</p>
        {#if state === 'installed' || state === 'update'}
          <p>In <code>{t.dir}</code>{state === 'update' ? `, version ${t.installedVersion}; this Oversay carries ${info!.bundledVersion}` : ''}. The skill comes with Oversay and is updated with it.</p>
          <p><button class="link" onclick={() => attempt(() => revealSkill(id))}>Show in Finder</button></p>
        {:else}
          <p>Install copies the skill to <code>{t.dir}</code>. Start a new {label.name} session afterwards.</p>
        {/if}
        {#if id === 'claude-code'}
          <p>Or have Claude Code install it from the plugin marketplace, which can update with each release: <button class="link" onclick={() => copyInstallPrompt('claude-code')}>{copied === claudeCodeInstallPrompt() ? 'Copied' : 'Copy the install prompt'}</button>, and paste it into Claude Code.</p>
          <p>If you also add the plugin to your Claude account or from the marketplace, you will have it twice in Claude Code: keep one (<code>/plugin</code>).</p>
        {/if}
        {#if sharing(info!.targets, id).length}
          <p>{sharing(info!.targets, id).map((o) => TARGET_LABELS[o].name).join(' and ')} reads the same copy, so installing for one installs for both.</p>
        {/if}
        {#if id === 'codex'}
          <p>Or have Codex install it from the plugin marketplace: <button class="link" onclick={() => copyInstallPrompt('codex')}>{copied === codexInstallPrompt() ? 'Copied' : 'Copy the install prompt'}</button>, and paste it into Codex. It is a second copy beside this one: keep one.</p>
        {/if}
        {#if id === 'gemini-cli'}
          <p>Antigravity CLI reads <code>.agents/skills</code> in a project; whether it reads this copy in your home folder isn’t confirmed yet.</p>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

{#snippet stepText(app: ChatApp, i: number)}
  {#if app === 'claude-app'}
    {#if i === 0}{#if started[app]}Copied <code>{started[app]}</code>.{:else}Copy the marketplace address.{/if}
    {:else if i === 1}In Claude, open <b>Customize › Plugins › Add › Add marketplace</b>, paste it, and install Oversay.
    {:else}For Cowork, let the task work in <code>Documents/Oversay</code>.{/if}
  {:else if app === 'gemini-app'}
    {#if i === 0}{#if started[app]}Saved <code>{started[app]}</code>; it’s shown in Finder.{:else}Save the skill.{/if}
    {:else if i === 1}In Gemini, open <b>Customize › Skills › Create › Upload</b> and choose it.
    {:else}Ask for a note, download it, and drop it on this window.{/if}
  {:else if i === 0}{started[app] ? 'Copied the instructions.' : 'Copy the instructions.'}
  {:else if i === 1}Paste them into a Project’s instructions, or <b>Settings › Personalization › Custom instructions</b>.
  {:else}Copy the note ChatGPT writes, then <b>New deck from the clipboard</b> in the command bar (⌘⇧V).{/if}
{/snippet}

{#snippet steps(app: ChatApp)}
  {@const done = !!started[app] || current(app)}
  <ol class="steps">
    {#each [0, 1, 2] as i (i)}
      {@const tick = (done && i === 0) || current(app)}
      <li><span class="n" class:tick>{#if tick}<Icon name="check" size={12} />{:else}{i + 1}{/if}</span><span>{@render stepText(app, i)}</span></li>
    {/each}
  </ol>
  {#if started[app] && !current(app)}
    <div class="added">
      <button class="primary" onclick={() => markAdded(app, true)}><Icon name="check" size={15} /> {toUpdate.includes(app) ? 'I’ve updated it' : 'I’ve added it'}</button>
      <span class="faint">Oversay can’t see inside your {CHAT_LABELS[app].ask} account, so tell it when you’re done.</span>
    </div>
  {/if}
{/snippet}

{#snippet chatRow(app: ChatApp)}
  {@const label = CHAT_LABELS[app]}
  <div class="arow">
    <div class="arow-h">
      {@render head(app, label.abbr, label.name, label.line, false)}
      <div class="acts">
        {#if toUpdate.includes(app) && !started[app]}
          <span class="pill warn">Update available</span>
        {/if}
        {#if current(app)}
          {@render ready()}
          <button onclick={() => markAdded(app, false)}>Undo</button>
        {:else if app === 'gemini-app'}
          <button onclick={() => saveZip('skill', app)}><Icon name={started[app] ? 'check' : 'saveas'} size={15} /> {started[app] ? 'Saved' : 'Save skill…'}</button>
        {:else if app === 'claude-app'}
          <button onclick={copyMarketplace}><Icon name={started[app] ? 'check' : 'copy'} size={15} /> {started[app] ? 'Copied' : 'Copy marketplace address'}</button>
        {:else}
          <button onclick={copyInstructions}><Icon name={started[app] ? 'check' : 'copy'} size={15} /> {started[app] ? 'Copied' : 'Copy instructions'}</button>
        {/if}
        {@render chev(app)}
      </div>
    </div>
    {#if open[app]}
      <div class="arow-b">
        <p>{label.works}</p>
        {#if app === 'claude-app'}
          {@render steps(app)}
          <ul>
            <li>The plugin is kept on your Claude account, so it reaches chat, Cowork and Claude Code.</li>
            <li>Chat runs away from your computer: it gives you the note to download. Drop it on Oversay’s window.</li>
            <li>No marketplace? <button class="link" onclick={() => saveZip('claude-plugin', app)}>Save the plugin as a file</button> for Add › Upload plugin, or <button class="link" onclick={() => saveZip('skill', app)}>the skill alone</button> for Customize › Skills.</li>
          </ul>
        {:else if app === 'gemini-app'}
          {@render steps(app)}
          <ul>
            <li>Uploading works on the web and in the Mac app. It needs a personal Google account, age 18 or over, with Keep Activity on.</li>
            <li>Gemini chat can’t write files on this computer, so it gives you the note to download.</li>
            <li>Gemini Spark in the Mac app can work in folders you link; it hasn’t been tried with Oversay yet.</li>
          </ul>
        {:else}
          {@render steps(app)}
          <ul>
            <li>ChatGPT chat can’t reach files on this computer. For notes that land by themselves, use Codex, in the same desktop app.</li>
            <li>If your plan has skills, <button class="link" onclick={() => saveZip('skill', app)}>save the skill</button> and add it there.</li>
          </ul>
        {/if}
      </div>
    {/if}
  </div>
{/snippet}

{#snippet tryCard(app: AiApp)}
  <div class="card try">
    <div class="try-h">
      <span class="pill ok"><Icon name="check" size={13} /> Ready in {plan!.ready.map(appName).join(', ')}</span>
      <h2>Try it: {isTarget(app) ? `start a new ${appName(app)} session and ask` : `open ${CHAT_LABELS[app].ask} and ask`}</h2>
    </div>
    {#each PROMPTS as p (p)}{@render prompt(p)}{/each}
    {#if app === 'chatgpt'}
      <p class="meta">Copy the note it writes, then New deck from the clipboard in the command bar (⌘⇧V).</p>
    {:else if app === 'claude-app' || app === 'gemini-app'}
      <p class="meta">In a chat, download the note it gives you and drop it on this window.</p>
    {/if}
    {#if arrived}
      <div class="watch arrived">
        <Icon name="check" size={16} />
        <span class="grow">Your first AI note arrived: <b>{arrived.name}</b></span>
        <button onclick={() => goDeck(arrived.path)}>Open it</button>
        <button class="primary" disabled={showBlockedBy($session) !== null} onclick={() => show(arrived.path, arrived.name)}><Icon name="show" size={15} /> Show</button>
      </div>
    {:else if watchingSince !== null}
      <div class="watch"><span class="spin"></span>Waiting for your first note. It shows up in Decks, even if Oversay is closed.</div>
    {/if}
  </div>
{/snippet}

<div class="page">
  <h1>AI apps</h1>
  {#if !tryApp}<p class="lead">Ask your AI for a note and it shows up in Oversay.</p>{/if}

  {#if info?.updated.length && !updatedSeen}
    <div class="banner">
      <Icon name="check" size={16} />
      <span class="grow">Oversay updated its skill in {info.updated.map((id) => TARGET_LABELS[id].name).join(' and ')} to {info.bundledVersion}. Start a new session there to use it.</span>
      <button class="x" title="Close" aria-label="Close" onclick={() => (updatedSeen = true)}><Icon name="close" size={15} /></button>
    </div>
  {/if}
  {#if toUpdate.length}
    <div class="banner warn">
      <Icon name="saveas" size={16} />
      <span class="grow">Your skill in {toUpdate.map((a) => CHAT_LABELS[a].ask).join(' and ')} is older than this Oversay. Save it again and replace it there to get what’s new.</span>
    </div>
  {/if}
  {#if anyUpdate}
    <div class="banner warn">
      <Icon name="saveas" size={16} />
      <span class="grow">Oversay was updated. Update the skill too, so your AI writes notes the way this Oversay reads them.</span>
      <button class="primary" onclick={updateAll}>Update all</button>
    </div>
  {/if}

  {#if plan}
    {#if tryApp}{@render tryCard(tryApp)}{/if}

    {#if plan.noAiFound}
      <div class="card noai">
        <Icon name="info" size={22} />
        <div class="grow">
          <h2>No AI apps found on this computer</h2>
          <p class="meta">Oversay doesn’t come with an AI. It works with the one you use. If you don’t use one yet, get one first, then come back here.</p>
          <div class="get">
            {#each GET_AI as g (g.name)}
              <button onclick={() => getAi(g.name, g.url)}><span class="logo xs {g.cls}">{g.abbr}</span> Get {g.name}</button>
            {/each}
            <button class="ghost" onclick={() => attempt(refresh)}>Look again</button>
          </div>
          <p class="meta">Already chat with one in your browser? That works too: pick it below.</p>
        </div>
      </div>
    {/if}

    {#snippet tools()}
      <h3 class="sec">Terminal and coding tools</h3>
      <div class="rows">
        {#if plan!.showTools || showAway}
          {#each [...plan!.here, ...plan!.away] as id (id)}{@render targetRow(id)}{/each}
        {:else}
          {@const names = SKILL_TARGETS.map((id) => TARGET_LABELS[id].name).join(', ')}
          <button class="arow folded" onclick={() => (showAway = true)}>
            <span class="grow">{names}: for people who work in a terminal</span>
            <span class="faint">Show</span>
          </button>
        {/if}
      </div>
    {/snippet}
    {#snippet chats()}
      <h3 class="sec">Chat and desktop apps</h3>
      <div class="rows">
        {#each plan!.chatApps as app (app)}{@render chatRow(app)}{/each}
      </div>
    {/snippet}
    {@render chats()}{@render tools()}

    {#if !tryApp}
      <h3 class="sec">Try it</h3>
      <p class="meta">Once Oversay is in your AI, ask it something like:</p>
      {#each showAllPrompts ? PROMPTS : PROMPTS.slice(0, 1) as p (p)}{@render prompt(p)}{/each}
      <button class="more" aria-expanded={showAllPrompts} onclick={() => (showAllPrompts = !showAllPrompts)}>
        <Icon name="chevron" size={14} />
        {showAllPrompts ? 'Fewer' : 'More things to ask'}
      </button>
    {/if}
  {/if}
</div>

<style>
  .page {
    max-width: 860px;
    margin: 0 auto;
    padding: 22px 32px 48px;
    container-type: inline-size;
  }

  .lead {
    color: var(--muted);
    font-size: 15px;
    margin: 6px 0 0;
  }

  h2 {
    font-size: 17px;
    font-weight: 650;
    letter-spacing: normal;
    text-transform: none;
    color: var(--text);
    margin: 0;
  }

  .sec {
    font-size: 12px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
    margin: 24px 0 8px;
    font-weight: 650;
  }

  .card {
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--card);
    padding: 14px 16px;
    margin-top: 16px;
  }

  .try {
    border-color: color-mix(in srgb, var(--accent) 35%, transparent);
    background: color-mix(in srgb, var(--accent-soft) 45%, var(--card));
  }

  .try-h {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .try-h h2 {
    flex: 1;
    min-width: 200px;
  }

  .noai {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    border-color: color-mix(in srgb, var(--warn) 35%, transparent);
    background: color-mix(in srgb, var(--warn-bg) 55%, var(--card));
  }

  .noai > :global(svg) {
    color: var(--warn);
    flex: none;
    margin-top: 2px;
  }

  .get {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
  }

  .rows {
    border: 1px solid var(--line);
    border-radius: 14px;
    background: var(--card);
    overflow: hidden;
  }

  .arow + .arow {
    border-top: 1px solid var(--line);
  }

  .arow-h {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px 8px 4px;
  }

  .toggle {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    border: 0;
    background: none;
    text-align: left;
    padding: 4px 8px;
    border-radius: 10px;
  }

  .toggle:hover {
    background: var(--hover);
  }

  .nm {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .name {
    font-weight: 650;
    font-size: 15px;
  }

  .line {
    font-weight: 400;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    color: var(--muted);
  }

  .line .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
    background: var(--warn);
  }

  .line .dot.direct {
    background: var(--ok);
  }

  .acts {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .chev :global(svg) {
    transform: rotate(-90deg);
    transition: transform 0.15s;
  }

  .chev.open :global(svg) {
    transform: none;
  }

  .arow.folded {
    display: flex;
    width: 100%;
    gap: 8px;
    border: 0;
    border-radius: 0;
    background: none;
    text-align: left;
    color: var(--muted);
    font-weight: 400;
    padding: 12px 16px 12px 66px;
  }

  .arow.folded:not(:first-child) {
    border-top: 1px solid var(--line);
  }

  .arow.folded:hover {
    background: var(--hover);
  }

  .arow-b {
    padding: 0 16px 14px 66px;
    font-size: 13.5px;
    color: var(--muted);
  }

  .arow-b p {
    margin: 0 0 6px;
    overflow-wrap: anywhere;
  }

  .arow-b ul {
    margin: 8px 0 0;
    padding-left: 18px;
  }

  .arow-b li {
    margin: 3px 0;
  }

  .arow-b :global(b) {
    color: var(--text);
  }

  .steps {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  .steps li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }

  .n {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent-text);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    flex: none;
  }

  .n.tick {
    background: var(--ok-bg);
    color: var(--ok);
  }

  .added {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 12px;
    font-size: 12.5px;
  }

  .logo {
    width: 40px;
    height: 40px;
    border-radius: 11px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font: 700 13px/1 ui-monospace, Menlo, monospace;
    color: #fff;
    flex: none;
  }

  .logo.xs {
    width: 20px;
    height: 20px;
    border-radius: 6px;
    font-size: 8.5px;
  }

  .logo.claude-code {
    background: #c15f3c;
  }

  .logo.codex {
    background: #111;
  }

  .logo.gemini-cli {
    background: linear-gradient(135deg, #4285f4, #9b72cb);
  }

  .logo.gemini-app {
    background: linear-gradient(135deg, #1a73e8, #a142f4 70%, #e8710a);
  }

  .logo.claude-app {
    background: #d97757;
  }

  .logo.chatgpt {
    background: #10a37f;
  }

  .logo.gemini {
    background: linear-gradient(135deg, #1a73e8, #a142f4 70%, #e8710a);
  }

  .meta {
    font-size: 13px;
    color: var(--muted);
    margin: 8px 0 0;
  }

  .faint {
    color: var(--faint);
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 99px;
    padding: 2px 9px;
    white-space: nowrap;
  }

  .pill.ok {
    background: var(--ok-bg);
    color: var(--ok);
  }

  .pill.warn {
    background: var(--warn-bg);
    color: var(--warn);
  }

  .pill.off {
    background: var(--side);
    color: var(--muted);
  }

  .ask {
    font-size: 13px;
    color: var(--muted);
  }

  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  button.ghost {
    border-color: transparent;
    background: none;
    color: var(--accent-text);
  }

  button.icon {
    border: 0;
    background: none;
    padding: 4px;
    color: var(--muted);
  }

  button.link {
    display: inline;
    border: 0;
    background: none;
    padding: 0;
    color: var(--accent-text);
    font-size: inherit;
    text-decoration: underline;
  }

  .more {
    border: 0;
    background: none;
    padding: 4px 0;
    margin-top: 8px;
    color: var(--accent-text);
    font-weight: 550;
  }

  .more :global(svg) {
    transform: rotate(-90deg);
  }

  .more[aria-expanded='true'] :global(svg) {
    transform: none;
  }

  .error {
    font-size: 13px;
    margin: 0 16px 12px 66px;
    overflow-wrap: anywhere;
  }

  .banner {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin: 14px 0 0;
    padding: 10px 14px;
    border-radius: 12px;
  }

  .banner:not(.warn) {
    background: var(--accent-soft);
  }

  .banner .x {
    border: 0;
    background: none;
    padding: 4px;
    color: var(--muted);
  }

  .banner.warn {
    background: var(--warn-bg);
    border: 1px solid color-mix(in srgb, var(--warn) 35%, transparent);
  }

  .grow {
    flex: 1;
    min-width: 0;
  }

  .chip {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    border: 1px dashed var(--line-strong);
    border-radius: 10px;
    padding: 8px 10px;
    margin-top: 8px;
    font-size: 13.5px;
    background: var(--card);
  }

  .watch {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    background: var(--side);
    font-size: 13.5px;
  }

  .watch.arrived {
    background: var(--ok-bg);
  }

  .spin {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: 2px solid color-mix(in srgb, currentColor 30%, transparent);
    border-top-color: currentColor;
    animation: spin 1s linear infinite;
    flex: none;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation: none;
    }
  }

  @container (max-width: 560px) {
    .arow-b,
    .arow.folded {
      padding-left: 16px;
    }
  }
</style>
