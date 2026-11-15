---
status: accepted
date: 2026-10-21
---

# The waveform: a Timeline style with a dark and a light look

John asked for a conceptual, minimalist overlay look on 16 Oct: a thick white border like an alert, on a black panel, crisp and modern. Three design rounds settled the look:

- the minimal look mockup;
- then its sine wave round.

The result is white only on solid black, with the talk drawn as a sine wave that is cancelled as the talk goes. It applies to the Timeline and Talking Points.

It was first built as a Panel choice, "Minimal", beside Dark and Light, and it redrew style A (the square wave). John corrected that on 21 Oct: the waveform and the square wave are two different layouts, and each should have its own dark and light look.

## Decision

- **The waveform is a Timeline style of its own: A · Waveform, first and the default.**
  - The square wave is kept as **B · Blocks**. Its saved id stays `wave`.
  - The other styles move down a letter: C edge strip, D clock card, E side rail, F one card.
- **Panel is Dark or Light again, and now reaches the Timeline.**
  - The waveform and the blocks each have a dark and a light look.
  - The waveform's light look is the exact inverse of its dark one: black on white, in a black frame.
  - The blocks' light look is Talking Points' light panel, with the app's light-theme kind colours.
  - Styles C to F keep the dark look for now.
- **Talking Points takes the waveform's look when the waveform is chosen**, dark or light. With any other style it keeps its own dark or light panel.
- **One ink on one paper.** The waveform draws with two colours given as RGB: `--ink` and `--paper` in `overlay.css`, white and black. `.ink-light` swaps them, so one set of rules draws both looks.
- **No kind colours in the waveform.**
  - Segment kinds are told by the wave's pattern.
  - States are told by shape, words, and ink on paper.
  - One signal colour shows only as a segment reaches its end: in the last 30 seconds and on overrun.
- **Solid by default; never below 50% with the waveform.**
  - Choosing the waveform makes the panels solid.
  - The opacity then goes no lower than 50%. The other styles keep 40%.
- **Everyone moves to the waveform once.**
  - Oversay isn't released, so a saved style is moved to the waveform and made solid the first time.
  - The panel stays Dark or Light. A panel saved as Minimal (the first try) is read as Dark.
  - A `waveformMoved` mark in `settings.json` makes the move happen once and replaces the first try's `minimalMoved`.

## Consequences

- The waveform has its own window frame (layout `waveform`), the same size and place as the blocks, so each remembers where it was put.
- With the Light panel, styles C to F look different from A, B and Talking Points. They may take a light look later.
- Someone who chose another style before this change sees the waveform once and has to choose their style again.

*Changed by ADR 0036: decks of flashcards replace the Timeline styles; the waveform look stays for the flashcard widget and the waveform timeline widget.*
