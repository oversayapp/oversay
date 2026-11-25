// Where the person left Sessions: the chips, the grouping and how many runs were showing, kept while
// they open a session and come back, so "back" returns to the same list (design sessions-v2, option 3).
// Not saved: a fresh start of Oversay opens on All.

import { writable } from 'svelte/store'
import { NO_BROWSE, PAGE_RUNS, type BrowseFilters, type GroupMode } from './browse'

export interface SessionsPageState {
  filters: BrowseFilters
  group: GroupMode
  /** How many runs are listed; "Show more" adds a page. */
  limit: number
}

export const START_STATE: SessionsPageState = { filters: NO_BROWSE, group: 'recent', limit: PAGE_RUNS }

export const sessionsPage = writable<SessionsPageState>({ ...START_STATE })

/** The list showing every run again: no filters, its first page, grouped as it was. */
export const withEveryRun = (s: SessionsPageState): SessionsPageState => ({ ...s, filters: NO_BROWSE, limit: PAGE_RUNS })
