<script lang="ts">
  import Icon from './Icon.svelte'
  import { updateAvailable } from '../lib/updates/store'
  import { settings } from '../lib/settings/store'
  import { goAi, goDecks, goHome, goSessions, goSettings, goTemplates, goWorkspaces, nav as screen } from './route'
</script>

<nav class="rail" aria-label="Main">
  <button aria-current={$screen.view === 'home' ? 'page' : undefined} onclick={goHome}>
    <Icon name="home" size={22} /><span>Home</span>
  </button>
  <!-- Decks replace Notes and Talks (epic #214, ADR 0036, #225): their files are moved in. -->
  <button aria-current={$screen.view === 'decks' ? 'page' : undefined} onclick={goDecks}>
    <Icon name="deck" size={22} /><span>Decks</span>
  </button>
  <!-- Workspaces take the place of projects (ADR 0039): every workspace, by tag (ADR 0040). -->
  <button aria-current={$screen.view === 'workspaces' ? 'page' : undefined} onclick={goWorkspaces}>
    <Icon name="folder" size={22} /><span>Workspaces</span>
  </button>
  <button aria-current={$screen.view === 'templates' ? 'page' : undefined} onclick={goTemplates}>
    <Icon name="template" size={22} /><span>Templates</span>
  </button>
  <!-- Every deck's runs, by day (ADR 0041, #290). -->
  <button aria-current={$screen.view === 'sessions' ? 'page' : undefined} onclick={goSessions}>
    <Icon name="session" size={22} /><span>Sessions</span>
  </button>
  <!-- The AI page (#156): New until it is first opened. -->
  <button aria-current={$screen.view === 'ai' ? 'page' : undefined} onclick={goAi}>
    <Icon name="ai" size={22} /><span>AI</span>{#if !$settings.aiPageSeen}<span class="new">New</span>{/if}
  </button>
  <div class="spacer"></div>
  <!-- Only while an update has been found: it opens Settings › Updates (epic #16). -->
  {#if $updateAvailable}
    <button class="update" onclick={() => goSettings('updates')}>
      <Icon name="arrow" size={22} /><span>Update</span>
    </button>
  {/if}
  <button aria-current={$screen.view === 'settings' ? 'page' : undefined} onclick={() => goSettings()}>
    <Icon name="gear" size={22} /><span>Settings</span>
  </button>
</nav>

<style>
  .rail {
    width: 72px;
    flex: none;
    background: var(--rail);
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px 0;
    gap: 4px;
  }

  .spacer {
    flex: 1;
  }

  button {
    width: 58px;
    border: 0;
    background: none;
    border-radius: 12px;
    padding: 8px 0 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 400;
    color: var(--muted);
    position: relative;
  }

  button[aria-current='page'] {
    background: var(--card);
    color: var(--accent-text);
    box-shadow: 0 1px 3px rgba(20, 30, 60, 0.12);
  }

  .update {
    color: var(--accent-text);
  }

  .new {
    position: absolute;
    top: 2px;
    right: 2px;
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    background: var(--accent);
    color: var(--on-accent);
    border-radius: 6px;
    padding: 0 4px;
  }
</style>
