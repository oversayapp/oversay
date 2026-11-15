// The manager window's title (012/02): which project, and which talk, is open, so it shows in
// the window switcher and the dock as well as in the app.

export function windowTitle(projectName: string | null, talkName: string | null, unsaved: boolean): string {
  if (projectName === null) return 'Oversay'
  const talk = talkName ? ` — ${talkName}` : ''
  return `${projectName}${talk}${unsaved ? ' (unsaved)' : ''} – Oversay`
}
