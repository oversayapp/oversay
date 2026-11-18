# Workspaces

How Oversay groups decks (ADR 0040). A **workspace** is a group of decks for one project, one day of a course, or one talk someone is preparing: a folder in Oversay's Workspaces folder holding `workspace.json` and `resources/`. A workspace lists its decks **by id**: decks stay in the Decks folder, so one deck can be in several workspaces, or in none. **Tags** group workspaces: `Research`, `Tutorials`, `Projects`.

```text
Workspaces/
  AppSec June 2026/           a workspace: a folder named for it
    workspace.json
    resources/                Oversay's; leave it alone
  Svelte 5 basics/
    workspace.json
```

A workspace holds only its own files: never a deck's folder, and never another workspace.

## workspace.json

```json
{
  "version": 1,
  "name": "AppSec June 2026",
  "tags": ["Conferences"],
  "decks": ["d_k3x9a2bq", "d_7mq2xw4f"],
  "when": "2026-06-02",
  "where": "Zoom",
  "notes": "Panel with Ana and Raj"
}
```

| Key | What it is |
| - | - |
| `version` | Always `1`. |
| `id` | What Oversay knows the workspace by (`w_4hx8m2qa`). Oversay writes it when it first sees the workspace: never write, change or copy one. |
| `name` | The workspace's name, as the person said it. |
| `tags` | Words that group it with other workspaces, as the person said them but with an initial capital: `["Research"]`. `[]` when they gave none. |
| `decks` | The ids of its decks, in the order the person wants them: each the `id:` in a deck's front matter (`d_` and 8 letters or digits). Never a deck's name or path. |
| `when` | Only when the person gave a date: `YYYY-MM-DD`. |
| `where` | Only when the person said: a place or a link, as they wrote it. |
| `notes` | Only when the person gave some: a few lines of plain text. |

Leave out `when`, `where` and `notes` when the person said nothing for them. In a file Oversay wrote, keep every key you weren't asked to change, and its order.

## A workspace's folder name

The workspace's name with the characters a folder can't hold taken out, as for a deck (references/note-format.md), but **with no date**: `AppSec June 2026`. When a folder of that name is already in Workspaces, add ` (2)`, ` (3)`… Never use a folder that is already there.

<!-- generated: make skills writes everything below this line from Oversay's code; don't edit it -->

## Generated from Oversay’s code

**File:** `workspace.json`, `"version": 1`.

**Keys, in the order Oversay writes them:** `version`, `id`, `name`, `tags`, `decks`, `when`, `where`, `notes`. Any other key is kept as it is.
<!-- end generated -->
