// Where a note or quick talk went when it became a deck: its name, in the Decks folder
// beside Quick notes. Old links, arrivals and favourites find the deck by it.

/** `…/Quick notes/Standup.md` or `…/Quick talks/Demo.oversay.json` → `…/Decks/Standup.md`. */
export function deckPathFor(path: string): string {
  return path.replace(/([\\/])(Quick notes|Quick talks)([\\/])([^\\/]+?)(\.oversay\.json|\.md)$/i, '$1Decks$3$4.md')
}
