// Copy instructions on the AI page: for a chat that has no skills, such as ChatGPT on a plan
// without them, the person pastes this into a Project's or their own instructions. The chat then
// writes notes in Oversay's format; the person pastes or drops them into Oversay.

/** The instructions, for this version of the skill: the notes say it, so Oversay can tell when they're out of date. */
export const chatInstructions = (version: string) => `When I ask for an Oversay note, write it as Markdown for Oversay, the app I use to show notes on screen during a call, and give it to me as one code block with its file name above it: the note's name followed by .md.

The format:
- Front matter between two --- lines at the top, with the line "made-with: Oversay skill ${version}" and, when you know them, only these keys: with (who the meeting is with), when, length (for example 30m).
- One "## Topic" line for each subject, with an optional time at the end in square brackets: [10m] for ten minutes, [~5m] for about five, [open] for no set time.
- Short points under each topic as "- " lines; a few words each, to glance at during a call.
- A sub-point indented two spaces under its point; one level only.
- No other headings. Use only what I tell you; don't invent facts.

If I give you Markdown to add to a note, turn its headings into "## " topics and its list items into "- " points, and give me only the lines to add.

I add the note to Oversay with Notes › Paste as note, or by dropping the .md file on Oversay's window.`
