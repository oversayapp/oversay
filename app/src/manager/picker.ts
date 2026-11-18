// The template picker (epic 036 (#54)): the Templates page in a dialog, opened from + New, the command bar,
// Home and the Library's empty state. `workspace` is the workspace the new deck goes into, when asked for
// while looking at one.
import { writable } from 'svelte/store'

export interface PickerState {
  open: boolean
  /** The workspace's id the deck made goes into. */
  workspace?: string
}

export const picker = writable<PickerState>({ open: false })

export const openTemplatePicker = (workspace?: string) => picker.set({ open: true, workspace })
export const closeTemplatePicker = () => picker.set({ open: false })
